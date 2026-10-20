import { api } from "@convex/_generated/api";
import { analytics } from "@/lib/analytics";
import { useOnboarding } from "@/lib/onboarding";
import { useConvexAuth, useMutation } from "convex/react";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  clearLegacyDemoUrl,
  clearPending,
  getPendingDemoSpace,
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

function pendingWorkKey(): string {
  return JSON.stringify([
    getPendingOperationId(),
    getPendingSpaces(),
    getPendingDemoUrl(),
  ]);
}

/**
 * After onboarding is finished and the user signs in, replay the deferred
 * onboarding spaces, then present the paywall. Runs again only for work
 * handed over after it finished (a queued first save's link).
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
  const startedEntitledRef = useRef(false);
  const rerunRef = useRef(false);
  const awaitingEntitlementRef = useRef(false);
  // The pending work this mount already tried and could not finish. Saving
  // the failed remainder notifies the store, which re-runs this effect; without
  // this the replay would retry its own failure in a tight loop. A remount, an
  // entitlement change, or different pending work starts a fresh attempt.
  const settledWorkRef = useRef<string | null>(null);
  const settledEntitledRef = useRef(entitled);
  const [retryNonce, setRetryNonce] = useState(0);
  // SecureStore is synchronous but not reactive. Subscribe so finishing
  // authenticated onboarding immediately wakes this hook; otherwise the hook
  // would only notice pending data after an auth/entitlement change.
  const pendingRevision = useSyncExternalStore(
    subscribePendingOnboarding,
    getPendingOnboardingRevision,
    getPendingOnboardingRevision,
  );
  // Wakes the replay when a purchase made before sign-in stops holding it.
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
    if (!onboarded) return;
    if (entitlementLoading) return;
    if (runningRef.current) {
      // If entitlement changes while the paywall or mutations are in flight,
      // schedule one pass after the current run finishes instead of starting
      // a second paywall/mutation batch concurrently.
      if (entitled !== startedEntitledRef.current) {
        rerunRef.current = true;
      }
      return;
    }
    if (!hasPending()) return;
    if (pendingWorkKey() === settledWorkRef.current) return;
    // A purchase made before sign-in is still on its way to the account
    // (see purchase-before-sign-in.ts), so it is never sold a second time.
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

    // What this run left unfinished, read straight after its own writes so
    // work that arrives while a mutation is in flight is never mistaken for it.
    let remainderKey: string | null = null;
    let lateDemoUrl = false;
    const run = async () => {
      try {
        // Show the paywall before Pro-gated mutations. createSpace calls
        // requireProEntitlement on the server, so it will fail for
        // non-entitled users. If the user cancels, keep the pending data —
        // the effect re-runs when `entitled` changes (e.g., after a future
        // purchase via the paywall route).
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
          spaces.map((name) => createSpace({ name, dynamic: true })),
        );
        const failedSpaces = spaceResults
          .map((result, index) =>
            result.status === "rejected" ? spaces[index] : null,
          )
          .filter((name): name is string => name !== null);
        // Persist only the failed work so a later replay retries it without
        // recreating spaces that already succeeded.
        updatePendingSpaces(failedSpaces);
        remainderKey = pendingWorkKey();
        const allSpacesOk = failedSpaces.length === 0;

        if (legacyDemoUrl) {
          try {
            // No saveSource: this replays an onboarding demo, but
            // `onboarding_demo` is stamped server-side by createDemoItem and
            // the client must not claim it. No other literal is truthful here.
            // The space it was picked for is usually a starter space made
            // above; createSpace returns that one by name.
            const spaceId =
              legacyDemoSpace === null
                ? undefined
                : await createSpace({ name: legacyDemoSpace, dynamic: true });
            await createLinkItem({
              url: legacyDemoUrl,
              spaceId,
              operationId: getOrCreatePendingOperationId(),
              analyticsSessionId: analytics.sessionId(),
            });
            // Only the link this run saved: one handed over meanwhile stays.
            if (getPendingDemoUrl() === legacyDemoUrl) clearLegacyDemoUrl();
            remainderKey = pendingWorkKey();
          } catch {
            return;
          }
        }

        // Only mark as done when all required mutations succeed.
        if (!allSpacesOk) return;

        // A link handed over while this run was in flight (a queued first
        // save whose account had spent its demo save) is not this run's to
        // clear; a fresh pass saves it.
        if (getPendingDemoUrl() !== null) {
          lateDemoUrl = true;
          return;
        }

        clearPending();
      } finally {
        // An entitlement change during the run asked for a fresh pass; marking
        // this work settled would make that pass skip it.
        const entitlementRerun = rerunRef.current || lateDemoUrl;
        if (remainderKey !== null && !entitlementRerun) {
          settledWorkRef.current = remainderKey;
        }
        // New work that arrived mid-run found the replay busy; run it now.
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
    purchaseRevision,
    router,
    retryNonce,
  ]);
}
