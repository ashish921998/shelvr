import type { TextMessageKey } from "@/locales/message-types";
import { analytics } from "@/lib/analytics";
import { recordShareSaved } from "@/lib/first-share";
import { demoDestination } from "@/lib/onboarding-demo";
import {
  clearLegacyDemoUrlIfSaved,
  resolveOnboardingSpaceName,
  setPendingDemo,
  type PendingDemo,
} from "@/lib/pending-onboarding";
import { extractFirstUrl, isProbablyUrl } from "@/lib/url";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { demoErrorCode, isRateLimitedError } from "@convex/model/demoErrors";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth, useMutation } from "convex/react";
import { useCallback, useEffect, useReducer, useRef } from "react";

// Every path is real. The save runs through api.demo.createDemoItem (one per
// user, no Pro needed) and the actual pipeline. Before auth, the pending save
// is persisted so an app kill mid-OAuth resumes it. The record stays through
// reveal so a relaunch re-attaches to the same server item; finish() drops it.

const TIMEOUT_MS = 15_000;

export type DemoSaved = { itemId: Id<"items">; savedSpaceNames: string[] };

type DemoView = "share" | "auth" | "reading" | "failed";

/** "saved" watches the server item; the reading/failed view mirrors its status. */
type StoredPhase = "share" | "auth" | "saved";

type DemoSaveState = {
  phase: StoredPhase;
  authRequest: PendingDemo | null;
  savingUrl: string | null;
  itemId: Id<"items"> | null;
  submitting: boolean;
  error: TextMessageKey | null;
  demoUsed: boolean;
  /** A save attempt failed, so the step offers a way on without one. */
  saveFailed: boolean;
  deadlineNonce: number;
  timedOutKey: string | null;
};

type DemoSaveAction =
  | {
      type: "submit";
      request: PendingDemo;
      authenticated: boolean;
      lost: boolean;
    }
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
    itemId: null,
    submitting: false,
    error: null,
    demoUsed: false,
    saveFailed: false,
    deadlineNonce: 0,
    timedOutKey: null,
  };
}

/** A lost save (deleted elsewhere, query error) is only derived while it is
 * watched; the next user action stops watching it. */
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
      return action.authenticated
        ? { ...next, authRequest: null, submitting: true }
        : { ...next, authRequest: action.request, phase: "auth" };
    }
    case "saved":
      return {
        ...state,
        phase: "saved",
        authRequest: null,
        itemId: action.itemId,
        submitting: false,
      };
    case "submitFailed":
      return {
        ...state,
        submitting: false,
        demoUsed: action.used,
        saveFailed: state.saveFailed || !action.used,
        error: action.used ? "demo.alreadyUsed" : "demo.saveFailed",
        phase: state.phase === "auth" ? "share" : state.phase,
      };
    case "cancelAuth":
      return { ...state, authRequest: null, savingUrl: null, phase: "share" };
    case "retryStarted":
      return { ...state, submitting: true, error: null };
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
      return { ...state, deadlineNonce: state.deadlineNonce + 1 };
    case "timedOut":
      return { ...state, timedOutKey: action.key };
  }
}

type ItemSnapshot = {
  status: "processing" | "ready" | "failed";
} | null;

/** What the step shows, derived from local state and the watched item. */
export function deriveDemoView(
  state: DemoSaveState,
  query: {
    item: ItemSnapshot | undefined;
    isError: boolean;
    isSuccess: boolean;
  },
): { view: DemoView; lostError: TextMessageKey | null } {
  if (state.phase !== "saved") return { view: state.phase, lostError: null };
  const { item } = query;
  if (item?.status === "failed") return { view: "failed", lostError: null };
  if (query.isError) return { view: "share", lostError: "demo.loadFailed" };
  if (query.isSuccess && item === null) {
    return { view: "share", lostError: "demo.saveGone" };
  }
  return { view: "reading", lostError: null };
}

