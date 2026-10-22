import type { TextMessageKey } from "@/locales/message-types";
import { useAiConsent } from "@/lib/ai-consent";
import { analytics } from "@/lib/analytics";
import { recordShareSaved } from "@/lib/first-share";
import { releaseSavedShare } from "@/lib/use-incoming-share-url";
import { demoDestination, findSample } from "@/lib/onboarding-demo";
import {
  clearLegacyDemoUrlIfSaved,
  resolveOnboardingSpaceName,
  setPendingDemo,
  type PendingDemo,
} from "@/lib/pending-onboarding";
import { queueFirstSave } from "@/lib/queued-first-save";
import { extractFirstUrl, isProbablyUrl } from "@/lib/url";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { demoErrorCode, isRateLimitedError } from "@convex/model/demoErrors";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth, useMutation } from "convex/react";
import { useCallback, useEffect, useReducer, useRef } from "react";

const TIMEOUT_MS = 15_000;

export type DemoSaved = { itemId: Id<"items">; savedSpaceNames: string[] };

type DemoView = "share" | "auth" | "preview" | "reading" | "failed";

type StoredPhase = "share" | "auth" | "preview" | "saved";

type DemoSaveState = {
  phase: StoredPhase;
  authRequest: PendingDemo | null;
  savingUrl: string | null;
  previewedUrl: string | null;
  itemId: Id<"items"> | null;
  submitting: boolean;
  error: TextMessageKey | null;
  demoUsed: boolean;
  saveFailed: boolean;
  deadlineNonce: number;
  timedOutKey: string | null;
};

type DemoSaveAction =
  | {
      type: "submit";
      request: PendingDemo;
      authenticated: boolean;
      preview: boolean;
      lost: boolean;
    }
  | { type: "previewed" }
  | { type: "saved"; itemId: Id<"items"> }
  | { type: "submitFailed"; used: boolean }
  | { type: "cancelAuth" }
  | { type: "retryStarted" }
  | { type: "retried" }
  | { type: "retryFailed"; error: TextMessageKey }
  | { type: "setError"; error: TextMessageKey | null; lost: boolean }
  | { type: "keepWaiting" }
  | { type: "timedOut"; key: string };

export function initialDemoSaveState(
  resume: PendingDemo | null,
): DemoSaveState {
  return {
    phase: resume ? "auth" : "share",
    authRequest: resume,
    savingUrl: null,
    previewedUrl: null,
    itemId: null,
    submitting: false,
    error: null,
    demoUsed: false,
    saveFailed: false,
    deadlineNonce: 0,
    timedOutKey: null,
  };
}

function dropLost(state: DemoSaveState, lost: boolean): DemoSaveState {
  return lost
    ? { ...state, phase: "share", itemId: null, saveFailed: true }
    : state;
}

export function demoSaveReducer(
  state: DemoSaveState,
  action: DemoSaveAction,
): DemoSaveState {
  switch (action.type) {
    case "submit": {
      const next = {
        ...dropLost(state, action.lost),
        error: null,
        savingUrl: action.request.url,
      };
      if (action.authenticated) {
        return {
          ...next,
          authRequest: alreadyPreviewed(next) ? state.authRequest : null,
          submitting: true,
          deadlineNonce: state.deadlineNonce + 1,
        };
      }
      return {
        ...next,
        authRequest: action.request,
        phase:
          action.preview && state.previewedUrl !== action.request.url
            ? "preview"
            : "auth",
      };
    }
    case "previewed":
      return state.phase === "preview"
        ? { ...state, phase: "auth", previewedUrl: state.savingUrl }
        : state;
    case "saved":
      return {
        ...state,
        phase: "saved",
        authRequest: alreadyPreviewed(state) ? state.authRequest : null,
        itemId: action.itemId,
        submitting: false,
      };
    case "submitFailed":
      return {
        ...state,
        submitting: false,
        authRequest: null,
        demoUsed: action.used,
        saveFailed: state.saveFailed || !action.used,
        error: action.used ? "demo.alreadyUsed" : "demo.saveFailed",
        phase: state.phase === "auth" ? "share" : state.phase,
      };
    case "cancelAuth":
      return { ...state, authRequest: null, savingUrl: null, phase: "share" };
    case "retryStarted":
      return { ...state, submitting: true, error: null, authRequest: null };
    case "retried":
      return {
        ...state,
        submitting: false,
        deadlineNonce: state.deadlineNonce + 1,
      };
    case "retryFailed":
      return { ...state, submitting: false, error: action.error };
    case "setError":
      if (!action.lost && state.error === action.error) return state;
      return { ...dropLost(state, action.lost), error: action.error };
    case "keepWaiting":
      return {
        ...state,
        deadlineNonce: state.deadlineNonce + 1,
      };
    case "timedOut":
      return {
        ...state,
        timedOutKey: action.key,
        authRequest: state.phase === "saved" ? null : state.authRequest,
      };
  }
}

