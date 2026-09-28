import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { LocalImage } from '@/lib/use-save-image';

/** Long edge of the stored copy. Plenty for the feed and detail views, and
 * Gemini bills by 768px tiles rather than bytes, so a camera original buys
 * nothing but 5-10x the storage and feed bandwidth. */
export const MAX_IMAGE_EDGE = 1600;
const JPEG_QUALITY = 0.8;

/** PNG when the source says so, by MIME or by extension when the picker or
 * share sheet gives no MIME. No alpha scan: an opaque PNG screenshot costs a
 * few hundred KB more than JPEG would; sniff alpha if that ever dominates. */
function keepPng(image: LocalImage): boolean {
  return (
    image.isSticker === true ||
    image.mimeType?.toLowerCase() === 'image/png' ||
    /\.png$/i.test(image.uri.split('?')[0])
  );
}

/**
 * Re-encodes a picked or captured file into the copy Shelvr stores: long edge
 * capped, EXIF orientation baked into pixels, HEIC decoded to JPEG. PNG input
 * (stickers, screenshots, library PNGs) stays PNG so alpha and UI text survive.
 * EXIF is dropped; capture time and location were already lifted onto `image`
 * at import.
 */
export async function normalizeImage(image: LocalImage): Promise<LocalImage> {
  // One context: the first render applies orientation, and the resize appends
  // to the same chain so iOS does not redraw the full-size image a second time.
  const context = ImageManipulator.manipulate(image.uri);
  let rendered = await context.renderAsync();
  if (Math.max(rendered.width, rendered.height) > MAX_IMAGE_EDGE) {
    // Axis from the oriented dimensions; a rotated 4000x3000 is 3000x4000 here.
    context.resize(
      rendered.width >= rendered.height
        ? { width: MAX_IMAGE_EDGE }
        : { height: MAX_IMAGE_EDGE },
    );
    rendered = await context.renderAsync();
  }
  const format = keepPng(image) ? SaveFormat.PNG : SaveFormat.JPEG;
  const saved = await rendered.saveAsync({ compress: JPEG_QUALITY, format });
  return {
    ...image,
    uri: saved.uri,
    width: saved.width,
    height: saved.height,
    mimeType: `image/${format}`,
  };
}
