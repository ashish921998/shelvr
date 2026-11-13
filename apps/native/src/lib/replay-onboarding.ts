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
  finishReplay,
  initialReplay,
  observeReplay,
} from "@/lib/replay-onboarding-machine";
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

function pendingDemo(): {
  url: string;
  space: string | null;
  operationId: string;
} | null {
  const url = getPendingDemoUrl();
  return url === null
    ? null
    : {
        url,
        space: getPendingDemoSpace(),
        operationId: getOrCreatePendingOperationId(),
      };
}

/** Mount once: after onboarding and sign-in, shows the paywall and saves the queued sample reel. */
export function useReplayOnboarding(
  freeSaves: { left: boolean; loading: boolean } = {
    left: false,
    loading: false,
  },
) {
  const { isAuthenticated } = useConvexAuth();
  const { onboarded } = useOnboarding();
  const { data: user } = useCurrentUser();
  const accountLoaded = user != null;
  const userId = user?._id ?? null;
  const router = useRouter();
  const entitlement = useEntitlement();
  const entitled = entitlement.entitled || freeSaves.left;
  const entitlementLoading = entitlement.loading || freeSaves.loading;
  const createSpace = useMutation(api.spaces.createSpace);
  const createLinkItem = useMutation(api.items.createLinkItem);
  const machine = useRef(initialReplay(entitled));
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
    const step = observeReplay(machine.current, {
      ready:
        isAuthenticated && accountLoaded && onboarded && !entitlementLoading,
      entitled,
      paywallBlocked:
        onboardingPaywall !== "unseen" || hasPurchaseBeforeSignIn(),
      readPending: () => {
        const demoOwner = getPendingDemoOwner();
        if (demoOwner !== null && demoOwner !== userId) clearLegacyDemoUrl();
        return { has: hasPending(), key: pendingWorkKey() };
      },
    });
    machine.current = step.state;
    if (step.action === "none") return;
    if (step.action === "save") onboardingPaywall = "unseen";

    const demo = pendingDemo();

    let purchased = false;
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
        if (step.action === "sell") {
          await waitForSheetTransition();
          purchased = await openPaywall(router, "onboarding");
          return;
        }

        if (!sameAccount()) return;

        remainderKey = pendingWorkKey();

        if (demo) {
          if (!sameAccount()) return;
          try {
            const spaceId =
              demo.space === null
                ? undefined
                : await createSpace({ name: demo.space, dynamic: true });
            if (!sameAccount()) return;
            await createLinkItem({
              url: demo.url,
              spaceId,
              operationId: demo.operationId,
              analyticsSessionId: analytics.sessionId(),
              saveSource: "onboarding_demo",
            });
            if (getPendingOperationId() === demo.operationId)
              clearLegacyDemoUrl();
            if (!sameAccount()) return;
            remainderKey = pendingWorkKey();
          } catch (error) {
            analytics.captureError("onboarding_demo_save_failed", error);
            return;
          }
        }

        if (!sameAccount()) return;

        if (getPendingDemoUrl() !== null) {
          lateDemoUrl = true;
          return;
        }

        clearPending();
      } finally {
        const done = finishReplay(machine.current, {
          purchased,
          remainderKey,
          lateDemoUrl,
          accountChanged,
          pending: { has: hasPending(), key: pendingWorkKey() },
        });
        machine.current = done.state;
        if (done.rerun) setRetryNonce((nonce) => nonce + 1);
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
