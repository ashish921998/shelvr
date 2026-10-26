import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

export type PlaceCardResult = "openSave" | "dismissed" | "unavailable";

type PresentArgs = {
  appleId: string;
  saveTitle: string;
  fromYourSave: string;
  openSave: string;
};

type ApplePlaceCardNativeModule = {
  isSupported: boolean;
  present: (
    appleId: string,
    saveTitle: string,
    fromYourSave: string,
    openSave: string,
  ) => Promise<PlaceCardResult>;
};

const nativeModule =
  Platform.OS === "ios"
    ? requireOptionalNativeModule<ApplePlaceCardNativeModule>("ApplePlaceCard")
    : null;

/** False on Android, web, iOS before 18 and binaries built without the module. */
export function placeCardAvailable(): boolean {
  return nativeModule?.isSupported === true;
}

export async function openPlaceCard(
  args: PresentArgs,
): Promise<PlaceCardResult> {
  if (nativeModule == null || !nativeModule.isSupported) return "unavailable";
  return nativeModule.present(
    args.appleId,
    args.saveTitle,
    args.fromYourSave,
    args.openSave,
  );
}
