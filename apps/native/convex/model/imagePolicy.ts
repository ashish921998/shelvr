const MAX_IMAGE_MIB = 14;
export const MAX_STORED_IMAGE_BYTES = MAX_IMAGE_MIB * 1024 * 1024;
export const MAX_SPACE_PROMPT_BYTES = 64 * 1024;
export const IMAGE_TOO_LARGE_MESSAGE = `This photo is too large to read. Save a smaller copy (under ${MAX_IMAGE_MIB} MB).`;
export const IMAGE_EMPTY_MESSAGE = "This photo is empty. Please save it again.";

export function imageSizeErrorCode(
  size: number,
): "image_empty" | "image_too_large" | undefined {
  if (size === 0) return "image_empty";
  if (size > MAX_STORED_IMAGE_BYTES) return "image_too_large";
}

export function imageSizeError(size: number): string | undefined {
  const code = imageSizeErrorCode(size);
  if (code === "image_empty") return IMAGE_EMPTY_MESSAGE;
  if (code === "image_too_large") return IMAGE_TOO_LARGE_MESSAGE;
}

export const MAX_PHOTOS_PER_ACCOUNT = 1000;
export const PHOTO_LIMIT_MESSAGE = `Photo limit reached (${MAX_PHOTOS_PER_ACCOUNT.toLocaleString("en-US")}). Delete some photos to save more.`;

export function heifMediaType(bytes: Uint8Array): string | undefined {
  if (
    bytes.length < 16 ||
    String.fromCharCode(...bytes.subarray(4, 8)) !== "ftyp"
  )
    return;
  const size = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint32(0);
  if (size < 16 || size > bytes.length) return;
  const brands: string[] = [];
  for (let offset = 8; offset + 4 <= Math.min(size, 256); offset += 4) {
    if (offset !== 12)
      brands.push(String.fromCharCode(...bytes.subarray(offset, offset + 4)));
  }
  if (brands.some((b) => ["avif", "avis"].includes(b))) return "image/avif";
  if (brands.some((b) => ["heic", "heix", "hevc", "hevx"].includes(b)))
    return "image/heic";
  if (brands.some((b) => ["mif1", "msf1"].includes(b))) return "image/heif";
}
