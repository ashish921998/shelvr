import { api } from "@convex/_generated/api";
import { analytics } from "@/lib/analytics";
import { useOnboarding } from "@/lib/onboarding";
import { useConvexAuth, useMutation } from "convex/react";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  clearLegacyDemoUrl,
  clearPending,
  getPendingDemoUrl,
  getPendingSpaces,
  getPendingOperationId,
  getOrCreatePendingOperationId,
  hasPending,
  subscribePendingOnboarding,
  getPendingOnboardingRevision,
  updatePendingSpaces,
} from "@/lib/pending-onboarding";
import {
  openPaywall,
  useEntitlement,
  waitForSheetTransition,
} from "@/lib/entitlement";
import {
  readPurchaseLanding,
  settlePurchaseLanding,
  subscribePurchaseLanding,
} from "@/lib/purchase-landing";

let onboardingPaywall: "unseen" | "purchased" | "declined" = "unseen";

export function notePurchasedDuringOnboarding() {
  onboardingPaywall = "purchased";
}

export function useAwaitingOnboardingPurchase(entitled: boolean): boolean {
  const until = useSyncExternalStore(
    subscribePurchaseLanding,
    readPurchaseLanding,
    readPurchaseLanding,
  );
  const [now, setNow] = useState(Date.now);
  const awaiting = !entitled && now < until;
  useEffect(() => {
    if (entitled) {
      settlePurchaseLanding();
      if (onboardingPaywall === "purchased") onboardingPaywall = "unseen";
    }
    if (!awaiting) return;
    const id = setTimeout(() => setNow(Date.now()), until - Date.now());
    return () => clearTimeout(id);
  }, [entitled, awaiting, until, now]);
  return awaiting;
}

export function noteDeclinedDuringOnboarding() {
  onboardingPaywall = "declined";
}

function pendingWorkKey(): string {
  return JSON.stringify([
    getPendingOperationId(),
    getPendingSpaces(),
    getPendingDemoUrl(),
  ]);
}

export function useReplayOnboarding() {
  const { isAuthenticated } = useConvexAuth();
  const { onboarded } = useOnboarding();
  const router = useRouter();
  const { entitled, loading: entitlementLoading } = useEntitlement();
  const createSpace = useMutation(api.spaces.createSpace);
  const createLinkItem = useMutation(api.items.createLinkItem);
  const ranRef = useRef(false);
  const runningRef = useRef(false);
  const startedEntitledRef = useRef(false);
  const rerunRef = useRef(false);
  const awaitingEntitlementRef = useRef(false);
  const settledWorkRef = useRef<string | null>(null);
  const settledEntitledRef = useRef(entitled);
  const [retryNonce, setRetryNonce] = useState(0);
  const pendingRevision = useSyncExternalStore(
    subscribePendingOnboarding,
    getPendingOnboardingRevision,
    getPendingOnboardingRevision,
  );

  useEffect(() => {
    if (entitled !== settledEntitledRef.current) {
      settledEntitledRef.current = entitled;
      settledWorkRef.current = null;
    }
    if (!isAuthenticated || ranRef.current) return;
    if (!onboarded) return;
    if (entitlementLoading) return;
    if (runningRef.current) {
      if (entitled !== startedEntitledRef.current) {
        rerunRef.current = true;
      }
      return;
    }
    if (!hasPending()) return;
    if (pendingWorkKey() === settledWorkRef.current) return;
    if (
      !entitled &&
      (awaitingEntitlementRef.current || onboardingPaywall !== "unseen")
    )
      return;

    const spaces = getPendingSpaces();

    const legacyDemoUrl = getPendingDemoUrl();

    runningRef.current = true;
    startedEntitledRef.current = entitled;

    let remainderKey: string | null = null;
    const run = async () => {
      try {
        if (!entitled) {
          await waitForSheetTransition();
          const purchased = await openPaywall(router, "onboarding");
          if (purchased) {
            awaitingEntitlementRef.current = true;
          }
          return;
        }

        awaitingEntitlementRef.current = false;
        onboardingPaywall = "unseen";

        const spaceResults = await Promise.allSettled(
          spaces.map((name) => createSpace({ name, dynamic: true })),
        );
        const failedSpaces = spaceResults
          .map((result, index) =>
            result.status === "rejected" ? spaces[index] : null,
          )
          .filter((name): name is string => name !== null);
        updatePendingSpaces(failedSpaces);
        remainderKey = pendingWorkKey();
        const allSpacesOk = failedSpaces.length === 0;

        if (legacyDemoUrl) {
          try {
            await createLinkItem({
              url: legacyDemoUrl,
              operationId: getOrCreatePendingOperationId(),
              analyticsSessionId: analytics.sessionId(),
            });
            clearLegacyDemoUrl();
            remainderKey = pendingWorkKey();
          } catch {
            return;
          }
        }

        if (!allSpacesOk) return;

        ranRef.current = true;
        clearPending();
      } finally {
        const entitlementRerun = rerunRef.current;
        if (remainderKey !== null && !entitlementRerun) {
          settledWorkRef.current = remainderKey;
        }
        const newWork =
          remainderKey !== null &&
          hasPending() &&
          pendingWorkKey() !== remainderKey;
        const shouldRerun = entitlementRerun || newWork;
        rerunRef.current = false;
        runningRef.current = false;
        if (shouldRerun) {
          setRetryNonce((nonce) => nonce + 1);
        }
      }
    };

    void run();
  }, [
    isAuthenticated,
    onboarded,
    createSpace,
    createLinkItem,
    entitled,
    entitlementLoading,
    pendingRevision,
    router,
    retryNonce,
  ]);
}
