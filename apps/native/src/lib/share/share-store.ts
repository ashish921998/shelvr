import { analytics } from "@/lib/analytics";
import { createMMKV } from "react-native-mmkv";

import { forgetDeletedShareItem, type SessionStoreAdapter } from "./storage";

export const shareStore: SessionStoreAdapter = createMMKV({
  id: "incoming-share",
});

export function forgetDeletedSharedItem(itemId: string): void {
  try {
    forgetDeletedShareItem(shareStore, itemId);
  } catch (err) {
    analytics.captureError("forget_deleted_share_item_failed", err);
  }
}
