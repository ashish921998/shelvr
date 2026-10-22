type ImageSize = { width: number; height: number };

// PNG stores dimensions as unsigned 32-bit values capped at 2^31 - 1.
const PNG_MAX_DIMENSION = 0x7fffffff;

function view(buf: Uint8Array): DataView {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
}

function hasBytes(
  buf: Uint8Array,
  offset: number,
  signature: number[],
): boolean {
  return signature.every((byte, i) => buf[offset + i] === byte);
}

function pngSize(buf: Uint8Array): ImageSize | undefined {
  if (buf.length < 24 || !hasBytes(buf, 0, [0x89, 0x50, 0x4e, 0x47])) {
    return undefined;
  }
  const data = view(buf);
  const width = data.getUint32(16);
  const height = data.getUint32(20);
  if (width > PNG_MAX_DIMENSION || height > PNG_MAX_DIMENSION) {
    return undefined;
  }
  return { width, height };
}

function gifSize(buf: Uint8Array): ImageSize | undefined {
  if (buf.length < 10 || !hasBytes(buf, 0, [0x47, 0x49, 0x46])) {
    return undefined;
  }
  const data = view(buf);
  return { width: data.getUint16(6, true), height: data.getUint16(8, true) };
}

// Little-endian 24-bit value, as VP8X stores its canvas size minus one.
function getUint24LE(data: DataView, offset: number): number {
  return data.getUint16(offset, true) | (data.getUint8(offset + 2) << 16);
}

function webpSize(buf: Uint8Array): ImageSize | undefined {
  if (
    buf.length < 30 ||
    !hasBytes(buf, 0, [0x52, 0x49, 0x46, 0x46]) ||
    !hasBytes(buf, 8, [0x57, 0x45, 0x42, 0x50])
  ) {
    return undefined;
  }
  const data = view(buf);
  const fourCC = String.fromCharCode(...buf.subarray(12, 16));
  if (fourCC === "VP8 ") {
    return {
      width: data.getUint16(26, true) & 0x3fff,
      height: data.getUint16(28, true) & 0x3fff,
    };
  }
  if (fourCC === "VP8L") {
    // 14-bit width and height minus one, packed after the 0x2f signature.
    const bits = data.getUint32(21, true);
    return {
      width: 1 + (bits & 0x3fff),
      height: 1 + ((bits >>> 14) & 0x3fff),
    };
  }
  if (fourCC === "VP8X") {
    return {
      width: 1 + getUint24LE(data, 24),
      height: 1 + getUint24LE(data, 27),
    };
  }
  return undefined;
}

function isStartOfFrame(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function jpegSize(buf: Uint8Array): ImageSize | undefined {
  if (buf.length < 2 || !hasBytes(buf, 0, [0xff, 0xd8])) {
    return undefined;
  }
  const data = view(buf);
  let offset = 2;
  // A marker's header is 9 bytes: FF, marker, length (2), precision, height
  // (2), width (2).
  while (offset + 9 < buf.length) {
    if (data.getUint8(offset) !== 0xff) {
      offset++;
      continue;
    }
    if (isStartOfFrame(data.getUint8(offset + 1))) {
      return {
        height: data.getUint16(offset + 5),
        width: data.getUint16(offset + 7),
      };
    }
    const segLen = data.getUint16(offset + 2);
    if (segLen <= 0) {
      break;
    }
    offset += 2 + segLen;
  }
  return undefined;
}

/** Undefined for unrecognized or truncated buffers. */
export function readImageSize(buf: Uint8Array): ImageSize | undefined {
  return pngSize(buf) ?? gifSize(buf) ?? webpSize(buf) ?? jpegSize(buf);
}
