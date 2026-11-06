import { analytics } from "@/lib/analytics";
import { creatorMapHref } from "@/lib/creator-map-link";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { useOnboarding } from "@/lib/onboarding";
import { holdIncomingShare } from "@/lib/onboarding-exit";
import {
  clearPendingCreatorMap,
  getPendingCreatorMap,
  parsePendingCreatorMap,
  subscribePendingCreatorMap,
  type PendingCreatorMap,
} from "@/lib/pending-creator-map";
import { clearPending } from "@/lib/pending-onboarding";
import { publicMapUrl } from "@/lib/public-map";
import { shareRefOf } from "@/lib/share-link";
import { api } from "@convex/_generated/api";
import { isRateLimitedError } from "@convex/model/demoErrors";
import { useConvexAuth, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "expo-router";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { Alert } from "react-native";

type SaveStepInput = {
  isLoading: boolean;
  isAuthenticated: boolean;
  raw: string | null;
  inFlight: string | null;
  now: number;
};

type SaveStep =
  | { kind: "wait" }
  | { kind: "drop" }
  | { kind: "save"; raw: string; pending: PendingCreatorMap };

export function creatorMapSaveStep(input: SaveStepInput): SaveStep {
  if (input.raw === null) return { kind: "wait" };
  const pending = parsePendingCreatorMap(input.raw, input.now);
  if (pending === null) return { kind: "drop" };
  if (input.isLoading || !input.isAuthenticated) return { kind: "wait" };
  if (input.inFlight === input.raw) return { kind: "wait" };
  return { kind: "save", raw: input.raw, pending };
}

type SaveResult = FunctionReturnType<typeof api.creatorMaps.saveCreatorMap>;

type SaveOutcome = {
  completeOnboarding: boolean;
  href: string | null;
  alert: "creatorMaps.emptyTitle" | "creatorMaps.tooManyLists" | null;
  success: boolean;
};

const REFUSED: SaveOutcome = {
  completeOnboarding: false,
  href: null,
  alert: null,
  success: false,
};

export function creatorMapSaveOutcome(
  result: SaveResult,
  pending: PendingCreatorMap,
  onboarded: boolean,
): SaveOutcome {
  switch (result.status) {
    case "saved":
      return {
        completeOnboarding: !onboarded,
        href: `/shared-list/${result.listId}`,
        alert: null,
        success: true,
      };
    case "gone":
      return { ...REFUSED, href: creatorMapHref(pending.token, pending.city) };
    case "empty":
      return { ...REFUSED, alert: "creatorMaps.emptyTitle" };
    case "tooManyLists":
      return { ...REFUSED, alert: "creatorMaps.tooManyLists" };
  }
}

export function creatorMapFailureAlert(
  error: unknown,
): "creatorMaps.rateLimited" | "creatorMaps.failed" {
  return isRateLimitedError(error)
    ? "creatorMaps.rateLimited"
    : "creatorMaps.failed";
}

async function reportSaved(
  result: SaveResult,
  token: string,
  onboardedBefore: boolean,
): Promise<void> {
  const shareRef = await shareRefOf(publicMapUrl(token));
  analytics.capture("creator_map_saved", {
    status: result.status,
    added: result.status === "saved" ? result.added : 0,
    created: result.status === "saved" && result.created,
    onboarded_before: onboardedBefore,
    ...(shareRef ? { share_ref: shareRef } : {}),
  });
}

function applySaveOutcome(
  outcome: SaveOutcome,
  completeOnboarding: () => void,
  replace: (href: string) => void,
): void {
  clearPendingCreatorMap();
  if (outcome.success) haptics.success();
  if (outcome.alert !== null) Alert.alert(t(outcome.alert));
  if (outcome.completeOnboarding) {
    holdIncomingShare();
    clearPending();
    completeOnboarding();
  }
  if (outcome.href !== null) replace(outcome.href);
}

function failSave(error: unknown): void {
  clearPendingCreatorMap();
  analytics.captureError("creator_map_save_failed", error);
  Alert.alert(t(creatorMapFailureAlert(error)));
}

export function useCreatorMapSaveCoordinator(): void {
  const router = useRouter();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { onboarded, completeOnboarding } = useOnboarding();
  const save = useMutation(api.creatorMaps.saveCreatorMap);
  const raw = useSyncExternalStore(
    subscribePendingCreatorMap,
    getPendingCreatorMap,
    getPendingCreatorMap,
  );
  const inFlight = useRef<string | null>(null);
  const onboardedRef = useRef(onboarded);
  useEffect(() => {
    onboardedRef.current = onboarded;
  }, [onboarded]);

  useEffect(() => {
    const step = creatorMapSaveStep({
      isLoading,
      isAuthenticated,
      raw,
      inFlight: inFlight.current,
      now: Date.now(),
    });
    if (step.kind === "drop") clearPendingCreatorMap();
    if (step.kind !== "save") return;
    inFlight.current = step.raw;
    const { token, city, name } = step.pending;
    save({ token, city, name })
      .then((result) => {
        const onboardedBefore = onboardedRef.current;
        void reportSaved(result, token, onboardedBefore);
        applySaveOutcome(
          creatorMapSaveOutcome(result, step.pending, onboardedBefore),
          completeOnboarding,
          (href) => router.replace(href as never),
        );
      })
      .catch(failSave)
      .finally(() => {
        inFlight.current = null;
      });
  }, [isLoading, isAuthenticated, raw, save, completeOnboarding, router]);
}
