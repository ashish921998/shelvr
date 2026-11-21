import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AlternativesHub from "@/app/alternatives/page";
import sitemap from "@/app/sitemap";
import {
  ALTERNATIVES,
  alternativePath,
  ROWS,
  SHELVR_CELLS,
} from "@/lib/alternatives";

import AlternativePage from "./AlternativePage";

const SITE = "https://tryshelvr.app";
const PRICE_CLAIMS = [/\bfree\b/i, /\$\d/, /€/, /\bprice/i, /\btrial\b/i];

function decode(html: string) {
  return html
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&");
}

describe.each(ALTERNATIVES.map((alt) => [alt.slug, alt] as const))(
  "comparison with %s",
  (slug, alt) => {
    const markup = renderToStaticMarkup(<AlternativePage alt={alt} />);
    const text = decode(markup);

    it("fills every row for both apps", () => {
      for (const row of ROWS) {
        expect(SHELVR_CELLS[row.key].trim()).not.toBe("");
        expect(alt.cells[row.key].trim()).not.toBe("");
        expect(text).toContain(row.label);
        expect(text).toContain(alt.cells[row.key]);
      }
    });

    it("says what the other app does better as well as Shelvr", () => {
      expect(alt.pickThem.length).toBeGreaterThan(0);
      expect(alt.pickShelvr.length).toBeGreaterThan(0);
      for (const item of [...alt.pickThem, ...alt.pickShelvr]) {
        expect(text).toContain(item);
      }
    });

    it("names its sources without passing them ranking", () => {
      expect(alt.sources.length).toBeGreaterThan(0);
      for (const source of alt.sources) {
        expect(source.url).toMatch(/^https:\/\//);
        expect(markup).toContain(
          `href="${source.url}" rel="nofollow noopener noreferrer"`,
        );
      }
      expect(text).toContain("as of November 2026");
    });

    it("makes no price claim for Shelvr", () => {
      for (const claim of [...Object.values(SHELVR_CELLS), ...alt.pickShelvr]) {
        for (const pattern of PRICE_CLAIMS) expect(claim).not.toMatch(pattern);
      }
    });

    it("gives search engines the same questions the page shows", () => {
      const json = markup.match(
        /<script type="application\/ld\+json">(.+?)<\/script>/,
      )?.[1];
      const graph = JSON.parse(decode(json ?? "{}"))["@graph"];
      expect(graph[0].url).toBe(`${SITE}/alternatives/${slug}`);
      expect(graph[1].mainEntity.map((q: { name: string }) => q.name)).toEqual(
        alt.faqs.map((f) => f.q),
      );
    });

    it("links the hub and every other comparison", () => {
      expect(markup).toContain('href="/alternatives"');
      for (const other of ALTERNATIVES) {
        if (other.slug !== slug)
          expect(markup).toContain(`href="${alternativePath(other)}"`);
      }
    });

    it("fits its title and description in a search result", () => {
      expect(alt.title.length).toBeLessThanOrEqual(65);
      expect(alt.description.length).toBeLessThanOrEqual(160);
    });

    it("is in the sitemap", () => {
      expect(sitemap().map((entry) => entry.url)).toContain(
        `${SITE}/alternatives/${slug}`,
      );
    });
  },
);

describe("alternatives hub", () => {
  const markup = renderToStaticMarkup(<AlternativesHub />);

  it("links every comparison", () => {
    for (const alt of ALTERNATIVES) {
      expect(markup).toContain(`href="${alternativePath(alt)}"`);
    }
  });

  it("is in the sitemap", () => {
    expect(sitemap().map((entry) => entry.url)).toContain(
      `${SITE}/alternatives`,
    );
  });

  it("gives each comparison its own slug", () => {
    expect(new Set(ALTERNATIVES.map((a) => a.slug)).size).toBe(
      ALTERNATIVES.length,
    );
  });
});
