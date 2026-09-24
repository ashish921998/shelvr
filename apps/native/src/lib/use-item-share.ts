import { t, useAppLocale } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import { shareUrl, useShareLink } from "@/lib/share-link";
import type { DetailItem } from "@/components/item-detail";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useCallback } from "react";
import { Share } from "react-native";

export function useItemShare(activeItem: DetailItem | undefined) {
  useAppLocale();
  const shareLink = useShareLink();
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
        const link = await shareLink(activeItem._id);
        const result = await Share.share({
          message: link ? `${message}\n\n${link}` : message,
        });
        shared = result.action !== Share.dismissedAction;
      } else if (activeItem.type === "link") {
        // No link for an unfinished save, or offline: share the source.
        const url = (await shareLink(activeItem._id)) ?? activeItem.url;
        if (!url) return;
        const result = await shareUrl(url);
        shared = result.action !== Share.dismissedAction;
      } else if (!activeItem.imageUrl || !(await Sharing.isAvailableAsync())) {
        if (!activeItem.url) return;
        const result = await shareUrl(activeItem.url);
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
  }, [activeItem, shareLink]);
}
