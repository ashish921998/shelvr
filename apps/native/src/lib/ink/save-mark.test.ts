import { describe, expect, it } from "vitest";
import { saveMark } from "./save-mark";

describe("saveMark", () => {
  it("marks a note and a photo by what they are", () => {
    expect(saveMark({ type: "note" })).toBe("note");
    expect(saveMark({ type: "image" })).toBe("photo");
  });

  it("marks a plain link as an article", () => {
    expect(
      saveMark({ type: "link", url: "https://paulgraham.com/do.html" }),
    ).toBe("article");
  });

  it("marks a short-form video link as a clip", () => {
    expect(
      saveMark({ type: "link", url: "https://www.instagram.com/reel/abc123/" }),
    ).toBe("video");
  });

  it("marks a social post as a clip only when its lead media plays", () => {
    const media = (kind: "photo" | "video") => [
      { kind, imageUrl: "https://x/i.jpg", aspectRatio: 1 },
    ];
    expect(
      saveMark({
        type: "link",
        url: "https://example.com/p",
        media: media("video"),
      }),
    ).toBe("video");
    expect(
      saveMark({
        type: "link",
        url: "https://example.com/p",
        media: media("photo"),
      }),
    ).toBe("article");
  });

  it("falls back to tags for recipes and products", () => {
    expect(
      saveMark({ type: "link", url: "https://a.test", tags: ["Dinner"] }),
    ).toBe("recipe");
    expect(
      saveMark({ type: "link", url: "https://a.test", tags: ["wishlist"] }),
    ).toBe("product");
    expect(
      saveMark({ type: "link", url: "https://a.test", tags: ["travel"] }),
    ).toBe("article");
  });

  it("lets what a save is beat what it is about", () => {
    expect(saveMark({ type: "note", tags: ["recipe"] })).toBe("note");
    expect(saveMark({ type: "image", tags: ["wishlist"] })).toBe("photo");
    expect(
      saveMark({
        type: "link",
        url: "https://www.instagram.com/reel/x/",
        tags: ["recipe"],
      }),
    ).toBe("video");
  });

  it("ignores tag case and stray spacing", () => {
    expect(
      saveMark({ type: "link", url: "https://a.test", tags: ["  Recipes "] }),
    ).toBe("recipe");
  });
});
