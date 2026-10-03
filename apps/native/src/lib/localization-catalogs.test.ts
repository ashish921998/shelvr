import {
  de,
  en as english,
  es,
  fr,
  ja,
  ko,
  pt,
} from "make-plural/pluralCategories";
import notificationTranslations from "../../convex/model/notificationTranslations.json";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveLocale } from "./i18n-core";
import {
  notificationLocale,
  digestCopy,
} from "../../convex/model/notificationFields";
import { describe, expect, it } from "vitest";
import config from "../../localization.config.json";
import en from "@/locales/en.json";
import { catalogs, isSupportedLocale } from "@/locales/catalogs";

const locales = [...new Set(Object.values(config.storeLocales))]
  .filter(isSupportedLocale)
  .sort();
const placeholders = (text: string) => (text.match(/%\{[^}]+\}/g) ?? []).sort();
const atoms = (text: string) =>
  (
    text.match(
      /\b(?:Shelvr|Pro|iPhone|iPad|Apple Watch|App Store|Google Play|TikTok|Instagram)\b/g,
    ) ?? []
  ).sort();

describe("shipped localization resources", () => {
  it("covers the selected 12 store locales with nine complete app catalogs", () => {
    expect(Object.keys(config.storeLocales)).toHaveLength(12);
    expect(locales).toEqual([
      "de",
      "en",
      "es",
      "es-MX",
      "fr",
      "fr-CA",
      "ja",
      "ko",
      "pt-BR",
    ]);
    expect(Object.keys(catalogs).sort()).toEqual(locales);
    expect(Object.keys(notificationTranslations).sort()).toEqual(locales);
    for (const directory of ["../locales/", "../../locales/"]) {
      const files = readdirSync(new URL(directory, import.meta.url))
        .filter((file) => file.endsWith(".json"))
        .map((file) => file.slice(0, -5))
        .sort();
      expect(files).toEqual(locales);
    }
  });

  it.each([
    "ar-SA",
    "he-IL",
    "zh-TW",
    "zh-CN",
    "no-NO",
    "ru-RU",
    "it-IT",
    "th-TH",
    "nl-NL",
  ])("uses the next supported preference for deferred %s", (tag) => {
    expect(resolveLocale([tag])).toBe("en");
    expect(resolveLocale([tag, "de-DE"])).toBe("de");
  });

  it("uses the Brazilian catalog for other Portuguese regions", () => {
    expect(resolveLocale(["pt-PT"])).toBe("pt-BR");
    expect(resolveLocale(["pt"])).toBe("pt-BR");
  });

  it.each(["bn", "gu", "hi", "kn", "ml", "mr", "or", "pa", "ta", "te", "ur"])(
    "uses English for excluded %s app and notification preferences",
    (locale) => {
      expect(resolveLocale([`${locale}-IN`, "en-IN"])).toBe("en");
      expect(resolveLocale([`${locale}-IN`])).toBe("en");
      expect(notificationLocale(locale)).toBe("en");
      expect(digestCopy(locale, 3)).toEqual(digestCopy("en", 3));
    },
  );

  it.each(locales)("%s preserves the complete source contract", (locale) => {
    const messages = JSON.parse(
      readFileSync(
        new URL(`../locales/${locale}.json`, import.meta.url),
        "utf8",
      ),
    ) as Record<string, string | Record<string, string>>;
    expect(Object.keys(messages).sort()).toEqual(Object.keys(en).sort());
    const notificationCopy: Record<
      string,
      {
        title: string;
        body: Record<string, string>;
        named: Record<string, string>;
        namedSingle: string;
        reminder: Record<"read" | "cook", { title: string; body: string }>;
      }
    > = notificationTranslations;
    expect(notificationCopy[locale]).toEqual({
      title: messages["digest.title"],
      body: messages["digest.waitingCount"],
      named: messages["digest.namedCount"],
      namedSingle: messages["digest.namedSingle"],
      reminder: {
        read: {
          title: messages["reminder.readTitle"],
          body: messages["reminder.readBody"],
        },
        cook: {
          title: messages["reminder.cookTitle"],
          body: messages["reminder.cookBody"],
        },
      },
    });
    const navigation = [
      "navigation.home",
      "navigation.spaces",
      "navigation.tidy",
      "navigation.map",
      "navigation.search",
    ].map((key) => messages[key]);
    expect(
      new Set(navigation).size,
      `${locale}: distinct navigation labels`,
    ).toBe(5);
    for (const [key, source] of Object.entries(en)) {
      const translated = messages[key];
      expect(typeof translated).toBe(typeof source);
      const reference = typeof source === "string" ? source : source.other;
      if (typeof translated === "object") {
        const categories: Record<string, { cardinal: readonly string[] }> = {
          de,
          en: english,
          es,
          fr,
          ja,
          ko,
          pt,
        };
        expect(Object.keys(translated).sort()).toEqual(
          [...categories[locale.split("-")[0]].cardinal].sort(),
        );
      }
      const variants =
        typeof translated === "string"
          ? [translated]
          : Object.values(translated);
      for (const variant of variants) {
        expect(variant.trim(), `${locale}: empty ${key}`).not.toBe("");
        expect(
          placeholders(variant),
          `${locale}: placeholders in ${key}`,
        ).toEqual(placeholders(reference));
        for (const atom of atoms(reference))
          expect(variant, `${locale}: protected atom in ${key}`).toContain(
            atom,
          );
        if (locale !== "en" && reference.split(/\s+/).length >= 4)
          expect(variant, `${locale}: untranslated ${key}`).not.toBe(reference);
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
    for (const key of ["widget.title", "widget.description"] as const) {
      const nativeKey = en[key];
      expect(
        Object.keys(widget.strings[nativeKey].localizations).sort(),
      ).toEqual(locales);
      for (const locale of locales) {
        expect(
          widget.strings[nativeKey].localizations[locale].stringUnit.value,
        ).toBe(catalogs[locale][key]);
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
        messages["permissions.cameraUsage"],
      );
      expect(native.ios.NSPhotoLibraryUsageDescription).toBe(
        messages["permissions.photosUsage"],
      );
      expect(native.ios.NSCalendarsFullAccessUsageDescription).toBe(
        messages["permissions.calendarUsage"],
      );
      expect(native.ios.CFBundleDisplayName).toBeUndefined();
    },
  );
});

it("commits reproducible catalogs, message types and native resources", () => {
  const root = new URL("../../../../", import.meta.url);
  expect(() =>
    execFileSync(
      process.execPath,
      [
        fileURLToPath(new URL("tools/generate-localizations.mjs", root)),
        "--check",
      ],
      { cwd: fileURLToPath(root), stdio: "pipe" },
    ),
  ).not.toThrow();
});

it.each([
  "%{formattedCount} saves, %{formattedCount} waiting",
  "Saved things are waiting",
  "%{formattedCount} saves in %{space}",
])("rejects unsupported digest placeholders before writing: %s", (body) => {
  const root = fileURLToPath(new URL("../../../../", import.meta.url));
  const fixture = mkdtempSync(join(tmpdir(), "shelvr-localization-"));
  try {
    mkdirSync(join(fixture, "tools"));
    mkdirSync(join(fixture, "apps/native/src/locales"), { recursive: true });
    symlinkSync(join(root, "node_modules"), join(fixture, "node_modules"));
    copyFileSync(
      join(root, "tools/generate-localizations.mjs"),
      join(fixture, "tools/generate-localizations.mjs"),
    );
    writeFileSync(
      join(fixture, "apps/native/localization.config.json"),
      JSON.stringify({ storeLocales: { "en-US": "en" } }),
    );
    writeFileSync(
      join(fixture, "apps/native/src/locales/en.json"),
      JSON.stringify({
        ...en,
        "digest.waitingCount": { one: body, other: body },
      }),
    );
    const result = spawnSync(
      process.execPath,
      [join(fixture, "tools/generate-localizations.mjs")],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "digest.waitingCount must contain exactly these placeholders: %{formattedCount}",
    );
    expect(existsSync(join(fixture, "apps/native/locales"))).toBe(false);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
