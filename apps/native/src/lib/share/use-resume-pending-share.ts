import { decidePostAuthRoute } from '@/lib/share/pending-share';
import { hasPendingShare } from '@/lib/share/pending-share-store';
import { useOnboarding } from '@/lib/onboarding';
import { useConvexAuth } from 'convex/react';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

/**
 * After the user finishes onboarding and signs in, if a Share Sheet intent was
 * deferred, navigate to `/share` once instead of leaving them on Home.
 *
 * The flag is deliberately NOT consumed here — the share screen clears it once
 * the handoff is durable (session completed or explicitly discarded). If the
 * app dies between this navigation and that point, the flag survives and the
 * share resumes on the next launch instead of being silently dropped.
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
    const href = decidePostAuthRoute({ hasPendingShare: hasPendingShare() });
    if (href !== '/share') {
      navigatedRef.current = false;
      return;
    }
    // Already on the share screen (direct deep-link launch): it owns the flag.
    if (pathname === '/share') return;
    if (navigatedRef.current) return;

    navigatedRef.current = true;
    router.replace('/share');
  }, [isAuthenticated, isLoading, onboarded, pathname, router]);
}
