const MAX_IMAGE_MIB = 14;
// Base64 expands this to ~19.6 MB, leaving room for prompts below Gemini's
// 20 MB inline request limit. Cap space candidates by JSON-escaped
// UTF-8 bytes as part of the same budget. Check size before allocating bytes.
export const MAX_STORED_IMAGE_BYTES = MAX_IMAGE_MIB * 1024 * 1024;
export const MAX_SPACE_PROMPT_BYTES = 64 * 1024;
export const IMAGE_TOO_LARGE_MESSAGE = `This photo is too large to read. Save a smaller copy (under ${MAX_IMAGE_MIB} MB).`;

export function imageSizeError(size: number): string | undefined {
  if (size === 0) return "This photo is empty. Please save it again.";
  if (size > MAX_STORED_IMAGE_BYTES) return IMAGE_TOO_LARGE_MESSAGE;
}

/** Recognize HEIF containers independently of the SDK's narrow ftyp prefix. */
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
