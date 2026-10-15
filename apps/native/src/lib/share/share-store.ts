import { analytics } from "@/lib/analytics";
import { createMMKV } from "react-native-mmkv";

import { forgetDeletedShareItem, type SessionStoreAdapter } from "./storage";

// Dedicated MMKV instance for the share session record and the last-share
// tombstone. The adapter interface lives in storage.ts so its reconciliation
// rules stay pure and unit-testable with a Map; only this native binding is
// owned here.
export const shareStore: SessionStoreAdapter = createMMKV({
  id: "incoming-share",
});

/** Call after an item is deleted, so sharing the same content again saves it
 * instead of being skipped as an Android replay. Never throws: the delete has
 * already succeeded and must not be reported as failed. */
export function forgetDeletedSharedItem(itemId: string): void {
  try {
    forgetDeletedShareItem(shareStore, itemId);
  } catch (err) {
    analytics.captureError("forget_deleted_share_item_failed", err);
  }
}
