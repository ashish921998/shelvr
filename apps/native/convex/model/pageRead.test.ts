import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { readImageSize } from "./imageDimensions";
import { pageGone, parsePageHtml } from "./pageRead";

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

describe("parsePageHtml", () => {
  it("extracts readable content and Open Graph metadata from HTML", () => {
    const page = parsePageHtml(
      fixture("article.html"),
      "https://example.com/posts/deep-useful",
    );

    expect(page).toMatchObject({
      title: "Deep & Useful",
      description: "A focused description — no fluff.",
      heroImageUrl: "https://example.com/images/hero.jpg",
      heroAspectRatio: 1200 / 630,
      siteName: "Example Journal",
    });
    expect(page.content).toContain("The first paragraph");
    expect(page.content).toContain("The second paragraph");
    expect(page.content).not.toContain("Home Topics Subscribe");
    expect(page.content).not.toContain("Copyright and newsletter links");
  });

  it("stays pure when a hero image needs network enrichment", () => {
    const page = parsePageHtml(
      fixture("basic-page.html"),
      "https://www.example.org/notes/plain",
    );

    expect(page).toEqual({
      title: "Plain & Direct",
      description: "A description from a regular meta tag.",
      heroImageUrl: "https://www.example.org/images/without-dimensions.jpg",
      heroAspectRatio: undefined,
      siteName: "example.org",
      content: "A concise page without Open Graph metadata.",
    });
  });
});

describe("readImageSize", () => {
  it("reads PNG dimensions from header bytes", () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47]);
    png.set([0x00, 0x00, 0x04, 0xb0], 16);
    png.set([0x00, 0x00, 0x02, 0x76], 20);

    expect(readImageSize(png)).toEqual({ width: 1200, height: 630 });
  });

  it("returns undefined for an unsupported or truncated image", () => {
    expect(readImageSize(new Uint8Array([0x89, 0x50]))).toBeUndefined();
  });
});

describe("pageGone", () => {
  it.each([404, 410])("treats HTTP %i as permanently gone", (status) => {
    expect(pageGone(status)).toBe(true);
  });

  it.each([403, 429, 500, 503, undefined])(
    "treats %s as retryable, not gone",
    (status) => {
      expect(pageGone(status)).toBe(false);
    },
  );
});
