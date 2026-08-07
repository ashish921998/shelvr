import { decidePostAuthRoute } from '@/lib/share/pending-share';
import {
  consumePendingShare,
  hasPendingShare,
} from '@/lib/share/pending-share-store';
import { useOnboarding } from '@/lib/onboarding';
import { useConvexAuth } from 'convex/react';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

/**
 * After the user finishes onboarding and signs in, if a Share Sheet intent was
 * deferred, navigate to `/share` once instead of leaving them on Home.
 */
export function useResumePendingShare(): void {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { onboarded } = useOnboarding();
  const router = useRouter();
  // Prevent double navigation for the same pending flag without blocking a
  // later, distinct share that sets the flag again after we cleared it.
  const lastConsumedRef = useRef(false);

  useEffect(() => {
    if (isLoading || !onboarded || !isAuthenticated) {
      lastConsumedRef.current = false;
      return;
    }
    if (!hasPendingShare()) {
      lastConsumedRef.current = false;
      return;
    }
    if (lastConsumedRef.current) return;

    lastConsumedRef.current = true;
    const shouldResume = consumePendingShare();
    const href = decidePostAuthRoute({ hasPendingShare: shouldResume });
    if (href === '/share') {
      router.replace('/share');
    }
  }, [isAuthenticated, isLoading, onboarded, router]);
}
