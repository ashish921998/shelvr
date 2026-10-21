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

// Onboarding opens its own paywall at the end. A purchase there can finish
// onboarding before the webhook marks the user entitled, so replay must wait
// for the entitlement instead of showing the paywall a second time. A user
// who declined it there shouldn't see it again the moment Home appears; the
// replay paywall waits for the next launch.
let onboardingPaywall: "unseen" | "purchased" | "declined" = "unseen";

// The purchase wait itself is opened by the paywall presentation.
export function notePurchasedDuringOnboarding() {
  onboardingPaywall = "purchased";
}

/**
 * True while a purchase or restore made anywhere in the app is still on its
 * way to Convex (the webhook lags the store by a moment), so a screen can wait
 * instead of asking for Pro again. The wait is bounded (see
 * `purchase-landing.ts`): a webhook that never lands, or a subscription that
 * lapses later in the session, must still reach the Pro gate.
 */
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

/**
 * After onboarding is finished and the user signs in, replay the deferred
 * onboarding spaces, then present the paywall. Runs once.
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
  const ranRef = useRef(false);
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

  useEffect(() => {
    if (entitled !== settledEntitledRef.current) {
      settledEntitledRef.current = entitled;
      settledWorkRef.current = null;
    }
    if (!isAuthenticated || ranRef.current) return;
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
    if (
      !entitled &&
      (awaitingEntitlementRef.current || onboardingPaywall !== "unseen")
    )
      return;

    const spaces = getPendingSpaces();

    const legacyDemoUrl = getPendingDemoUrl();

    runningRef.current = true;
    startedEntitledRef.current = entitled;

    // What this run left unfinished, read straight after its own writes so
    // work that arrives while a mutation is in flight is never mistaken for it.
    let remainderKey: string | null = null;
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

        // Only mark as done when all required mutations succeed.
        if (!allSpacesOk) return;

        ranRef.current = true;
        clearPending();
      } finally {
        // An entitlement change during the run asked for a fresh pass; marking
        // this work settled would make that pass skip it.
        const entitlementRerun = rerunRef.current;
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
    router,
    retryNonce,
  ]);
}
