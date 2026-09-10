import type { DetailItem } from '@/components/item-detail';
import { api } from '@convex/_generated/api';
import { useMutation } from 'convex/react';
import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { usePaywallGuard } from './entitlement';

// `productsStatus` is optional: a card row has not loaded it yet, and the
// server refuses a duplicate search anyway.
type SearchableItem = Pick<DetailItem, '_id' | 'status' | 'productsStatus'>;

export function useFindLinks(item: SearchableItem | undefined) {
  const search = useMutation(api.items.findLinks);
  const { guard, loading } = usePaywallGuard('item_detail');
  const inFlight = useRef(false);
  const [finding, setFinding] = useState(false);
  const disabled =
    loading ||
    finding ||
    !item ||
    item.status !== 'ready' ||
    item.productsStatus === 'searching' || item.productsStatus === 'unavailable';

  const findLinks = useCallback(async () => {
    if (disabled || !item || inFlight.current) return;
    inFlight.current = true;
    setFinding(true);
    try {
      if (await guard()) await search({ id: item._id });
    } catch {
      Alert.alert("Couldn't search", 'Please try again in a moment.');
    } finally {
      inFlight.current = false;
      setFinding(false);
    }
  }, [disabled, item, guard, search]);

  return { findLinks, finding, disabled };
}
