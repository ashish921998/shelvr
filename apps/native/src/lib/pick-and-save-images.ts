import { analytics } from "@/lib/analytics";
import { parseExifDate } from "@/lib/date";
import { t } from "@/lib/i18n";
import { resolvePickedImageLocation } from "@/lib/picked-image-location";
import type { ImageSaveRequest } from "@/lib/use-save-image";
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";

async function pickImageRequests(): Promise<ImageSaveRequest[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: "images",
    allowsMultipleSelection: true,
    selectionLimit: 10,
    quality: 0.8,
    exif: true,
  });
  if (result.canceled) return [];
  return await Promise.all(
    result.assets.map(async (asset) => ({
      image: {
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        mimeType: asset.mimeType,
        capturedAt: parseExifDate(asset.exif),
        ...(await resolvePickedImageLocation(asset)),
      },
    })),
  );
}

/** A picker that fails says so, rather than leaving the tap to do nothing. */
export async function pickAndSaveImages(
  runImageRequests: (requests: ImageSaveRequest[]) => Promise<void>,
): Promise<void> {
  let requests: ImageSaveRequest[];
  try {
    requests = await pickImageRequests();
  } catch (error) {
    analytics.captureError("image_pick_failed", error);
    Alert.alert(t("errors.saveTitle"), t("errors.tryAgain"));
    return;
  }
  if (requests.length === 0) return;
  await runImageRequests(requests);
}
