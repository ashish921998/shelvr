import { analytics } from "@/lib/analytics";
import { t } from "@/lib/i18n";
import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { useCallback, useRef, useState } from "react";
import { Alert } from "react-native";

export function useRemoveListStamp(): {
  remove: (
    name: string,
    spot?: { lat: number; lng: number },
  ) => Promise<boolean>;
  busy: boolean;
} {
  const mutate = useMutation(api.placeVisits.removeListStamp);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const remove = useCallback(
    async (name: string, spot?: { lat: number; lng: number }) => {
      if (pending.current) return false;
      pending.current = true;
      setBusy(true);
      try {
        await mutate(spot === undefined ? { name } : { name, spot });
        return true;
      } catch (error) {
        analytics.captureError("list_stamp_remove_failed", error);
        Alert.alert(t("errors.unexpectedTitle"), t("errors.retrySoon"));
        return false;
      } finally {
        pending.current = false;
        setBusy(false);
      }
    },
    [mutate],
  );
  return { remove, busy };
}
