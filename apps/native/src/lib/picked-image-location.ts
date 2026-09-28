import { parseExifLocation, type ExifLocation } from '@/lib/exif';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import { Platform } from 'react-native';

type PickedImageMetadata = {
  assetId?: string | null;
  exif?: Record<string, unknown> | null;
};

type LocationDependencies = {
  platform: typeof Platform.OS;
  requestPhotoPermission: () => Promise<{ granted: boolean }>;
  getAssetLocation: (assetId: string) => Promise<ExifLocation | null>;
};

const nativeDependencies: LocationDependencies = {
  platform: Platform.OS,
  requestPhotoPermission: () => requestPermissionsAsync(false, ['photo']),
  getAssetLocation: (assetId) => new Asset(assetId).getLocation(),
};

function validLocation(location: ExifLocation | null): ExifLocation | undefined {
  if (!location) return undefined;
  const { latitude, longitude } = location;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return undefined;
  if (latitude === 0 && longitude === 0) return undefined;
  return { latitude, longitude };
}

/**
 * Resolve the location attached to a photo selected with ImagePicker.
 *
 * ImagePicker usually returns GPS tags through `exif`, but Android's system
 * photo picker may omit them even when the original MediaStore asset has a
 * location. In that case, ask for photo access and query the original asset.
 * Any denial, stale asset id, or missing location is intentionally non-fatal:
 * saving the image must continue, it simply will not appear on the map.
 */
export async function resolvePickedImageLocation(
  asset: PickedImageMetadata,
  dependencies: LocationDependencies = nativeDependencies,
): Promise<ExifLocation | undefined> {
  const exifLocation = parseExifLocation(asset.exif);
  if (exifLocation) return exifLocation;

  if (dependencies.platform !== 'android' || !asset.assetId) return undefined;

  try {
    const permission = await dependencies.requestPhotoPermission();
    if (!permission.granted) return undefined;
    return validLocation(await dependencies.getAssetLocation(asset.assetId));
  } catch {
    return undefined;
  }
}
