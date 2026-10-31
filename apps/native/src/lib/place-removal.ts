import { analytics } from "@/lib/analytics";
import { t } from "@/lib/i18n";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Alert } from "react-native";

export function usePlaceRemoval() {
  const remove = useMutation(api.placeVisits.removePlace);
  const restore = useMutation(api.placeVisits.undoRemovePlace);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [undo, setUndo] = useState<{
    itemIds: Id<"items">[];
    operationId: string;
    name: string;
  } | null>(null);
  useEffect(() => {
    if (!undo) return;
    AccessibilityInfo.announceForAccessibility(
      t("cityMap.removedPlace", { name: undo.name }),
    );
    const timer = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(timer);
  }, [undo]);

  const run = async (action: () => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      analytics.captureError("place_removal_failed", error);
      Alert.alert(t("errors.unexpectedTitle"), t("errors.retrySoon"));
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  return {
    busy,
    undo,
    remove: (
      itemId: Id<"items">,
      pin: { name: string; lat: number; lng: number; appleId?: string },
    ) =>
      run(async () => {
        const operationId = randomUUID();
        const itemIds = await remove({
          itemId,
          name: pin.name,
          lat: pin.lat,
          lng: pin.lng,
          ...(pin.appleId ? { appleId: pin.appleId } : {}),
          operationId,
        });
        if (itemIds.length) setUndo({ itemIds, operationId, name: pin.name });
      }),
    restore: () =>
      run(async () => {
        if (!undo) return;
        await restore({ itemIds: undo.itemIds, operationId: undo.operationId });
        setUndo(null);
      }),
  };
}
