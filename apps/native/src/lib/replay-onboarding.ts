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

type ReplayWork = NonNullable<ReturnType<typeof getPendingReplayWork>>;

/** The identity of one unit of replay work. Two reads with the same
 * operation, the same spaces in the same order and the same queued demo link
 * are the same work, however many times the store announced it. */
function identityOf(work: ReplayWork): string {
  return JSON.stringify([work.operationId, work.spaces, work.demoUrl]);
}

function currentIdentity(): string | null {
  const work = getPendingReplayWork();
  return work === null ? null : identityOf(work);
}

/**
 * After onboarding is finished and the user signs in, replay the deferred
 * onboarding spaces, then present the paywall.
 *
 * Each unit of work (see `identityOf`) is attempted at most once per recovery
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
  const settledEntitledRef = useRef<boolean | null>(null);
  const epochRef = useRef(0);
  const attemptedRef = useRef({ epoch: 0, identities: new Set<string>() });
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
    // Only a settled value that differs from the last settled value is a
    // transition. A query that reloads and lands where it was is not one.
    if (
      settledEntitledRef.current !== null &&
      settledEntitledRef.current !== entitled
    ) {
      epochRef.current += 1;
    }
    settledEntitledRef.current = entitled;

    if (runningRef.current) {
      // Whatever changed (entitlement, new work, the run's own write-back) is
      // judged once the current run finishes, never by a second concurrent
      // paywall or mutation batch.
      deferredPassRef.current = true;
      return;
    }
    if (!hasPending()) return;
    if (
      !entitled &&
      (awaitingEntitlementRef.current || onboardingPaywall !== "unseen")
    )
      return;

    const work = getPendingReplayWork();
    if (work === null) return;
    const identity = identityOf(work);
    if (attemptedRef.current.epoch !== epochRef.current) {
      attemptedRef.current = {
        epoch: epochRef.current,
        identities: new Set(),
      };
    }
    // The run keeps this set even if a transition opens a new epoch while it
    // is in flight: the identities it consumes belong to the epoch it started
    // in, and the new epoch judges the leftover work afresh.
    const attempted = attemptedRef.current.identities;
    if (attempted.has(identity)) return;
    attempted.add(identity);

    runningRef.current = true;

    const run = async () => {
      try {
        // Show the paywall before Pro-gated mutations. createSpace calls
        // requireProEntitlement on the server, so it will fail for
        // non-entitled users. If the user cancels, keep the pending data —
        // the next epoch (a future purchase through the paywall route) offers
        // the work again.
        if (!entitled) {
          await waitForSheetTransition();
          const purchased = await openPaywall(router, "onboarding");
          if (purchased) {
            // The RevenueCat webhook may not have updated Convex yet. Keep
            // pending data and wait for the entitlement query to become true.
            awaitingEntitlementRef.current = true;
          }
          return;
        }

        awaitingEntitlementRef.current = false;
        onboardingPaywall = "unseen";

        // Match the new-space screen: starter spaces receive AI suggestions.
        const spaceResults = await Promise.allSettled(
          work.spaces.map((name) => createSpace({ name, dynamic: true })),
        );
        const failedSpaces = work.spaces.filter(
          (_, index) => spaceResults[index].status === "rejected",
        );
        // Work that arrived while the mutations were in flight is newer than
        // this run's view of the store. Leave it to the deferred pass; the
        // server deduplicates spaces by name, so nothing created here is
        // lost to it.
        if (currentIdentity() !== identity) return;
        // Persist only the failed work so a later replay retries it without
        // recreating spaces that already succeeded. Its identity is consumed
        // before the write publishes it, so the write cannot re-enter here.
        const remaining = { ...work, spaces: failedSpaces };
        attempted.add(identityOf(remaining));
        updatePendingSpaces(failedSpaces);

        if (work.demoUrl) {
          try {
            // No saveSource: this replays an onboarding demo, but
            // `onboarding_demo` is stamped server-side by createDemoItem and
            // the client must not claim it. No other literal is truthful here.
            await createLinkItem({
              url: work.demoUrl,
              operationId: work.operationId,
              analyticsSessionId: analytics.sessionId(),
            });
          } catch {
            return;
          }
          if (currentIdentity() !== identityOf(remaining)) return;
          attempted.add(identityOf({ ...remaining, demoUrl: null }));
          clearLegacyDemoUrl();
        }

        // Only mark as done when all required mutations succeed.
        if (failedSpaces.length > 0) return;
        clearPending();
      } finally {
        const deferredPass = deferredPassRef.current;
        deferredPassRef.current = false;
        runningRef.current = false;
        if (deferredPass) {
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
