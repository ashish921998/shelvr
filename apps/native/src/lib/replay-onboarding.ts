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

// The onboarding reveal opens its own paywall. A purchase there can finish
// onboarding before the webhook marks the user entitled, so replay must wait
// for the entitlement instead of showing the paywall a second time. A user
// who declined it there shouldn't see it again the moment Home appears; the
// replay paywall waits for the next launch.
let onboardingPaywall: "unseen" | "purchased" | "declined" = "unseen";

export function notePurchasedDuringOnboarding() {
  onboardingPaywall = "purchased";
}

export function noteDeclinedDuringOnboarding() {
  onboardingPaywall = "declined";
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
    if (
      !entitled &&
      (awaitingEntitlementRef.current || onboardingPaywall !== "unseen")
    )
      return;

    const spaces = getPendingSpaces();

    const legacyDemoUrl = getPendingDemoUrl();

    runningRef.current = true;
    startedEntitledRef.current = entitled;

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
          } catch {
            return;
          }
        }

        // Only mark as done when all required mutations succeed.
        if (!allSpacesOk) return;

        ranRef.current = true;
        clearPending();
      } finally {
        const shouldRerun = rerunRef.current;
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
