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

  it("crops YouTube's 4:3 stock thumbnails to the video's 16:9", () => {
    for (const name of ["hqdefault.jpg", "sddefault.jpg", "default.jpg"]) {
      expect(
        letterboxedVideoRatio(
          video,
          `https://i.ytimg.com/vi/dQw4w9WgXcQ/${name}`,
        ),
      ).toBe(16 / 9);
    }
    expect(
      letterboxedVideoRatio(
        "https://youtu.be/dQw4w9WgXcQ",
        "https://i.ytimg.com/vi_webp/dQw4w9WgXcQ/hqdefault.webp",
      ),
    ).toBe(16 / 9);
  });

  it("leaves widescreen thumbnails, Shorts and other sites alone", () => {
    const hq = "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg";
    expect(
      letterboxedVideoRatio(
        video,
        "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
      ),
    ).toBeUndefined();
    expect(
      letterboxedVideoRatio(
        video,
        "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
      ),
    ).toBeUndefined();
    expect(
      letterboxedVideoRatio("https://www.youtube.com/shorts/abc123", hq),
    ).toBeUndefined();
    expect(letterboxedVideoRatio("https://vimeo.com/1", hq)).toBeUndefined();
    expect(
      letterboxedVideoRatio(video, "https://example.com/hqdefault.jpg"),
    ).toBeUndefined();
    expect(letterboxedVideoRatio(video, undefined)).toBeUndefined();
  });
});
