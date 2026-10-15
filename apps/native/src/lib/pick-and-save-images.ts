import { parseExifDate } from "@/lib/date";
import { resolvePickedImageLocation } from "@/lib/picked-image-location";
import type { ImageSaveRequest } from "@/lib/use-save-image";
import * as ImagePicker from "expo-image-picker";

export async function pickAndSaveImages(
  runImageRequests: (requests: ImageSaveRequest[]) => Promise<void>,
): Promise<void> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: "images",
    allowsMultipleSelection: true,
    selectionLimit: 10,
    quality: 0.8,
    exif: true,
  });
  if (result.canceled || result.assets.length === 0) return;

  await runImageRequests(
    await Promise.all(
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
    ),
  );
}
