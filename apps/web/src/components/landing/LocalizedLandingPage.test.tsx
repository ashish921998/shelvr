import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { metadata as homeMetadata } from "@/app/(en)/page";
import { metadata as germanMetadata } from "@/app/de/page";
import { metadata as frenchMetadata } from "@/app/fr/page";
import sitemap from "@/app/sitemap";
import Footer from "@/components/home/Footer";
import {
  FRENCH,
  GERMAN,
  LANDINGS,
  type LocalizedLanding,
} from "@/lib/localizedLanding";

import LocalizedLandingPage from "./LocalizedLandingPage";

const SITE = "https://tryshelvr.app";
const LANGUAGES = { en: "/", de: "/de", fr: "/fr", "x-default": "/" };

function decode(html: string) {
  return html
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&");
}

function allCopy(page: LocalizedLanding): string[] {
  return [
    page.title,
    page.description,
    page.heading,
    page.accent,
    page.lede,
    page.cta,
    page.ctaAria,
    page.ctaNote,
    page.stepsHeading,
    ...page.steps,
    ...page.sections.flatMap((s) => [s.heading, s.body]),
    page.faqHeading,
    ...page.faqs.flatMap((f) => [f.q, f.a]),
    page.footer.support,
    page.footer.privacy,
    page.footer.terms,
  ];
}

describe.each(LANDINGS.map((page) => [page.locale, page] as const))(
  "%s landing page",
  (locale, page) => {
    const markup = renderToStaticMarkup(<LocalizedLandingPage page={page} />);
    const text = decode(markup);

    it("marks its content with its language", () => {
      expect(markup).toMatch(new RegExp(`^<div lang="${locale}"`));
    });

    it("shows all of its copy", () => {
      for (const part of allCopy(page).filter((p) => p !== page.title)) {
        expect(text).toContain(part);
      }
    });

    it("asks for the App Store in its own language", () => {
      expect(
        markup.match(new RegExp(`aria-label="${page.ctaAria}"`, "g")),
      ).toHaveLength(2);
      expect(text).not.toContain("Map my saves");
    });

    it("links back to the English site", () => {
      expect(markup).toMatch(/<a lang="en" hrefLang="en"[^>]*href="\/"/);
    });

    it("makes no price claim", () => {
      for (const part of allCopy(page)) {
        expect(part).not.toMatch(
          /gratuit|kostenlos|gratis|\bprix\b|Preis|€|\$/i,
        );
      }
    });

    it("identifies the localized page and its language in structured data", () => {
      const json = markup.match(
        /<script type="application\/ld\+json">(.+?)<\/script>/,
      )?.[1];
      expect(JSON.parse(decode(json ?? "{}"))).toMatchObject({
        "@type": "WebPage",
        url: `${SITE}/${locale}`,
        inLanguage: locale,
        isPartOf: { "@id": `${SITE}/#website` },
      });
    });

    it("fits its title and description in a search result", () => {
      expect(page.title.length).toBeLessThanOrEqual(65);
      expect(page.description.length).toBeLessThanOrEqual(160);
    });

    it("is in the sitemap", () => {
      expect(sitemap().map((entry) => entry.url)).toContain(
        `${SITE}/${locale}`,
      );
    });
  },
);

describe("German copy", () => {
  it("calls a save Inhalt, never Saves, and says du", () => {
    for (const part of allCopy(GERMAN)) {
      expect(part).not.toMatch(/(?<!\p{L})Saves?(?!\p{L})/u);
      expect(part).not.toMatch(/(?<!\p{L})(Ihr|Ihre|Ihnen|Ihren)(?!\p{L})/u);
    }
  });
});

describe("French copy", () => {
  it("says vous, never tu", () => {
    for (const part of allCopy(FRENCH)) {
      expect(part).not.toMatch(/(?<!\p{L})(tu|ton|ta|tes|toi)(?!\p{L})/iu);
    }
  });

  it("puts a no-break space before ? : ; ! and inside « »", () => {
    for (const part of allCopy(FRENCH)) {
      expect(part).not.toMatch(/[^ ][?:;!»]/u);
      expect(part).not.toMatch(/«[^ ]/u);
    }
  });
});

describe("language links", () => {
  it("tells search engines about every language from each page", () => {
    for (const metadata of [homeMetadata, germanMetadata, frenchMetadata]) {
      expect(metadata.alternates?.languages).toEqual(LANGUAGES);
    }
    expect(germanMetadata.alternates?.canonical).toBe("/de");
    expect(frenchMetadata.alternates?.canonical).toBe("/fr");
    expect(germanMetadata.openGraph).toMatchObject({ locale: "de_DE" });
    expect(frenchMetadata.openGraph).toMatchObject({ locale: "fr_FR" });
  });

  it("links the German and French pages from the English footer", () => {
    const markup = renderToStaticMarkup(<Footer />);
    expect(markup).toMatch(/<a lang="de" hrefLang="de"[^>]*href="\/de"/);
    expect(markup).toMatch(/<a lang="fr" hrefLang="fr"[^>]*href="\/fr"/);
  });
});
