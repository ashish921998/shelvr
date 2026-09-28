// Tests the format and resize decisions in normalizeImage against a fake
// expo-image-manipulator. Native orientation, encoding, and alpha behaviour
// are not exercised here; those need a device or simulator run.
import { describe, expect, it, vi } from "vitest";

// Each fake context records the resize it was asked for and reports the
// "oriented" size the test provides. saveAsync echoes the requested format.
type Size = { width?: number; height?: number };
const contexts: { source: unknown; resizedTo?: Size }[] = [];
let renderedSize = { width: 100, height: 100 };

vi.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg", PNG: "png", WEBP: "webp" },
  ImageManipulator: {
    manipulate: (source: unknown) => {
      const record: { source: unknown; resizedTo?: Size } = { source };
      contexts.push(record);
      const context = {
        resize(size: Size) {
          record.resizedTo = size;
          return context;
        },
        renderAsync: async () => {
          const size = record.resizedTo ? resized(record.resizedTo) : renderedSize;
          return {
            ...size,
            saveAsync: async (options: { format: string }) => ({
              uri: `file:///out.${options.format}`,
              ...size,
            }),
          };
        },
      };
      return context;
    },
  },
}));

function resized(size: Size) {
  const scale = size.width ? size.width / renderedSize.width : size.height! / renderedSize.height;
  return {
    width: Math.round(renderedSize.width * scale),
    height: Math.round(renderedSize.height * scale),
  };
}

const { normalizeImage, MAX_IMAGE_EDGE } = await import("./normalize-image");

function setup(width: number, height: number) {
  contexts.length = 0;
  renderedSize = { width, height };
}

describe("normalizeImage", () => {
  it("keeps stickers as PNG", async () => {
    setup(900, 900);
    const out = await normalizeImage({ uri: "file:///s.tmp", isSticker: true });
    expect(out.mimeType).toBe("image/png");
    expect(out.uri).toBe("file:///out.png");
  });

  it("keeps PNG input as PNG by MIME, by extension when MIME is missing, and case-insensitively", async () => {
    setup(900, 900);
    expect((await normalizeImage({ uri: "file:///a.tmp", mimeType: "image/png" })).mimeType).toBe("image/png");
    expect((await normalizeImage({ uri: "file:///shot.PNG?x=1" })).mimeType).toBe("image/png");
    expect((await normalizeImage({ uri: "file:///a.tmp", mimeType: "IMAGE/PNG" })).mimeType).toBe("image/png");
  });

  it("encodes photos and HEIC as JPEG", async () => {
    setup(900, 900);
    expect((await normalizeImage({ uri: "file:///a.heic", mimeType: "image/heic" })).mimeType).toBe("image/jpeg");
    expect((await normalizeImage({ uri: "file:///a.tmp" })).mimeType).toBe("image/jpeg");
  });

  it("does not resize at or below the cap", async () => {
    setup(MAX_IMAGE_EDGE, 900);
    const out = await normalizeImage({ uri: "file:///a.jpg" });
    expect(contexts[0].resizedTo).toBeUndefined();
    expect(out).toMatchObject({ width: MAX_IMAGE_EDGE, height: 900 });
  });

  it("resizes the long edge from the oriented dimensions, reusing one context", async () => {
    // A 4000x3000 capture with EXIF orientation 6 renders as 3000x4000.
    setup(3000, 4000);
    const out = await normalizeImage({ uri: "file:///rot.jpg", width: 4000, height: 3000 });
    expect(contexts).toHaveLength(1);
    expect(contexts[0].resizedTo).toEqual({ height: MAX_IMAGE_EDGE });
    expect(out).toMatchObject({ width: 1200, height: MAX_IMAGE_EDGE });

    setup(4000, 3000);
    const landscape = await normalizeImage({ uri: "file:///a.jpg" });
    expect(contexts[0].resizedTo).toEqual({ width: MAX_IMAGE_EDGE });
    expect(landscape).toMatchObject({ width: MAX_IMAGE_EDGE, height: 1200 });
  });

  it("replaces file fields and keeps the import metadata", async () => {
    setup(4000, 3000);
    const out = await normalizeImage({
      uri: "file:///a.heic",
      width: 4000,
      height: 3000,
      mimeType: "image/heic",
      capturedAt: 1234,
      latitude: 12.5,
      longitude: -70.25,
    });
    expect(out).toEqual({
      uri: "file:///out.jpeg",
      width: MAX_IMAGE_EDGE,
      height: 1200,
      mimeType: "image/jpeg",
      capturedAt: 1234,
      latitude: 12.5,
      longitude: -70.25,
    });
  });
});
