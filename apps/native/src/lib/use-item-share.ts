import { t, useAppLocale } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import { shareableItemUrl } from "@/lib/web-url";
import type { DetailItem } from "@/components/item-detail";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useCallback } from "react";
import { Share } from "react-native";

export function useItemShare(activeItem: DetailItem | undefined) {
  useAppLocale();
  return useCallback(async () => {
    if (!activeItem) return;

    let shared = false;
    let shareSheetOnly = false;
    try {
      if (activeItem.type === "note") {
        const message =
          activeItem.note ??
          activeItem.content ??
          activeItem.description ??
          activeItem.title;
        if (!message) return;
        const result = await Share.share({
          message: `${message}\n\n${shareableItemUrl(activeItem._id)}`,
        });
        shared = result.action !== Share.dismissedAction;
      } else if (!activeItem.imageUrl) {
        if (!activeItem.url) return;
        const result = await Share.share({
          url: shareableItemUrl(activeItem._id),
        });
        shared = result.action !== Share.dismissedAction;
      } else if (!(await Sharing.isAvailableAsync())) {
        if (!activeItem.url) return;
        const result = await Share.share({
          url: shareableItemUrl(activeItem._id),
        });
        shared = result.action !== Share.dismissedAction;
      } else {
        const ext = activeItem.isSticker ? "png" : "jpg";
        const file = new File(Paths.cache, `${activeItem._id}.${ext}`);
        if (file.exists) file.delete();
        await File.downloadFileAsync(activeItem.imageUrl, file);
        await Sharing.shareAsync(file.uri, {
          mimeType: activeItem.isSticker ? "image/png" : "image/jpeg",
          UTI: activeItem.isSticker ? "public.png" : "public.jpeg",
          dialogTitle: activeItem.title ?? t("common.share"),
        });
        shared = true;
        shareSheetOnly = true;
      }
    } catch {
      // Dismissed or failed share is not a completed action.
    }

    if (shared) {
      analytics.capture("item_shared");
      analytics.itemAction(
        activeItem,
        shareSheetOnly ? "share_sheet_opened" : "share",
      );
    }
  }, [activeItem]);
}
