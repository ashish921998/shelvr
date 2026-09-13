import { I18n } from "i18n-js";
import en from "@/locales/en.json";
import { catalogs } from "@/locales/catalogs";

const i18n = new I18n(catalogs, {
  defaultLocale: "en",
  enableFallback: true,
  defaultSeparator: "\u0001",
});

/** Follow the ordered preferences; preserve Chinese scripts and regional variants. */
export function resolveLocale(languageTags: readonly string[]): string {
  for (const tag of languageTags) {
    const normalized = tag.replaceAll("_", "-");
    let canonical: string;
    try {
      canonical = Intl.getCanonicalLocales(normalized)[0];
    } catch {
      continue;
    }
    // Hermes supports canonicalization but does not guarantee Intl.Locale.
    const baseName = canonical.split(/-[ux]-/i)[0];
    const [languageCode, ...subtags] = baseName.split("-");
    const region = subtags.find((part) => /^[A-Z]{2}$|^\d{3}$/.test(part));
    const exact = Object.keys(catalogs).find((key) => key === baseName);
    if (exact) return exact;
    if (languageCode === "zh") {
      if (subtags.includes("Hans")) return "zh-Hans";
      return subtags.includes("Hant") ||
        ["TW", "HK", "MO"].includes(region ?? "")
        ? "zh-Hant"
        : "zh-Hans";
    }
    const language = languageCode === "no" ? "nb" : languageCode;
    if (language in catalogs) return language;
    if (language === "pt") return region === "PT" ? "pt-PT" : "pt-BR";
  }
  return "en";
}

export function translate(
  locale: string,
  source: string,
  values: Record<string, string | number> = {},
): string {
  // Unknown text may be user-owned (e.g. an album title); never reinterpret it.
  if (!Object.hasOwn(en, source)) return source;
  return i18n.t(source, { ...values, locale, defaultValue: source });
}
