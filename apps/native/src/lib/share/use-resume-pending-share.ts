import { decidePostAuthRoute } from "@/lib/share/pending-share";
import { hasPendingShareOnDevice } from "@/lib/share/pending-share-store";
import { hasUnreadSharedPayloads } from "@/lib/share/unread-payloads";
import { markDirectLaunch } from "@/lib/splash/launch-intent";
import { useOnboarding } from "@/lib/onboarding";
import { useConvexAuth } from "convex/react";
import { usePathname, useRouter } from "expo-router";
import { useEffect, useRef } from "react";

/**
 * After the user finishes onboarding and signs in, if a Share Sheet intent was
 * deferred, navigate to `/share` once instead of leaving them on Home.
 *
 * The flag is deliberately NOT consumed here — the share screen clears it once
 * the handoff is durable (session completed or explicitly discarded). If the
 * app dies between this navigation and that point, the flag survives and the
 * share resumes on the next launch instead of being silently dropped.
 *
 * The unread payload batch is a second, independent signal with the same
 * destination. On Android, a cold start from the share sheet can lose its
 * launch URL: Expo Router races `Linking.getInitialURL()` against a 150ms
 * timeout, and on a lost race the launch falls back to the plain root path —
 * no `/share` route, no deferred flag, and no `url` event later, because RN
 * emits that only from a warm `onNewIntent`. The shared payloads themselves
 * survive in the native store, so when they are still unread this hook
 * recovers the route the launch URL was supposed to carry.
 */
export function useResumePendingShare(): void {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { onboarded } = useOnboarding();
  const router = useRouter();
  const pathname = usePathname();
  // Prevent double navigation for the same pending flag without blocking a
  // later, distinct share that sets the flag again after it was cleared.
  const navigatedRef = useRef(false);

  useEffect(() => {
    if (isLoading || !onboarded || !isAuthenticated) {
      navigatedRef.current = false;
      return;
    }
    const href = decidePostAuthRoute({
      hasPendingShare: hasPendingShareOnDevice(),
      hasUnreadSharePayloads: hasUnreadSharedPayloads(),
    });
    if (href !== "/share") {
      navigatedRef.current = false;
      return;
    }
    // Already on the share screen (direct deep-link launch): it owns the flag.
    if (pathname === "/share") return;
    if (navigatedRef.current) return;

    navigatedRef.current = true;
    // The launch is heading somewhere specific — delivering a share — so the
    // splash stands down the same way it would have had the launch URL
    // reached the router.
    markDirectLaunch();
    router.replace("/share");
  }, [isAuthenticated, isLoading, onboarded, pathname, router]);
}