type ItemSnapshot = {
  status: "processing" | "ready" | "failed";
} | null;

function deadlineKeyOf(state: DemoSaveState): string {
  return `${state.itemId}:${state.deadlineNonce}`;
}

function alreadyPreviewed(state: DemoSaveState): boolean {
  return state.previewedUrl !== null && state.previewedUrl === state.savingUrl;
}

export function deriveDemoView(
  state: DemoSaveState,
  query: {
    item: ItemSnapshot | undefined;
    isError: boolean;
    isSuccess: boolean;
  },
): { view: DemoView; lostError: TextMessageKey | null } {
  if (state.phase === "auth" && state.submitting) {
    return {
      view: alreadyPreviewed(state) ? "auth" : "reading",
      lostError: null,
    };
  }
  if (state.phase !== "saved") return { view: state.phase, lostError: null };
  const { item } = query;
  if (item?.status === "failed") return { view: "failed", lostError: null };
  if (query.isError) return { view: "share", lostError: "demo.loadFailed" };
  if (query.isSuccess && item === null) {
    return { view: "share", lostError: "demo.saveGone" };
  }
  if (state.authRequest !== null) return { view: "auth", lostError: null };
  return { view: "reading", lostError: null };
}

export function linkFromText(text: string): string | null {
  return extractFirstUrl(text) ?? (isProbablyUrl(text) ? text.trim() : null);
}

export function retryErrorKey(err: unknown): TextMessageKey {
  const code = demoErrorCode(err);
  if (code === "terminal_failure") return "demo.notFoundRetry";
  if (code === "too_many_retries") return "demo.repeatedFailure";
  if (isRateLimitedError(err)) return "demo.tryLater";
  return "demo.retryFailed";
}

