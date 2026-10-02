import { describe, expect, it } from "vitest";

import {
  fitMedia,
  isMediaSave,
  isStillTap,
  sheetUnderHeader,
  toggleFor,
} from "./media-viewer";

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

describe("isStillTap", () => {
  it("counts a press with no recorded start as a tap", () => {
    expect(isStillTap(null, { x: 100, y: 100 })).toBe(true);
  });

  it("counts a small wobble as a tap", () => {
    expect(isStillTap({ x: 100, y: 100 }, { x: 108, y: 108 })).toBe(true);
  });

  it("rejects an edge swipe that carried the finger across the screen", () => {
    expect(isStillTap({ x: 4, y: 300 }, { x: 160, y: 302 })).toBe(false);
  });

  it("treats travel of exactly the slop as a swipe", () => {
    expect(isStillTap({ x: 0, y: 0 }, { x: 12, y: 0 })).toBe(false);
  });
});

describe("sheetUnderHeader", () => {
  const sheetTop = 700;

  it("stays clear until the sheet comes within the slack of the header", () => {
    expect(sheetUnderHeader(684, sheetTop, false)).toBe(false);
    expect(sheetUnderHeader(685, sheetTop, false)).toBe(true);
  });

  it("needs twice the slack to switch back", () => {
    expect(sheetUnderHeader(680, sheetTop, true)).toBe(true);
    expect(sheetUnderHeader(668, sheetTop, true)).toBe(false);
  });

  it("holds either state in the band between the two thresholds", () => {
    expect(sheetUnderHeader(675, sheetTop, false)).toBe(false);
    expect(sheetUnderHeader(675, sheetTop, true)).toBe(true);
  });
});

describe("toggleFor", () => {
  it("turns a flag on for a save, then off again", () => {
    expect(toggleFor(null, "a")).toBe("a");
    expect(toggleFor("a", "a")).toBeNull();
  });

  it("turns the flag on when a recycled page still holds another save", () => {
    expect(toggleFor("a", "b")).toBe("b");
  });
});
