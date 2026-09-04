import { api } from '@convex/_generated/api';
import { useConvexAuth, useMutation } from 'convex/react';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  clearPending,
  getPendingSpaces,
  getPendingDemoUrl,
  getOrCreatePendingOperationId,
  getPendingOnboardingRevision,
  hasPending,
  subscribePendingOnboarding,
  updatePendingSpaces,
} from '@/lib/pending-onboarding';
import { openPaywall, useEntitlement, waitForSheetTransition } from '@/lib/entitlement';

/**
 * After sign-in, replay deferred onboarding data: create the spaces the user
 * picked and the demo link they saved. Then present the paywall. Runs once.
 *
 * Mounted in (app)/_layout.tsx so it fires as soon as the user is authenticated
 * and lands in the app group.
 */
export function useReplayOnboarding() {
  const { isAuthenticated } = useConvexAuth();
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
    if (!entitled && awaitingEntitlementRef.current) return;

    const spaces = getPendingSpaces();
    const demoUrl = getPendingDemoUrl();

    runningRef.current = true;
    startedEntitledRef.current = entitled;

    const run = async () => {
      try {
        // Show the paywall before Pro-gated mutations. createSpace and
        // createLinkItem both call requireProEntitlement on the server, so
        // they will fail for non-entitled users. If the user cancels, keep
        // the pending data — the effect re-runs when `entitled` changes
        // (e.g., after a future purchase via the paywall route).
        if (!entitled) {
          await waitForSheetTransition();
          const purchased = await openPaywall(router, 'onboarding');
          if (purchased) {
            // The RevenueCat webhook may not have updated Convex yet. Keep
            // pending data and wait for the entitlement query to become true.
            awaitingEntitlementRef.current = true;
          }
          return;
        }

        awaitingEntitlementRef.current = false;

        // entitled is true — the server sees the subscription row, so
        // requireProEntitlement will pass. Create everything now.
        const spaceResults = await Promise.allSettled(
          spaces.map((name) => createSpace({ name })),
        );
        const failedSpaces = spaceResults
          .map((result, index) =>
            result.status === 'rejected' ? spaces[index] : null,
          )
          .filter((name): name is string => name !== null);
        // Persist only the failed work before attempting the demo item. If the
        // demo fails, a later replay retries it without recreating spaces that
        // already succeeded.
        updatePendingSpaces(failedSpaces);
        const allSpacesOk = failedSpaces.length === 0;

        let demoOk = true;
        if (demoUrl) {
          try {
            await createLinkItem({
              url: demoUrl,
              operationId: getOrCreatePendingOperationId(),
            });
          } catch {
            demoOk = false;
          }
        }

        // Only mark as done when all required mutations succeed.
        if (!allSpacesOk || !demoOk) return;

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
    createSpace,
    createLinkItem,
    entitled,
    entitlementLoading,
    pendingRevision,
    router,
    retryNonce,
  ]);
}