export function useDemoSave({
  spaces,
  resume,
  onSaved,
  onAdvance,
}: {
  spaces: string[];
  resume: PendingDemo | null;
  onSaved: (saved: DemoSaved) => void;
  onAdvance: () => void;
}) {
  const { isAuthenticated } = useConvexAuth();
  const { savesBlocked } = useAiConsent();
  const canSave = isAuthenticated && !savesBlocked;
  const createDemoItem = useMutation(api.demo.createDemoItem);
  const retryDemoItem = useMutation(api.demo.retryDemoItem);
  const [state, dispatch] = useReducer(
    demoSaveReducer,
    resume,
    initialDemoSaveState,
  );
  const inFlightRef = useRef(false);
  const advancedRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const { itemId } = state;

  // 'skip', not `enabled`: a disabled query still subscribes through the Convex adapter and sends `id: null`.
  const itemQuery = useQuery(
    convexQuery(api.items.getItem, itemId === null ? "skip" : { id: itemId }),
  );
  const item = itemQuery.data;
  const { view, lostError } = deriveDemoView(state, {
    item,
    isError: itemQuery.isError,
    isSuccess: itemQuery.isSuccess,
  });
  const lost = lostError !== null;

  const advance = useCallback(() => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    onAdvance();
  }, [onAdvance]);

  const status = view === "share" ? null : item?.status;
  useEffect(() => {
    if (advancedRef.current) return;
    if (status === "ready") {
      analytics.capture("onboarding_demo_result", { outcome: "ready" });
      advance();
    } else if (status === "failed") {
      analytics.capture("onboarding_demo_result", { outcome: "failed" });
    }
  }, [status, advance]);

  const deadlineKey = deadlineKeyOf(state);
  const submissionPending = state.submitting && itemId === null;
  const watching =
    submissionPending ||
    (itemId !== null &&
      state.phase === "saved" &&
      (view === "reading" || view === "auth"));
  useEffect(() => {
    if (!watching) return;
    const id = setTimeout(
      () => dispatch({ type: "timedOut", key: deadlineKey }),
      TIMEOUT_MS,
    );
    return () => clearTimeout(id);
  }, [watching, deadlineKey]);
  const slow = watching && state.timedOutKey === deadlineKey;
  const timedOut = slow && itemId !== null;
  const submissionTimedOut = slow && itemId === null;

  const submit = useCallback(
    async (request: PendingDemo, resumed = false) => {
      const url = request.url.trim();
      const stale = () => advancedRef.current || !mountedRef.current;
      if (url === "" || inFlightRef.current || stale()) return;
      const trimmed = { ...request, url };
      const found = findSample(url);
      const sample = found !== undefined;
      if (!resumed) {
        analytics.capture("onboarding_demo_picked", {
          sample,
          signed_in: isAuthenticated,
        });
      }
      setPendingDemo(trimmed);
      dispatch({
        type: "submit",
        request: trimmed,
        authenticated: canSave,
        preview: sample,
        lost,
      });
      if (!canSave) return;

      inFlightRef.current = true;
      try {
        const result = await createDemoItem({
          url,
          title: found?.pageHeading,
          spaceName: trimmed.destination ?? undefined,
          analyticsSessionId: analytics.sessionId(),
        });
        if (stale()) return;
        if (!result.reused) analytics.capture("onboarding_demo_submitted");
        const sharedUrlSaved =
          request.source === "share" && result.urlMatchesRequest;
        setPendingDemo({
          url: result.url,
          destination: result.savedSpaceNames[0] ?? null,
          source: sharedUrlSaved ? "share" : "direct",
        });
        clearLegacyDemoUrlIfSaved(result.url);
        if (sharedUrlSaved) {
          releaseSavedShare(url);
          try {
            recordShareSaved(result.userId);
          } catch (err) {
            analytics.captureError("record_first_share_failed", err);
          }
        }
        dispatch({ type: "saved", itemId: result.itemId });
        onSaved({
          itemId: result.itemId,
          savedSpaceNames: result.savedSpaceNames,
        });
      } catch (err) {
        if (stale()) return;
        // Read ConvexError data, not err.message: production redacts plain server errors to "Server Error".
        const used = demoErrorCode(err) === "demo_used";
        analytics.capture("onboarding_demo_submitted");
        analytics.capture("onboarding_demo_result", {
          outcome: used ? "already_used" : "error",
        });
        dispatch({ type: "submitFailed", used });
      } finally {
        inFlightRef.current = false;
      }
    },
    [createDemoItem, isAuthenticated, canSave, lost, onSaved],
  );

  const submitUrl = useCallback(
    (url: string) => {
      const preset = demoDestination(url.trim(), spaces);
      void submit({
        url,
        destination:
          preset === null ? null : resolveOnboardingSpaceName(preset),
        source: "direct",
      });
    },
    [spaces, submit],
  );

  const submitSharedUrl = useCallback(
    (url: string) => {
      const preset = demoDestination(url.trim(), spaces);
      void submit({
        url,
        destination:
          preset === null ? null : resolveOnboardingSpaceName(preset),
        source: "share",
      });
    },
    [spaces, submit],
  );

  const { authRequest } = state;
  const awaitingAuth = state.phase === "auth";
  useEffect(() => {
    if (!canSave || !awaitingAuth || authRequest === null) return;
    void submit(authRequest, true);
  }, [canSave, awaitingAuth, authRequest, submit]);

  const setError = useCallback(
    (error: TextMessageKey | null) =>
      dispatch({ type: "setError", error, lost }),
    [lost],
  );

  const submitTyped = (text: string) => {
    if (text.trim() === "") return;
    const url = linkFromText(text);
    if (url === null) {
      setError("demo.notALink");
      return;
    }
    submitUrl(url);
  };

  const cancelAuth = () => {
    setPendingDemo(null);
    dispatch({ type: "cancelAuth" });
  };

  const retry = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    dispatch({ type: "retryStarted" });
    try {
      await retryDemoItem({});
      dispatch({ type: "retried" });
    } catch (err) {
      dispatch({ type: "retryFailed", error: retryErrorKey(err) });
    } finally {
      inFlightRef.current = false;
    }
  };

  const previewed = useCallback(() => dispatch({ type: "previewed" }), []);

  const continueAfterTimeout = () => {
    if (advancedRef.current) return;
    analytics.capture("onboarding_demo_result", { outcome: "timeout" });
    advance();
  };

  const saveLater = () => {
    if (advancedRef.current || canSave) return;
    const request = state.authRequest;
    if (request === null) return;
    const { url } = request;
    analytics.capture("onboarding_demo_deferred", {
      sample: findSample(url) !== undefined,
    });
    queueFirstSave(request);
    releaseSavedShare(url);
    setPendingDemo(null);
    advance();
  };

  const skip = () => {
    if (advancedRef.current) return;
    analytics.capture("onboarding_demo_skipped");
    setPendingDemo(null);
    advance();
  };

  const { phase, demoUsed } = state;
  const canAcceptShare = useCallback(
    () =>
      !inFlightRef.current &&
      !advancedRef.current &&
      !demoUsed &&
      (view === "share" || (view === "auth" && phase === "auth")),
    [view, phase, demoUsed],
  );

  return {
    view,
    item,
    isAuthenticated,
    savingUrl: state.savingUrl,
    authRequest: state.authRequest,
    authUrl: state.authRequest?.url ?? state.savingUrl ?? "",
    submitting: state.submitting,
    error: state.error ?? lostError,
    timedOut,
    submissionTimedOut,
    demoUsed: state.demoUsed,
    canSkip: view === "share" && !state.demoUsed && (state.saveFailed || lost),
    canAcceptShare,
    advance,
    skip,
    saveLater,
    submitUrl,
    submitTyped,
    setError,
    cancelAuth,
    retry,
    submitSharedUrl,
    previewed,
    keepWaiting: () => dispatch({ type: "keepWaiting" }),
    continueAfterTimeout,
  };
}
