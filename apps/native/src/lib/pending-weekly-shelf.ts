import { analytics } from "@/lib/analytics";
import { notificationPermissionState } from "@/lib/notification-token";
import { useNotificationSession } from "@/lib/notifications";
import { useConvexAuth } from "convex/react";
import * as SecureStore from "expo-secure-store";
import { useEffect } from "react";

const KEY = "shelvr.pending.weeklyShelf";

/** Onboarding allowed notifications before there was an account to store the weekly shelf on. */
export function queueWeeklyShelf() {
  SecureStore.setItem(KEY, "1");
}

function queued(): boolean {
  return SecureStore.getItem(KEY) === "1";
}

// SecureStore's delete is async-only, so clearing writes ""; readers treat "" as unset.
function clearQueued() {
  SecureStore.setItem(KEY, "");
}

/** Turns on the weekly shelf the first time an account is signed in after onboarding queued it. */
export async function applyQueuedWeeklyShelf(
  setWeeklyShelf: (enabled: boolean) => Promise<boolean | undefined>,
): Promise<void> {
  if (!queued()) return;
  if ((await notificationPermissionState()) !== "granted") {
    clearQueued();
    return;
  }
  const enabled = await setWeeklyShelf(true);
  if (enabled === true) {
    clearQueued();
    return;
  }
  analytics.captureError(
    "weekly_shelf_preference_failed",
    new Error(enabled === false ? "not_registered" : "busy"),
  );
}

/** Mount once in the signed-in app. */
export function usePendingWeeklyShelf(): void {
  const { isAuthenticated } = useConvexAuth();
  const { session } = useNotificationSession();
  useEffect(() => {
    if (!isAuthenticated) return;
    applyQueuedWeeklyShelf((enabled) => session.setWeeklyShelf(enabled)).catch(
      (error: unknown) =>
        analytics.captureError("weekly_shelf_preference_failed", error),
    );
  }, [isAuthenticated, session]);
}