/** A link in pasted or typed text, or null when there is none to save. */
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
  userId,
}: {
  spaces: string[];
  resume: PendingDemo | null;
  onSaved: (saved: DemoSaved) => void;
  onAdvance: () => void;
  /** Current account id, so a share-sheet demo save records the first share
   * and Home drops the how-to card. Null until sign-in resolves. */
  userId: string | null;
}) {
  const { isAuthenticated } = useConvexAuth();
  const createDemoItem = useMutation(api.demo.createDemoItem);
  const retryDemoItem = useMutation(api.demo.retryDemoItem);
  const [state, dispatch] = useReducer(
    demoSaveReducer,
    resume,
    initialDemoSaveState,
  );
  const inFlightRef = useRef(false);
  const advancedRef = useRef(false);
  // The share sheet, not a paste or typed link, is the user's first share.
  // The bit rides the persisted request rather than a ref, so a save resumed
  // on a fresh mount (an app kill mid-OAuth) still records it.
  const pendingShareRecordRef = useRef(false);
  const { itemId } = state;

  // Records a share-sheet demo save as the first share, so Home drops the
  // how-to card. Waits until sign-in resolves the account id.
  const recordSharePending = useCallback(() => {
    if (!pendingShareRecordRef.current || userId === null) return;
    pendingShareRecordRef.current = false;
    try {
      recordShareSaved(userId);
    } catch (err) {
      analytics.captureError("record_first_share_failed", err);
    }
  }, [userId]);

  useEffect(() => {
    recordSharePending();
  }, [recordSharePending]);

  // 'skip', not `enabled`: a disabled React Query still subscribes through the
  // Convex adapter and sends `id: null`, which fails argument validation.
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
    if (status === "ready") {
      analytics.capture("onboarding_demo_result", { outcome: "ready" });
      advance();
    } else if (status === "failed") {
      analytics.capture("onboarding_demo_result", { outcome: "failed" });
    }
  }, [status, advance]);

  // Only flips the slow flag. The user, never a timer, decides to move on.
  const deadlineKey = `${itemId}:${state.deadlineNonce}`;
  const watching = itemId !== null && view === "reading";
  useEffect(() => {
    if (!watching) return;
    const id = setTimeout(
      () => dispatch({ type: "timedOut", key: deadlineKey }),
      TIMEOUT_MS,
    );
    return () => clearTimeout(id);
  }, [watching, deadlineKey]);
  const timedOut = watching && state.timedOutKey === deadlineKey;

  const submit = useCallback(
    async (request: PendingDemo) => {
      const url = request.url.trim();
      if (url === "" || inFlightRef.current) return;
      const trimmed = {
        url,
        destination: request.destination,
        viaShare: request.viaShare,
      };
      setPendingDemo(trimmed);
      dispatch({
        type: "submit",
        request: trimmed,
        authenticated: isAuthenticated,
        lost,
      });
      if (!isAuthenticated) return;

      inFlightRef.current = true;
      try {
        const result = await createDemoItem({
          url,
          spaceName: trimmed.destination ?? undefined,
          analyticsSessionId: analytics.sessionId(),
        });
        // A relaunch resubmits the persisted save and gets it back; that is
        // not a second submission.
        if (!result.reused) analytics.capture("onboarding_demo_submitted");
        setPendingDemo({
          url: result.url,
          destination: result.savedSpaceNames[0] ?? null,
          viaShare: request.viaShare,
        });
        clearLegacyDemoUrlIfSaved(result.url);
        dispatch({ type: "saved", itemId: result.itemId });
        onSaved({
          itemId: result.itemId,
          savedSpaceNames: result.savedSpaceNames,
        });
        // Only a landed save is a first share, so this runs after the item
        // exists. A repeat submit of the same persisted request returns the
        // same item and re-records, which SecureStore makes a no-op.
        if (request.viaShare) {
          pendingShareRecordRef.current = true;
          recordSharePending();
        }
      } catch (err) {
        // Structured ConvexError data, never `err.message`: production
        // redacts a plain server Error to "Server Error".
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
    [createDemoItem, isAuthenticated, lost, onSaved, recordSharePending],
  );

  const submitLink = useCallback(
    (url: string, viaShare: boolean) => {
      const preset = demoDestination(url.trim(), spaces);
      void submit({
        url,
        destination:
          preset === null ? null : resolveOnboardingSpaceName(preset),
        viaShare,
      });
    },
    [spaces, submit],
  );

  // Two entry points rather than one optional flag: `submitUrl` is handed
  // straight to callbacks like the sample picker's, where a second argument
  // would otherwise slip in and mark a paste as a share.

  /** Paste, typed text and sample picks. Not a share, so Home keeps the card. */
  const submitUrl = useCallback(
    (url: string) => submitLink(url, false),
    [submitLink],
  );

  /** The onboarding share sheet's save, which counts as the first share. */
  const submitSharedUrl = useCallback(
    (url: string) => submitLink(url, true),
    [submitLink],
  );

  // Resume the save once auth is ready; submitting consumes the request.
  // Server idempotency makes a repeat submit return the same item.
  const { authRequest } = state;
  const awaitingAuth = state.phase === "auth";
  useEffect(() => {
    if (!isAuthenticated || !awaitingAuth || authRequest === null) return;
    void submit(authRequest);
  }, [isAuthenticated, awaitingAuth, authRequest, submit]);

  const setError = useCallback(
    (error: TextMessageKey | null) =>
      dispatch({ type: "setError", error, lost }),
    [lost],
  );

  /** Typed text is checked here so a non-link never reaches the server. */
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

  const continueAfterTimeout = () => {
    analytics.capture("onboarding_demo_result", { outcome: "timeout" });
    advance();
  };

  // Offline or during an outage no save can land, so the step lets the user
  // on with none; the reveal then has no item to show.
  const skip = () => {
    if (advancedRef.current) return;
    analytics.capture("onboarding_demo_skipped");
    setPendingDemo(null);
    advance();
  };

  const canAcceptShare = useCallback(
    () =>
      !inFlightRef.current &&
      !advancedRef.current &&
      (view === "share" || view === "auth"),
    [view],
  );

  return {
    view,
    item,
    isAuthenticated,
    savingUrl: state.savingUrl,
    authUrl: state.authRequest?.url ?? state.savingUrl ?? "",
    submitting: state.submitting,
    error: state.error ?? lostError,
    timedOut,
    demoUsed: state.demoUsed,
    canSkip: view === "share" && !state.demoUsed && (state.saveFailed || lost),
    canAcceptShare,
    advance,
    skip,
    submitUrl,
    submitTyped,
    setError,
    cancelAuth,
    retry,
    submitSharedUrl,
    keepWaiting: () => dispatch({ type: "keepWaiting" }),
    continueAfterTimeout,
  };
}
