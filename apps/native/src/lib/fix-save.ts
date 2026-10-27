import { saveErrorCode } from "@convex/model/saveErrors";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { Alert } from "react-native";
import { analytics, type AnalyticsItem } from "@/lib/analytics";
import { confirmItemDelete } from "@/lib/confirm-item-delete";
import { usePaywallGuard } from "@/lib/entitlement";
import { t } from "@/lib/i18n";

type FixableSave = AnalyticsItem & { _id: Id<"items"> };

/** Retry and Delete for a save Home couldn't place, shared by the toast and the review sheet. */
export function useFixSave() {
  const reprocess = useMutation(api.items.reprocessItem);
  const deleteItem = useMutation(api.items.deleteItem);
  const { guard } = usePaywallGuard("home");

  const retry = async (save: FixableSave): Promise<void> => {
    try {
      const scheduled = await reprocess({ id: save._id });
      if (!scheduled) {
        Alert.alert(t("item.stillWorking"), t("item.retryLater"));
      }
    } catch (error) {
      const paywalled =
        saveErrorCode(error) === "pro_required" && !(await guard());
      if (!paywalled)
        Alert.alert(t("errors.retryTitle"), t("errors.retrySoon"));
    }
  };

  const remove = (save: FixableSave, onDeleted?: () => void): void => {
    confirmItemDelete(async () => {
      try {
        await deleteItem({ id: save._id });
        analytics.itemDeleted(save, "feed");
        onDeleted?.();
      } catch {
        Alert.alert(t("item.deleteFailed"), t("errors.retrySoon"));
      }
    });
  };

  return { retry, remove };
}
