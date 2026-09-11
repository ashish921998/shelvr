import { analytics } from '@/lib/analytics';
import { countEligibleSaves, isHomeRootRoute, markNativeReviewPrompted, type FeedbackFeedItem } from '@/lib/feedback';
import { isPaywallPending } from '@/lib/entitlement';
import { useSegments } from 'expo-router';
import { AppState } from 'react-native';
import * as StoreReview from 'expo-store-review';
import { useEffect, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';

const PROMPTED_KEY = 'shelvr.review.prompted';
const READY_ITEM_THRESHOLD = 3;

export function useReviewPrompt(items: FeedbackFeedItem[] | undefined) {
  const triggered = useRef(false);
  const home = isHomeRootRoute(useSegments());
  const homeRef = useRef(home);
  useEffect(() => { homeRef.current = home; }, [home]);

  useEffect(() => {
    if (!home || !items || triggered.current || isPaywallPending() || AppState.currentState !== 'active') return;
    if (items.some((item) => item.status === 'processing')) return;

    const readyCount = countEligibleSaves(items);
    if (readyCount < READY_ITEM_THRESHOLD) return;

    const alreadyPrompted = SecureStore.getItem(PROMPTED_KEY) === 'true';
    if (alreadyPrompted) {
      triggered.current = true;
      return;
    }

    triggered.current = true;
    SecureStore.setItem(PROMPTED_KEY, 'true');
    // The in-app feedback invitation shares this threshold; tell it the native
    // review flow claimed this moment so the two never fire together.
    markNativeReviewPrompted();

    (async () => {
      try {
        if (await StoreReview.hasAction() && homeRef.current && !isPaywallPending() && AppState.currentState === 'active') {
          analytics.capture('review_prompted', { ready_count: readyCount });
          await StoreReview.requestReview();
        }
      } catch {
        // Best-effort — Apple rate-limits internally and returns no signal.
      }
    })();
  }, [items, home]);
}
