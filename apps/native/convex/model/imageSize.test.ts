import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { readImageSize } from "./imageSize";

function bytes(length: number, at: Record<number, number[]>): Uint8Array {
  const buf = new Uint8Array(length);
  for (const [offset, values] of Object.entries(at)) {
    buf.set(values, Number(offset));
  }
  return buf;
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

function png(width: number, height: number): Uint8Array {
  const buf = bytes(24, { 0: PNG, 12: ascii("IHDR") });
  const data = new DataView(buf.buffer);
  data.setUint32(16, width);
  data.setUint32(20, height);
  return buf;
}

describe("readImageSize", () => {
  it("reads a PNG header", () => {
    expect(readImageSize(png(1200, 800))).toEqual({ width: 1200, height: 800 });
  });

  it("refuses a PNG dimension past the format's 2^31 - 1 cap", () => {
    expect(readImageSize(png(0x80000000, 10))).toBeUndefined();
    expect(readImageSize(png(10, 0xffffffff))).toBeUndefined();
    expect(readImageSize(png(0x7fffffff, 1))).toEqual({
      width: 0x7fffffff,
      height: 1,
    });
  });

  it("reads a GIF header", () => {
    expect(
      readImageSize(
        bytes(10, { 0: ascii("GIF89a"), 6: [0x40, 0x01, 0xf0, 0] }),
      ),
    ).toEqual({ width: 320, height: 240 });
  });

  it("reads a lossy VP8 WebP, masking the scale bits", () => {
    const buf = bytes(30, {
      0: RIFF,
      8: WEBP,
      12: ascii("VP8 "),
      26: [0x80, 0xc2, 0x58, 0x02],
    });
    expect(readImageSize(buf)).toEqual({ width: 640, height: 600 });
  });

  it("reads a lossless VP8L WebP", () => {
    // width - 1 = 799 and height - 1 = 449, packed as 14-bit fields.
    const bits = 799 | (449 << 14);
    const buf = bytes(30, { 0: RIFF, 8: WEBP, 12: ascii("VP8L"), 20: [0x2f] });
    new DataView(buf.buffer).setUint32(21, bits, true);
    expect(readImageSize(buf)).toEqual({ width: 800, height: 450 });
  });

  it("reads an extended VP8X WebP canvas", () => {
    // 24-bit little-endian width - 1 = 4095 and height - 1 = 70000.
    const buf = bytes(30, {
      0: RIFF,
      8: WEBP,
      12: ascii("VP8X"),
      24: [0xff, 0x0f, 0x00, 0x70, 0x11, 0x01],
    });
    expect(readImageSize(buf)).toEqual({ width: 4096, height: 70001 });
  });

  it("refuses an unknown WebP chunk", () => {
    expect(
      readImageSize(bytes(30, { 0: RIFF, 8: WEBP, 12: ascii("ALPH") })),
    ).toBeUndefined();
  });

  it("skips JPEG segments to the start-of-frame marker", () => {
    const buf = bytes(40, {
      0: [0xff, 0xd8],
      // APP0, 16 bytes long.
      2: [0xff, 0xe0, 0x00, 0x10],
      // SOF2 (progressive): precision, height 0x0438, width 0x0780.
      20: [0xff, 0xc2, 0x00, 0x11, 0x08, 0x04, 0x38, 0x07, 0x80],
    });
    expect(readImageSize(buf)).toEqual({ width: 1920, height: 1080 });
  });

  it("skips stray bytes between JPEG markers", () => {
    const buf = bytes(20, {
      0: [0xff, 0xd8, 0x00, 0x00],
      4: [0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x10, 0x00, 0x20],
    });
    expect(readImageSize(buf)).toEqual({ width: 32, height: 16 });
  });

  it("does not take DHT or JPG markers for a frame", () => {
    for (const marker of [0xc4, 0xc8, 0xcc]) {
      const buf = bytes(20, {
        0: [0xff, 0xd8],
        2: [0xff, marker, 0x00, 0x11, 0x08, 0x00, 0x10, 0x00, 0x20],
      });
      expect(readImageSize(buf)).toBeUndefined();
    }
  });

  it("stops on a zero-length JPEG segment", () => {
    const buf = bytes(30, {
      0: [0xff, 0xd8],
      2: [0xff, 0xe1, 0x00, 0x00],
      6: [0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x10, 0x00, 0x20],
    });
    expect(readImageSize(buf)).toBeUndefined();
  });

  it("is undefined for truncated or unknown buffers", () => {
    expect(readImageSize(new Uint8Array())).toBeUndefined();
    expect(readImageSize(png(1, 1).subarray(0, 23))).toBeUndefined();
    expect(readImageSize(bytes(9, { 0: ascii("GIF89a") }))).toBeUndefined();
    expect(
      readImageSize(bytes(29, { 0: RIFF, 8: WEBP, 12: ascii("VP8X") })),
    ).toBeUndefined();
    expect(readImageSize(bytes(11, { 0: [0xff, 0xd8] }))).toBeUndefined();
    expect(readImageSize(bytes(64, { 0: ascii("<html>") }))).toBeUndefined();
  });

  it("reads a view that does not start at its buffer's first byte", () => {
    const padded = new Uint8Array(40);
    padded.set(png(64, 48), 16);
    expect(readImageSize(padded.subarray(16))).toEqual({
      width: 64,
      height: 48,
    });
  });

  it("never throws on arbitrary bytes behind a known signature", () => {
    const signature = fc.constantFrom(
      PNG,
      ascii("GIF8"),
      [...RIFF, 0, 0, 0, 0, ...WEBP, ...ascii("VP8 ")],
      [...RIFF, 0, 0, 0, 0, ...WEBP, ...ascii("VP8L")],
      [...RIFF, 0, 0, 0, 0, ...WEBP, ...ascii("VP8X")],
      [0xff, 0xd8],
    );
    fc.assert(
      fc.property(signature, fc.uint8Array({ maxLength: 80 }), (head, tail) => {
        const buf = new Uint8Array([...head, ...tail]);
        const size = readImageSize(buf);
        if (size !== undefined) {
          expect(Number.isInteger(size.width)).toBe(true);
          expect(Number.isInteger(size.height)).toBe(true);
          expect(size.width).toBeGreaterThanOrEqual(0);
          expect(size.height).toBeGreaterThanOrEqual(0);
        }
      }),
    );
  });
});
