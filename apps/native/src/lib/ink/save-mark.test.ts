import { describe, expect, it } from "vitest";
import { kindMark, saveMark } from "./save-mark";
import { SAVE_KINDS } from "@/lib/save-kinds";

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

describe("kindMark", () => {
  it("gives every save kind a mark", () => {
    for (const kind of SAVE_KINDS) {
      expect(kindMark(kind), kind).toBeTruthy();
    }
  });

  it("matches the kind to its obvious mark where one exists", () => {
    expect(kindMark("Articles")).toBe("article");
    expect(kindMark("Recipes")).toBe("recipe");
    expect(kindMark("Products")).toBe("product");
    expect(kindMark("Travel")).toBe("photo");
    expect(kindMark("Videos")).toBe("video");
  });

  it("shares a mark between kinds of the same family", () => {
    expect(kindMark("Home & decor")).toBe(kindMark("Products"));
    expect(kindMark("Fitness")).toBe(kindMark("Inspiration"));
  });
});
