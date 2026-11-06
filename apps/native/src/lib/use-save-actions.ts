import type { DetailItem } from "@/components/item-detail";
import type { ActionMenuItem } from "@/components/ui/action-menu";
import { analytics } from "@/lib/analytics";
import { confirmItemDelete } from "@/lib/confirm-item-delete";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { forgetDeletedSharedItem } from "@/lib/share/share-store";
import { useItemShare } from "@/lib/use-item-share";
import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import * as Clipboard from "expo-clipboard";
import { useCallback } from "react";
import { Alert } from "react-native";

export function useSaveActions(
  item: DetailItem | undefined,
  surface: "item_detail" | "feed",
  {
    beforeRemove,
    onRemoved,
  }: { beforeRemove?: () => void; onRemoved?: () => void } = {},
) {
  const share = useItemShare(item, surface);
  const deleteItem = useMutation(api.items.deleteItem);

  const copyLink = useCallback(async () => {
    if (!item?.url) return;
    await Clipboard.setStringAsync(item.url);
    analytics.capture("item_link_copied");
    analytics.itemAction(item, "copy");
    void haptics.success();
  }, [item]);

  const remove = useCallback(() => {
    if (!item) return;
    confirmItemDelete(async () => {
      beforeRemove?.();
      try {
        await deleteItem({ id: item._id });
        forgetDeletedSharedItem(item._id);
        analytics.itemDeleted(item, surface);
        onRemoved?.();
      } catch {
        Alert.alert(t("item.deleteFailed"), t("errors.retrySoon"));
      }
    });
  }, [item, deleteItem, surface, beforeRemove, onRemoved]);

  const actions: ActionMenuItem[] = [
    { label: t("common.share"), onPress: share },
    ...(item?.url ? [{ label: t("item.copyLink"), onPress: copyLink }] : []),
    { label: t("common.delete"), destructive: true, onPress: remove },
  ];
  return { share, copyLink, remove, actions };
}
