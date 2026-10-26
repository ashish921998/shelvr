import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

export type PlaceCardResult = "dismissed" | "unavailable" | "cancelled";

type ApplePlaceCardNativeModule = {
  isSupported: boolean;
  begin: () => number;
  present: (appleId: string, request: number) => Promise<PlaceCardResult>;
  cancel: () => void;
};

const nativeModule =
  Platform.OS === "ios"
    ? requireOptionalNativeModule<ApplePlaceCardNativeModule>("ApplePlaceCard")
    : null;

/** False on Android, web, iOS before 18 and binaries built without the module. */
export function placeCardAvailable(): boolean {
  return nativeModule?.isSupported === true;
}

export async function openPlaceCard(appleId: string): Promise<PlaceCardResult> {
  if (nativeModule == null || !nativeModule.isSupported) return "unavailable";
  return nativeModule.present(appleId, nativeModule.begin());
}

/** Stops every lookup asked for so far from presenting, so a late card never covers another screen. */
export function cancelPlaceCard(): void {
  if (nativeModule?.isSupported === true) nativeModule.cancel();
}
