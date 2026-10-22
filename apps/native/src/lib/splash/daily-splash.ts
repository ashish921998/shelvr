import { createMMKV } from "react-native-mmkv";

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
 * True the first time it is asked on a given local day, and records that day.
 * The splash plays then; later launches that day go straight to the app. If
 * storage fails, it answers true, so the worst case is the old behaviour.
 */
export function claimDailySplash(now = new Date()): boolean {
  const today = localDay(now);
  try {
    const store = splashStore();
    if (store.getString(LAST_PLAYED_DAY) === today) return false;
    store.set(LAST_PLAYED_DAY, today);
  } catch {
    // Play the splash rather than skip it on a storage error.
  }
  return true;
}
