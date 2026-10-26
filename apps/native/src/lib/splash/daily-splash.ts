import { createMMKV } from "react-native-mmkv";

import { analytics } from "@/lib/analytics";

const LAST_PLAYED_DAY = "lastPlayedDay";

let store: ReturnType<typeof createMMKV> | undefined;
function splashStore() {
  store ??= createMMKV({ id: "splash" });
  return store;
}

/** The person's local calendar day, so "once a day" follows their clock. */
export function localDay(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Whether the splash already played today. The splash plays when this is
 * false. If storage fails it answers false, so the worst case is the old
 * behaviour of playing on every launch.
 */
export function playedSplashToday(now = new Date()): boolean {
  try {
    return splashStore().getString(LAST_PLAYED_DAY) === localDay(now);
  } catch (error) {
    analytics.captureError("splash_daily_read_failed", error);
    return false;
  }
}

/**
 * Records today's splash. Called once the splash has finished or been
 * skipped, so a launch a deep link takes over mid-splash leaves the day's
 * showing for a later launch.
 */
export function recordSplashPlayed(now = new Date()): void {
  try {
    splashStore().set(LAST_PLAYED_DAY, localDay(now));
  } catch (error) {
    analytics.captureError("splash_daily_record_failed", error);
  }
}
