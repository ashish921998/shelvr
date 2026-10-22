import { Platform, Settings } from "react-native";

import { isAnonymousAuthEnabled } from "@/lib/anonymous-auth";

const LAUNCH_ARGUMENT = "E2EHidePro";

export function isProHiddenForE2E(): boolean {
  return (
    isAnonymousAuthEnabled() &&
    Platform.OS === "ios" &&
    Settings.get(LAUNCH_ARGUMENT) === "YES"
  );
}
