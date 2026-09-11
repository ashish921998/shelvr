import { analytics } from '@/lib/analytics';
import {
  countEligibleSaves,
  isHomeRootRoute,
  markNativeReviewPrompted,
  setNativeReviewAttemptInFlight,
  type FeedbackFeedItem,
} from '@/lib/feedback';
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

    // Claim the attempt so overlapping feed updates cannot start a second one
    // while hasAction() is pending. Nothing is persisted until the prompt is
    // actually about to fire.
    triggered.current = true;
    setNativeReviewAttemptInFlight(true);

    (async () => {
      let prompted = false;
      try {
        if (await StoreReview.hasAction() && homeRef.current && !isPaywallPending() && AppState.currentState === 'active') {
          prompted = true;
          SecureStore.setItem(PROMPTED_KEY, 'true');
          // The in-app feedback invitation shares this threshold; tell it the
          // native review flow claimed this moment so the two never fire together.
          markNativeReviewPrompted();
          analytics.capture('review_prompted', { ready_count: readyCount });
          await StoreReview.requestReview();
        }
      } catch {
        // Best-effort — Apple rate-limits internally and returns no signal.
      } finally {
        setNativeReviewAttemptInFlight(false);
        // A suppressed attempt (left Home, paywall opened, backgrounded, or no
        // review action) recorded nothing, so a later feed change may retry.
        if (!prompted) triggered.current = false;
      }
    })();
  }, [items, home]);
}
