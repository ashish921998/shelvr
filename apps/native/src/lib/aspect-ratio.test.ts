import { describe, expect, it } from "vitest";
import { clampRatio, letterboxedVideoRatio } from "./aspect-ratio";

describe("clampRatio", () => {
  it("uses the fallback for missing and invalid ratios", () => {
    expect(clampRatio(undefined, 1.2, 0.5, 2)).toBe(1.2);
    expect(clampRatio(Number.NaN, 1.2, 0.5, 2)).toBe(1.2);
    expect(clampRatio(0, 1.2, 0.5, 2)).toBe(1.2);
  });

  it("bounds ratios to the given limits", () => {
    expect(clampRatio(0.2, 1, 0.5, 2)).toBe(0.5);
    expect(clampRatio(3, 1, 0.5, 2)).toBe(2);
  });

  it("preserves ratios within the limits", () => {
    expect(clampRatio(1.4, 1, 0.6, 1.9)).toBe(1.4);
  });
});

describe("letterboxedVideoRatio", () => {
  const video = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  const stock = 480 / 360;

  it("crops a YouTube video's 4:3 stock thumbnail to the video's 16:9", () => {
    expect(letterboxedVideoRatio(video, stock)).toBe(16 / 9);
    expect(letterboxedVideoRatio("https://youtu.be/dQw4w9WgXcQ", stock)).toBe(
      16 / 9,
    );
    expect(
      letterboxedVideoRatio("https://www.youtube.com/live/abc123", stock),
    ).toBe(16 / 9);
  });

  it("leaves widescreen thumbnails, Shorts, channels and other sites alone", () => {
    expect(letterboxedVideoRatio(video, 16 / 9)).toBeUndefined();
    expect(letterboxedVideoRatio(video, undefined)).toBeUndefined();
    expect(
      letterboxedVideoRatio("https://www.youtube.com/shorts/abc123", stock),
    ).toBeUndefined();
    expect(
      letterboxedVideoRatio("https://www.youtube.com/@RickAstleyYT", stock),
    ).toBeUndefined();
    expect(letterboxedVideoRatio("https://vimeo.com/1", stock)).toBeUndefined();
    expect(letterboxedVideoRatio(undefined, stock)).toBeUndefined();
  });
});
