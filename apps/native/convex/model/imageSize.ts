/**
 * Image dimensions read from a file's header bytes. Runtime-agnostic: it only
 * touches a Uint8Array, so both the page reader and the image backfill use it.
 */

type ImageSize = { width: number; height: number };

function readUint32BE(buf: Uint8Array, offset: number): number {
  return (
    (buf[offset] << 24) |
    (buf[offset + 1] << 16) |
    (buf[offset + 2] << 8) |
    buf[offset + 3]
  );
}

function readUint16BE(buf: Uint8Array, offset: number): number {
  return (buf[offset] << 8) | buf[offset + 1];
}

function readUint16LE(buf: Uint8Array, offset: number): number {
  return buf[offset] | (buf[offset + 1] << 8);
}

function hasBytes(
  buf: Uint8Array,
  offset: number,
  signature: number[],
): boolean {
  return signature.every((byte, i) => buf[offset + i] === byte);
}

// PNG — IHDR width/height are big-endian uint32 at offset 16/20.
function pngSize(buf: Uint8Array): ImageSize | undefined {
  if (buf.length < 24 || !hasBytes(buf, 0, [0x89, 0x50, 0x4e, 0x47])) {
    return undefined;
  }
  return { width: readUint32BE(buf, 16), height: readUint32BE(buf, 20) };
}

// GIF — little-endian uint16 at offset 6/8.
function gifSize(buf: Uint8Array): ImageSize | undefined {
  if (buf.length < 10 || !hasBytes(buf, 0, [0x47, 0x49, 0x46])) {
    return undefined;
  }
  return { width: readUint16LE(buf, 6), height: readUint16LE(buf, 8) };
}

// WebP — RIFF container tagged "WEBP", three sub-formats.
function webpSize(buf: Uint8Array): ImageSize | undefined {
  if (
    buf.length < 30 ||
    !hasBytes(buf, 0, [0x52, 0x49, 0x46, 0x46]) ||
    !hasBytes(buf, 8, [0x57, 0x45, 0x42, 0x50])
  ) {
    return undefined;
  }
  const fourCC = String.fromCharCode(buf[12], buf[13], buf[14], buf[15]);
  if (fourCC === "VP8 ") {
    return {
      width: readUint16LE(buf, 26) & 0x3fff,
      height: readUint16LE(buf, 28) & 0x3fff,
    };
  }
  if (fourCC === "VP8L") {
    const b0 = buf[21];
    const b1 = buf[22];
    const b2 = buf[23];
    const b3 = buf[24];
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    };
  }
  if (fourCC === "VP8X") {
    return {
      width: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)),
      height: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)),
    };
  }
  return undefined;
}

// JPEG — walk segments to the start-of-frame marker.
function jpegSize(buf: Uint8Array): ImageSize | undefined {
  if (buf.length < 2 || !hasBytes(buf, 0, [0xff, 0xd8])) {
    return undefined;
  }
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buf[offset + 1];
    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame) {
      return {
        height: readUint16BE(buf, offset + 5),
        width: readUint16BE(buf, offset + 7),
      };
    }
    const segLen = readUint16BE(buf, offset + 2);
    if (segLen <= 0) {
      break;
    }
    offset += 2 + segLen;
  }
  return undefined;
}

/**
 * Read the pixel dimensions straight from an image file's header bytes.
 * Covers PNG, GIF, WebP (VP8/VP8L/VP8X) and JPEG — no dependencies. Returns
 * undefined for formats we don't recognize or truncated buffers.
 */
export function readImageSize(buf: Uint8Array): ImageSize | undefined {
  return pngSize(buf) ?? gifSize(buf) ?? webpSize(buf) ?? jpegSize(buf);
}
