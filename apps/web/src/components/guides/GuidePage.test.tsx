import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import sitemap from "@/app/sitemap";
import { GUIDES } from "@/lib/guides";

import GuidePage from "./GuidePage";

const UNSHIPPED_CLAIMS = [
  /let them vote/i,
  /free trial/i,
  /\bfor free\b/i,
  /listens? to/i,
  /directions in Google Maps/i,
  /\bswap\b/i,
  /every stop has directions/i,
  /book(s|ing)? (a|your) (hotel|flight)s? for/i,
];

function decode(html: string) {
  return html
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&");
}

describe.each(GUIDES.map((guide) => [guide.path, guide] as const))(
  "guide %s",
  (path, guide) => {
    const markup = renderToStaticMarkup(<GuidePage page={guide} />);
    const text = decode(markup);

    it("shows its heading, steps, sections and questions", () => {
      expect(markup.match(/<h1[^>]*>/g)).toHaveLength(1);
      for (const part of [
        guide.heading,
        ...guide.steps,
        ...guide.sections.flatMap((s) => [s.heading, s.body]),
        ...guide.faqs.flatMap((f) => [f.q, f.a]),
      ]) {
        expect(text).toContain(part);
      }
    });

    it("asks for the App Store under the intro and in the header", () => {
      expect(
        markup.match(/aria-label="Map my saves, on the App Store"/g),
      ).toHaveLength(2);
      expect(text).toContain("On the App Store, for iPhone.");
    });

    it("links every other guide and the reel place finder", () => {
      for (const other of GUIDES) {
        if (other.path !== path)
          expect(markup).toContain(`href="${other.path}"`);
      }
      expect(markup).toContain('href="/reel-place-finder"');
    });

    it("gives search engines the same questions the page shows", () => {
      const json = markup.match(
        /<script type="application\/ld\+json">(.+?)<\/script>/,
      )?.[1];
      const graph = JSON.parse(decode(json ?? "{}"))["@graph"];
      expect(graph[0].url).toBe(`https://tryshelvr.app${path}`);
      expect(graph[1].mainEntity.map((q: { name: string }) => q.name)).toEqual(
        guide.faqs.map((f) => f.q),
      );
    });

    it("claims nothing the app does not do", () => {
      for (const pattern of UNSHIPPED_CLAIMS) expect(text).not.toMatch(pattern);
    });

    it("fits its title and description in a search result", () => {
      expect(guide.title.length).toBeLessThanOrEqual(65);
      expect(guide.description.length).toBeLessThanOrEqual(160);
    });

    it("is in the sitemap", () => {
      expect(sitemap().map((entry) => entry.url)).toContain(
        `https://tryshelvr.app${path}`,
      );
    });
  },
);

describe("guides", () => {
  it("each have their own path and title", () => {
    expect(new Set(GUIDES.map((g) => g.path)).size).toBe(GUIDES.length);
    expect(new Set(GUIDES.map((g) => g.title)).size).toBe(GUIDES.length);
  });
});
