import { api } from "@convex/_generated/api";
import { analytics } from "@/lib/analytics";
import { useOnboarding } from "@/lib/onboarding";
import { useConvexAuth, useMutation } from "convex/react";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  clearLegacyDemoUrl,
  clearPending,
  getPendingReplayWork,
  remainingReplayWork,
  withoutDemoReplayWork,
  type ReplayWork,
  subscribePendingOnboarding,
  getPendingOnboardingRevision,
  updatePendingSpaces,
} from "@/lib/pending-onboarding";
import {
  openPaywall,
  useEntitlement,
  waitForSheetTransition,
} from "@/lib/entitlement";
import { createReplayLedger, sameReplayWork } from "./replay-ledger";

// Onboarding opens its own paywall at the end. A purchase there can finish
// onboarding before the webhook marks the user entitled, so replay must wait
// for the entitlement instead of showing the paywall a second time. A user
// who declined it there shouldn't see it again the moment Home appears; the
// replay paywall waits for the next launch.
let onboardingPaywall: "unseen" | "purchased" | "declined" = "unseen";

export function notePurchasedDuringOnboarding() {
  onboardingPaywall = "purchased";
}

const PURCHASE_LANDING_MS = 10_000;

/**
 * True while a purchase made in onboarding is still on its way to Convex (the
 * webhook lags the store by a moment), so a screen can wait instead of asking
 * for Pro again. The wait is bounded: a webhook that never lands, or a
 * subscription that lapses later in the session, must still reach the Pro
 * gate. Once the entitlement has been seen, the purchase is no longer news.
 */
export function useAwaitingOnboardingPurchase(entitled: boolean): boolean {
  const [waitedOut, setWaitedOut] = useState(false);
  const awaiting = !entitled && onboardingPaywall === "purchased" && !waitedOut;
  useEffect(() => {
    if (entitled && onboardingPaywall === "purchased") {
      onboardingPaywall = "unseen";
    }
    if (!awaiting) return;
    const id = setTimeout(() => setWaitedOut(true), PURCHASE_LANDING_MS);
    return () => clearTimeout(id);
  }, [entitled, awaiting]);
  return awaiting;
}

export function noteDeclinedDuringOnboarding() {
  onboardingPaywall = "declined";
}

async function runReplay({
  work,
  consume,
  entitled,
  router,
  createSpace,
  createLinkItem,
  awaitingEntitlement,
}: {
  work: ReplayWork;
  consume: (next: ReplayWork) => void;
  entitled: boolean;
  router: ReturnType<typeof useRouter>;
  createSpace: ReturnType<typeof useMutation<typeof api.spaces.createSpace>>;
  createLinkItem: ReturnType<
    typeof useMutation<typeof api.items.createLinkItem>
  >;
  awaitingEntitlement: { current: boolean };
}) {
  // Ask before Pro-gated mutations; cancellation keeps the pending work.
  if (!entitled) {
    await waitForSheetTransition();
    if (await openPaywall(router, "onboarding")) {
      awaitingEntitlement.current = true;
    }
    return;
  }
  awaitingEntitlement.current = false;
  onboardingPaywall = "unseen";
  const results = await Promise.allSettled(
    work.spaces.map((name) => createSpace({ name, dynamic: true })),
  );
  const failedSpaces = work.spaces.filter(
    (_, index) => results[index].status === "rejected",
  );
  // Newer work belongs to the deferred pass, not this run's write-back.
  if (!sameReplayWork(getPendingReplayWork(), work)) return;
  const remaining = remainingReplayWork(work, failedSpaces);
  // Consume before publishing; subscribers must never retry this write.
  consume(remaining);
  updatePendingSpaces(failedSpaces);
  if (work.demoUrl) {
    try {
      // Only createDemoItem may stamp onboarding_demo on the server.
      await createLinkItem({
        url: work.demoUrl,
        operationId: work.operationId,
        analyticsSessionId: analytics.sessionId(),
      });
    } catch {
      return;
    }
    if (!sameReplayWork(getPendingReplayWork(), remaining)) return;
    consume(withoutDemoReplayWork(remaining));
    clearLegacyDemoUrl();
  }
  if (failedSpaces.length === 0) clearPending();
}

/**
 * After onboarding is finished and the user signs in, replay the deferred
 * onboarding spaces, then present the paywall.
 *
 * Each unit of work is attempted at most once per recovery
 * epoch. A mount opens the first epoch and every real entitlement transition
 * opens the next, so work that failed stays in SecureStore until a relaunch,
 * a purchase or a lapse gives it a genuine reason to run again. The store
 * revision only wakes the effect; it never makes work eligible by itself,
 * because the hook's own write-back of the failed subset is one of those
 * revisions.
 *
 * Mounted in (app)/_layout.tsx. Gated on `onboarded`: onboarding replay must
 * never fire mid-onboarding (the demo step's inline sign-in authenticates the
 * user while the flow is still running — spaces the demo created are
 * deduplicated server-side by name if replay later runs).
 */
export function useReplayOnboarding() {
  const { isAuthenticated } = useConvexAuth();
  const { onboarded } = useOnboarding();
  const router = useRouter();
  const { entitled, loading: entitlementLoading } = useEntitlement();
  const createSpace = useMutation(api.spaces.createSpace);
  const createLinkItem = useMutation(api.items.createLinkItem);
  const runningRef = useRef(false);
  const deferredPassRef = useRef(false);
  const awaitingEntitlementRef = useRef(false);
  const ledgerRef = useRef(createReplayLedger());
  const [retryNonce, setRetryNonce] = useState(0);
  // SecureStore is synchronous but not reactive. Subscribe so finishing
  // authenticated onboarding immediately wakes this hook; otherwise the hook
  // would only notice pending data after an auth/entitlement change.
  const pendingRevision = useSyncExternalStore(
    subscribePendingOnboarding,
    getPendingOnboardingRevision,
    getPendingOnboardingRevision,
  );

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!onboarded) return;
    if (entitlementLoading) return;
    ledgerRef.current.settle(entitled);

    if (runningRef.current) {
      // Whatever changed (entitlement, new work, the run's own write-back) is
      // judged once the current run finishes, never by a second concurrent
      // paywall or mutation batch.
      deferredPassRef.current = true;
      return;
    }
    if (
      !entitled &&
      (awaitingEntitlementRef.current || onboardingPaywall !== "unseen")
    )
      return;

    const work = getPendingReplayWork();
    if (work === null || (work.spaces.length === 0 && work.demoUrl === null))
      return;
    const consume = ledgerRef.current.claim(work);
    if (consume === null) return;

    runningRef.current = true;

    void runReplay({
      work,
      consume,
      entitled,
      router,
      createSpace,
      createLinkItem,
      awaitingEntitlement: awaitingEntitlementRef,
    }).finally(() => {
      const deferredPass = deferredPassRef.current;
      deferredPassRef.current = false;
      runningRef.current = false;
      if (deferredPass) {
        setRetryNonce((nonce) => nonce + 1);
      }
    });
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
