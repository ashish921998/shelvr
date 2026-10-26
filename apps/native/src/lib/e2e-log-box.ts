import { LogBox, Platform, Settings } from "react-native";

import { isAnonymousAuthEnabled } from "@/lib/anonymous-auth";

const LAUNCH_ARGUMENT = "E2EHideLogBox";

/**
 * Keeps the development error banner off the screen during an e2e run.
 *
 * A development build shows every `console.error` as a banner over the bottom
 * of the screen, where the tab bar and the sheets' buttons are. One failed
 * background request (an analytics flush on a poor connection is enough) puts
 * it there, and a flow's next tap lands on the banner instead of the app. The
 * errors still reach the Metro log. Read only on development builds with dev
 * sign-in, the same gate as `e2e-hide-pro.ts`; a store build has no banner.
 */
export function hideLogBoxForE2E(): void {
  if (
    isAnonymousAuthEnabled() &&
    Platform.OS === "ios" &&
    Settings.get(LAUNCH_ARGUMENT) === "YES"
  ) {
    LogBox.ignoreAllLogs();
  }
}
