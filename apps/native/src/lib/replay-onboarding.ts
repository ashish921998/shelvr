import { api } from '@convex/_generated/api';
import { useConvexAuth, useMutation } from 'convex/react';
import { useEffect, useRef } from 'react';
import {
  clearPending,
  getPendingSpaces,
  getPendingDemoUrl,
  hasPending,
  isReplayed,
  markReplayed,
} from './pending-onboarding';
import { presentPaywall, useEntitlement, waitForSheetTransition } from './entitlement';

/**
 * After sign-in, replay deferred onboarding data: create the spaces the user
 * picked and the demo link they saved. Then present the paywall. Runs once.
 *
 * Mounted in (app)/_layout.tsx so it fires as soon as the user is authenticated
 * and lands in the app group.
 */
export function useReplayOnboarding() {
  const { isAuthenticated } = useConvexAuth();
  const { entitled } = useEntitlement();
  const createSpace = useMutation(api.spaces.createSpace);
  const createLinkItem = useMutation(api.items.createLinkItem);
  const ranRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || ranRef.current) return;
    if (!hasPending()) return;
    if (isReplayed()) return;

    ranRef.current = true;
    markReplayed();

    const spaces = getPendingSpaces();
    const demoUrl = getPendingDemoUrl();

    const run = async () => {
      await Promise.allSettled(
        spaces.map((name) => createSpace({ name }).catch(() => undefined)),
      );
      if (demoUrl) {
        try {
          await createLinkItem({ url: demoUrl });
        } catch {
          // Swallow — the demo item is best-effort.
        }
      }
      clearPending();
      if (!entitled) {
        await waitForSheetTransition();
        void presentPaywall();
      }
    };

    void run();
  }, [isAuthenticated, createSpace, createLinkItem, entitled]);
}
