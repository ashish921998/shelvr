/**
 * Read pixel dimensions from PNG, GIF, WebP, or JPEG header bytes. Returns
 * undefined for unsupported formats and truncated buffers.
 */
export function readImageSize(
  buffer: Uint8Array,
): { width: number; height: number } | undefined {
  if (
    buffer.length >= 24 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    const width =
      (buffer[16] << 24) |
      (buffer[17] << 16) |
      (buffer[18] << 8) |
      buffer[19];
    const height =
      (buffer[20] << 24) |
      (buffer[21] << 16) |
      (buffer[22] << 8) |
      buffer[23];
    return { width, height };
  }

  if (
    buffer.length >= 10 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46
  ) {
    return {
      width: buffer[6] | (buffer[7] << 8),
      height: buffer[8] | (buffer[9] << 8),
    };
  }

  if (
    buffer.length >= 30 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    const fourCC = String.fromCharCode(
      buffer[12],
      buffer[13],
      buffer[14],
      buffer[15],
    );
    if (fourCC === "VP8 ") {
      const width = (buffer[26] | (buffer[27] << 8)) & 0x3fff;
      const height = (buffer[28] | (buffer[29] << 8)) & 0x3fff;
      return { width, height };
    }
    if (fourCC === "VP8L") {
      const b0 = buffer[21];
      const b1 = buffer[22];
      const b2 = buffer[23];
      const b3 = buffer[24];
      const width = 1 + (((b1 & 0x3f) << 8) | b0);
      const height =
        1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      return { width, height };
    }
    if (fourCC === "VP8X") {
      const width =
        1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16));
      const height =
        1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16));
      return { width, height };
    }
  }

  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buffer[offset + 1];
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        const height = (buffer[offset + 5] << 8) | buffer[offset + 6];
        const width = (buffer[offset + 7] << 8) | buffer[offset + 8];
        return { width, height };
      }
      const segmentLength =
        (buffer[offset + 2] << 8) | buffer[offset + 3];
      if (segmentLength <= 0) break;
      offset += 2 + segmentLength;
    }
  }
  return undefined;
}
