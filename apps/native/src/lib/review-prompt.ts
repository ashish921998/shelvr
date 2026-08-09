import { analytics } from '@/lib/analytics';
import * as StoreReview from 'expo-store-review';
import { useEffect, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';

const PROMPTED_KEY = 'shelvr.review.prompted';
const READY_ITEM_THRESHOLD = 3;

type FeedItem = { status: 'processing' | 'ready' | 'failed' };

export function useReviewPrompt(items: FeedItem[] | undefined) {
  const triggered = useRef(false);

  useEffect(() => {
    if (!items || triggered.current) return;

    const readyCount = items.filter((i) => i.status === 'ready').length;
    if (readyCount < READY_ITEM_THRESHOLD) return;

    const alreadyPrompted = SecureStore.getItem(PROMPTED_KEY) === 'true';
    if (alreadyPrompted) {
      triggered.current = true;
      return;
    }

    triggered.current = true;
    SecureStore.setItem(PROMPTED_KEY, 'true');

    (async () => {
      try {
        if (await StoreReview.hasAction()) {
          analytics.capture('review_prompted', { ready_count: readyCount });
          await StoreReview.requestReview();
        }
      } catch {
        // Best-effort — Apple rate-limits internally and returns no signal.
      }
    })();
  }, [items]);
}
