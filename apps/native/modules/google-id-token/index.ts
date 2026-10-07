import { requireOptionalNativeModule } from "expo-modules-core";

type GoogleIdTokenNativeModule = {
  /**
   * Shows the Google account sheet. Resolves the chosen account's ID token,
   * or null when the person dismisses it; rejects when it cannot show.
   */
  getIdToken(serverClientId: string): Promise<string | null>;
};

/**
 * The Android Google account sheet, or null where it is not linked (iOS, and
 * Android builds made before it shipped).
 */
export const googleIdToken =
  requireOptionalNativeModule<GoogleIdTokenNativeModule>("GoogleIdToken");
