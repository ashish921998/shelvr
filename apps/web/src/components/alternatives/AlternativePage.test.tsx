import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { generateMetadata } from "@/app/alternatives/[app]/page";
import AlternativesHub from "@/app/alternatives/page";
import sitemap from "@/app/sitemap";
import Footer from "@/components/home/Footer";
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

    it("links to the dated primary sources for the comparison", () => {
      expect(alt.sources.length).toBeGreaterThan(0);
      for (const source of alt.sources) {
        expect(source.url).toMatch(/^https:\/\//);
        expect(markup).toContain(
          `href="${source.url}" rel="noopener noreferrer"`,
        );
      }
      expect(text).toContain("Sources checked in November 2026");
    });

    it("makes no price claim for Shelvr", () => {
      for (const claim of [...Object.values(SHELVR_CELLS), ...alt.pickShelvr]) {
        for (const pattern of PRICE_CLAIMS) expect(claim).not.toMatch(pattern);
      }
    });

    it("sets the comparison URL as canonical and renders its questions", async () => {
      const path = `/alternatives/${slug}`;
      await expect(
        generateMetadata({ params: Promise.resolve({ app: slug }) }),
      ).resolves.toMatchObject({
        title: alt.title,
        description: alt.description,
        alternates: { canonical: path },
        openGraph: { url: path },
      });
      for (const { q, a } of alt.faqs) {
        expect(text).toContain(q);
        expect(text).toContain(a);
      }
    });

    it("links the comparison hub, feature pages and guides", () => {
      expect(markup).toContain('href="/alternatives"');
      expect(markup).toContain('href="/date-night-planner"');
      expect(markup).toContain('href="/trip-planner"');
      expect(markup).toContain('href="/save-places-from-reels"');
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

  it("is linked from the shared footer", () => {
    expect(renderToStaticMarkup(<Footer />)).toContain('href="/alternatives"');
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
