import { api } from "@convex/_generated/api";
import { analytics } from "@/lib/analytics";
import { useCurrentUser } from "@/lib/current-user";
import { useOnboarding } from "@/lib/onboarding";
import { useConvexAuth, useMutation } from "convex/react";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  clearLegacyDemoUrl,
  clearPending,
  getPendingDemoSpace,
  getPendingDemoOwner,
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
  getPurchaseBeforeSignInRevision,
  hasPurchaseBeforeSignIn,
  subscribePurchaseBeforeSignIn,
} from "@/lib/purchase-before-sign-in";
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

/** True while a purchase or restore, from anywhere in the app, is still reaching Convex. */
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

/** Mount once: after onboarding and sign-in, creates the deferred spaces and shows the paywall. */
export function useReplayOnboarding() {
  const { isAuthenticated } = useConvexAuth();
  const { onboarded } = useOnboarding();
  const { data: user } = useCurrentUser();
  const accountLoaded = user != null;
  const userId = user?._id ?? null;
  const router = useRouter();
  const { entitled, loading: entitlementLoading } = useEntitlement();
  const createSpace = useMutation(api.spaces.createSpace);
  const createLinkItem = useMutation(api.items.createLinkItem);
  const runningRef = useRef(false);
  const startedEntitledRef = useRef(false);
  const rerunRef = useRef(false);
  const awaitingEntitlementRef = useRef(false);
  const settledWorkRef = useRef<string | null>(null);
  const settledEntitledRef = useRef(entitled);
  const [retryNonce, setRetryNonce] = useState(0);
  const accountRef = useRef<string | null>(null);
  useEffect(() => {
    accountRef.current = isAuthenticated ? userId : null;
    return () => {
      accountRef.current = null;
    };
  }, [isAuthenticated, userId]);
  const pendingRevision = useSyncExternalStore(
    subscribePendingOnboarding,
    getPendingOnboardingRevision,
    getPendingOnboardingRevision,
  );
  const purchaseRevision = useSyncExternalStore(
    subscribePurchaseBeforeSignIn,
    getPurchaseBeforeSignInRevision,
    getPurchaseBeforeSignInRevision,
  );

  useEffect(() => {
    if (entitled !== settledEntitledRef.current) {
      settledEntitledRef.current = entitled;
      settledWorkRef.current = null;
    }
    if (!isAuthenticated) return;
    if (!accountLoaded) return;
    if (!onboarded) return;
    if (entitlementLoading) return;
    if (runningRef.current) {
      if (entitled !== startedEntitledRef.current) {
        rerunRef.current = true;
      }
      return;
    }
    const demoOwner = getPendingDemoOwner();
    if (demoOwner !== null && demoOwner !== userId) clearLegacyDemoUrl();
    if (!hasPending()) return;
    if (pendingWorkKey() === settledWorkRef.current) return;
    if (
      !entitled &&
      (awaitingEntitlementRef.current ||
        onboardingPaywall !== "unseen" ||
        hasPurchaseBeforeSignIn())
    )
      return;

    const spaces = getPendingSpaces();

    const legacyDemoUrl = getPendingDemoUrl();
    const legacyDemoSpace = getPendingDemoSpace();

    runningRef.current = true;
    startedEntitledRef.current = entitled;

    let remainderKey: string | null = null;
    let lateDemoUrl = false;
    const runAccount = userId;
    let accountChanged = false;
    const sameAccount = () => {
      if (runAccount !== null && accountRef.current === runAccount) return true;
      accountChanged = true;
      return false;
    };
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
        if (!sameAccount()) return;

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
          if (!sameAccount()) return;
          try {
            const spaceId =
              legacyDemoSpace === null
                ? undefined
                : await createSpace({ name: legacyDemoSpace, dynamic: true });
            if (!sameAccount()) return;
            await createLinkItem({
              url: legacyDemoUrl,
              spaceId,
              operationId: getOrCreatePendingOperationId(),
              analyticsSessionId: analytics.sessionId(),
              saveSource: "onboarding_demo",
            });
            if (getPendingDemoUrl() === legacyDemoUrl) clearLegacyDemoUrl();
            remainderKey = pendingWorkKey();
          } catch (error) {
            analytics.captureError("onboarding_demo_save_failed", error);
            return;
          }
        }

        if (!allSpacesOk) return;
        if (!sameAccount()) return;

        if (getPendingDemoUrl() !== null) {
          lateDemoUrl = true;
          return;
        }

        clearPending();
      } finally {
        const entitlementRerun =
          rerunRef.current || lateDemoUrl || accountChanged;
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
    accountLoaded,
    userId,
    onboarded,
    createSpace,
    createLinkItem,
    entitled,
    entitlementLoading,
    pendingRevision,
    purchaseRevision,
    router,
    retryNonce,
  ]);
}
