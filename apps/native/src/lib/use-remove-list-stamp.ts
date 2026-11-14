import { analytics } from "@/lib/analytics";
import { t } from "@/lib/i18n";
import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { useCallback } from "react";
import { Alert } from "react-native";

export function useRemoveListStamp(): (name: string) => Promise<boolean> {
  const remove = useMutation(api.placeVisits.removeListStamp);
  return useCallback(
    async (name: string) => {
      try {
        await remove({ name });
        return true;
      } catch (error) {
        analytics.captureError("list_stamp_remove_failed", error);
        Alert.alert(t("errors.unexpectedTitle"), t("errors.retrySoon"));
        return false;
      }
    },
    [remove],
  );
}
