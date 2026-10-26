import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

export type PlaceCardResult = "dismissed" | "unavailable";

type ApplePlaceCardNativeModule = {
  isSupported: boolean;
  present: (appleId: string) => Promise<PlaceCardResult>;
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
  return nativeModule.present(appleId);
}
