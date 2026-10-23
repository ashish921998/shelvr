import { analytics } from "@/lib/analytics";
import { notificationPermissionState } from "@/lib/notification-token";
import * as SecureStore from "expo-secure-store";

const KEY = "shelvr.pending.weeklyShelf";

/** Onboarding allowed notifications before there was an account to store the weekly shelf on. */
export function queueWeeklyShelf() {
  SecureStore.setItem(KEY, "1");
}

/**
 * Turns on the weekly shelf onboarding queued, once the notification session has started. One
 * attempt only: a retry on a later launch could undo a choice made in Settings since.
 */
export async function applyQueuedWeeklyShelf(
  setWeeklyShelf: (enabled: boolean) => Promise<boolean | undefined>,
): Promise<void> {
  if (SecureStore.getItem(KEY) !== "1") return;
  // SecureStore's delete is async-only, so clearing writes ""; readers treat "" as unset.
  SecureStore.setItem(KEY, "");
  if ((await notificationPermissionState()) !== "granted") return;
  const enabled = await setWeeklyShelf(true);
  if (enabled === true) return;
  analytics.captureError(
    "weekly_shelf_preference_failed",
    new Error(enabled === false ? "not_registered" : "busy"),
  );
}
