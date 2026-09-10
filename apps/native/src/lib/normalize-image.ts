import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { LocalImage } from '@/lib/use-save-image';

/** Long edge of the stored copy. Plenty for the feed and detail views, and
 * Gemini bills by 768px tiles rather than bytes, so a camera original buys
 * nothing but 5-10x the storage and feed bandwidth. */
export const MAX_IMAGE_EDGE = 1600;
const JPEG_QUALITY = 0.8;

/**
 * Re-encodes a picked or captured file into the copy Shelvr stores: long edge
 * capped, EXIF orientation baked into pixels, HEIC decoded to JPEG. PNG input
 * (stickers, screenshots, library PNGs) stays PNG so alpha and UI text survive.
 * EXIF is dropped; capture time and location were already lifted onto `image`
 * at import.
 */
export async function normalizeImage(image: LocalImage): Promise<LocalImage> {
  let rendered = await ImageManipulator.manipulate(image.uri).renderAsync();
  if (Math.max(rendered.width, rendered.height) > MAX_IMAGE_EDGE) {
    rendered = await ImageManipulator.manipulate(rendered)
      .resize(
        rendered.width >= rendered.height
          ? { width: MAX_IMAGE_EDGE }
          : { height: MAX_IMAGE_EDGE },
      )
      .renderAsync();
  }
  // ponytail: format by source type, no alpha scan; opaque PNGs cost a few
  // hundred KB more each. Sniff alpha if screenshots dominate storage.
  const format =
    image.isSticker || image.mimeType === 'image/png' ? SaveFormat.PNG : SaveFormat.JPEG;
  const saved = await rendered.saveAsync({ compress: JPEG_QUALITY, format });
  return {
    ...image,
    uri: saved.uri,
    width: saved.width,
    height: saved.height,
    mimeType: `image/${format}`,
  };
}
