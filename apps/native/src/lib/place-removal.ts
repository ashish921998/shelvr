import { analytics } from "@/lib/analytics";
import { t } from "@/lib/i18n";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";

export function usePlaceRemoval() {
  const remove = useMutation(api.placeRemovals.removePlace);
  const restore = useMutation(api.placeRemovals.undoRemovePlace);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [pending, setPending] = useState<
    { removalId: Id<"placeRemovals">; name: string }[]
  >([]);
  const undo = pending[0] ?? null;
  useEffect(() => {
    if (!undo || busy) return;
    const timer = setTimeout(
      () => setPending((entries) => entries.slice(1)),
      6000,
    );
    return () => clearTimeout(timer);
  }, [undo, busy]);

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
        const removalId = await remove({
          itemId,
          name: pin.name,
          lat: pin.lat,
          lng: pin.lng,
          ...(pin.appleId ? { appleId: pin.appleId } : {}),
        });
        setPending((entries) => [...entries, { removalId, name: pin.name }]);
      }),
    restore: () =>
      run(async () => {
        if (!undo) return;
        await restore({ removalId: undo.removalId });
        setPending((entries) =>
          entries.filter((entry) => entry.removalId !== undo.removalId),
        );
      }),
  };
}
