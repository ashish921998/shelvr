import notificationTranslations from "../../convex/model/notificationTranslations.json";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import config from "../../localization.config.json";
import en from "@/locales/en.json";
import { catalogs } from "@/locales/catalogs";

const locales = [...new Set(Object.values(config.storeLocales))].sort();
const placeholders = (text: string) => (text.match(/%\{[^}]+\}/g) ?? []).sort();
const atoms = (text: string) =>
  (
    text.match(
      /\b(?:Shelvr|Pro|iPhone|iPad|Apple Watch|App Store|Google Play|TikTok|Instagram)\b|support@shelvr\.app/g,
    ) ?? []
  ).sort();

describe("shipped localization resources", () => {
  it("covers all 50 store locales with 47 complete app catalogs", () => {
    expect(Object.keys(config.storeLocales)).toHaveLength(50);
    expect(locales).toHaveLength(47);
    expect(Object.keys(catalogs).sort()).toEqual(locales);
  });

  it.each(locales)("%s preserves the complete source contract", (locale) => {
    const messages = JSON.parse(
      readFileSync(
        new URL(`../locales/${locale}.json`, import.meta.url),
        "utf8",
      ),
    ) as Record<string, string>;
    expect(Object.keys(messages).sort()).toEqual(Object.keys(en).sort());
    const notificationCopy: Record<string, { title: string; body: string }> =
      notificationTranslations;
    expect(notificationCopy[locale]).toEqual({
      title: messages["Your weekly shelf"],
      body: messages["Saves waiting for you: %{count}"],
    });
    const navigation = ["Home", "Spaces", "Tidy", "Map", "Search"].map(
      (key) => messages[key],
    );
    expect(
      new Set(navigation).size,
      `${locale}: distinct navigation labels`,
    ).toBe(5);
    for (const [key, source] of Object.entries(en)) {
      const translated = messages[key];
      expect(typeof translated, `${locale}: ${key}`).toBe("string");
      expect(translated.trim(), `${locale}: empty ${key}`).not.toBe("");
      expect(
        placeholders(translated),
        `${locale}: placeholders in ${key}`,
      ).toEqual(placeholders(source));
      for (const atom of atoms(source)) {
        // Some languages append grammatical suffixes to an unchanged brand.
        expect(translated, `${locale}: protected atom in ${key}`).toContain(
          atom,
        );
      }
      if (locale !== "en" && source.split(/\s+/).length >= 4) {
        expect(translated, `${locale}: untranslated sentence ${key}`).not.toBe(
          source,
        );
      }
    }
  });

  it("packages every widget gallery label in its native string catalog", () => {
    const widget = JSON.parse(
      readFileSync(
        new URL("../../locales/WidgetLocalizations.xcstrings", import.meta.url),
        "utf8",
      ),
    );
    for (const key of ["Recent Saves", "Your latest saves, at a glance."]) {
      expect(Object.keys(widget.strings[key].localizations).sort()).toEqual(
        locales,
      );
      for (const locale of locales) {
        expect(widget.strings[key].localizations[locale].stringUnit.value).toBe(
          catalogs[locale][key],
        );
      }
    }
  });

  it.each(locales)(
    "%s packages translated iOS permission prompts",
    (locale) => {
      const messages = catalogs[locale];
      const native = JSON.parse(
        readFileSync(
          new URL(`../../locales/${locale}.json`, import.meta.url),
          "utf8",
        ),
      );
      expect(native.ios.NSCameraUsageDescription).toBe(
        messages[
          "Shelvr uses your camera so you can capture things you want to save for later."
        ],
      );
      expect(native.ios.NSPhotoLibraryUsageDescription).toBe(
        messages[
          "Shelvr lets you save photos and screenshots from your library into your hub, and tidy your photo library."
        ],
      );
      expect(native.ios.NSCalendarsFullAccessUsageDescription).toBe(
        messages[
          "Shelvr adds events to your calendar from things you've saved."
        ],
      );
      expect(native.ios.CFBundleDisplayName).toBeUndefined();
    },
  );
});
