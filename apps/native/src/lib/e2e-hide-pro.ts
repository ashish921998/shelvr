import { Platform, Settings } from "react-native";

import { isAnonymousAuthEnabled } from "@/lib/anonymous-auth";

/** Launch argument the paywall e2e flow passes: `-E2EHidePro YES`. */
const LAUNCH_ARGUMENT = "E2EHidePro";

/**
 * True when an e2e run asked the app to treat its user as not Pro.
 *
 * The anonymous dev user is always Pro (`getEntitlement` answers `lifetime`
 * for them), so no flow test could ever reach the Pro gate or the paywall.
 * iOS puts launch arguments in the user defaults, which `Settings` reads.
 * Only development builds with dev sign-in look at it, the same builds that
 * show the fixture reset, so the argument does nothing in a store build. It
 * changes what the client shows and nothing else: the server still decides
 * who may save. It also skips the exit offer after a paywall close, so the
 * flow lands on Home whether or not this simulator's offer is due.
 */
export function isProHiddenForE2E(): boolean {
  return (
    isAnonymousAuthEnabled() &&
    Platform.OS === "ios" &&
    Settings.get(LAUNCH_ARGUMENT) === "YES"
  );
}
