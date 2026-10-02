import { describe, expect, it } from "vitest";

import { fitMedia, isMediaSave } from "./media-viewer";

describe("isMediaSave", () => {
  it("opens photos in the viewer", () => {
    expect(isMediaSave({ type: "image", imageUrl: "https://x/p.jpg" })).toBe(
      true,
    );
  });

  it("keeps stickers and photos without a picture on the page layout", () => {
    expect(
      isMediaSave({
        type: "image",
        imageUrl: "https://x/p.png",
        isSticker: true,
      }),
    ).toBe(false);
    expect(isMediaSave({ type: "image", imageUrl: null })).toBe(false);
    expect(isMediaSave(undefined)).toBe(false);
  });

  it("opens social posts with media, but not articles or notes", () => {
    expect(
      isMediaSave({
        type: "link",
        url: "https://www.instagram.com/reel/abc/",
        heroImageUrl: "https://x/poster.jpg",
      }),
    ).toBe(true);
    expect(
      isMediaSave({
        type: "link",
        url: "https://example.com/story",
        heroImageUrl: "https://x/og.jpg",
      }),
    ).toBe(false);
    expect(isMediaSave({ type: "note" })).toBe(false);
  });
});

describe("fitMedia", () => {
  it("fills the width when the picture is wide enough", () => {
    expect(fitMedia(2, 400, 800)).toEqual({ width: 400, height: 200 });
  });

  it("caps a tall picture at the box height and narrows it to match", () => {
    expect(fitMedia(0.25, 400, 800)).toEqual({ width: 200, height: 800 });
  });

  it("treats a missing or broken ratio as square", () => {
    expect(fitMedia(Number.NaN, 400, 800)).toEqual({ width: 400, height: 400 });
    expect(fitMedia(0, 400, 800)).toEqual({ width: 400, height: 400 });
  });
});
