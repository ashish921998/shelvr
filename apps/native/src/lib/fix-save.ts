import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { Alert } from "react-native";
import { analytics, type AnalyticsItem } from "@/lib/analytics";
import { confirmItemDelete } from "@/lib/confirm-item-delete";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { useProGate } from "@/lib/pro-gate";

type FixableSave = AnalyticsItem & { _id: Id<"items"> };

/** Retry and Delete for a save Home couldn't place, shared by the toast and the review sheet. */
export function useFixSave() {
  const reprocess = useMutation(api.items.reprocessItem);
  const deleteItem = useMutation(api.items.deleteItem);
  const { denied, passed } = useProGate("home");

  const retry = async (save: FixableSave): Promise<void> => {
    try {
      const scheduled = await reprocess({ id: save._id });
      if (scheduled) {
        passed();
        void haptics.impact();
      } else {
        Alert.alert(t("item.stillWorking"), t("item.retryLater"));
      }
    } catch (error) {
      if (!(await denied(error)))
        Alert.alert(t("errors.retryTitle"), t("errors.retrySoon"));
    }
  };

  const remove = (save: FixableSave, onDeleted?: () => void): void => {
    confirmItemDelete(async () => {
      try {
        await deleteItem({ id: save._id });
        void haptics.success();
        analytics.itemDeleted(save, "feed");
        onDeleted?.();
      } catch {
        Alert.alert(t("item.deleteFailed"), t("errors.retrySoon"));
      }
    });
  };

  return { retry, remove };
}
