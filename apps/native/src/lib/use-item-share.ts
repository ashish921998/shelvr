import { analytics } from "@/lib/analytics";
import type { DetailItem } from "@/components/item-detail";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useCallback } from "react";
import { Share } from "react-native";

/** Share the active detail page: a note shares its text, a link shares its
 * URL, and an image/sticker shares the picture itself (expo-sharing needs a
 * local file, so the remote image is cached first). */
export function useItemShare(activeItem: DetailItem | undefined) {
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
        const result = await Share.share({ message });
        shared = result.action !== Share.dismissedAction;
      } else if (!activeItem.imageUrl) {
        if (!activeItem.url) return;
        const result = await Share.share({ url: activeItem.url });
        shared = result.action !== Share.dismissedAction;
      } else if (!(await Sharing.isAvailableAsync())) {
        if (!activeItem.url) return;
        const result = await Share.share({ url: activeItem.url });
        shared = result.action !== Share.dismissedAction;
      } else {
        const ext = activeItem.isSticker ? "png" : "jpg";
        const file = new File(Paths.cache, `${activeItem._id}.${ext}`);
        if (file.exists) file.delete();
        await File.downloadFileAsync(activeItem.imageUrl, file);
        await Sharing.shareAsync(file.uri, {
          mimeType: activeItem.isSticker ? "image/png" : "image/jpeg",
          UTI: activeItem.isSticker ? "public.png" : "public.jpeg",
          dialogTitle: activeItem.title ?? "Share",
        });
        shared = true;
        shareSheetOnly = true;
      }
    } catch {
      // User cancelled the sheet, or the download/share failed — nothing to do.
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
