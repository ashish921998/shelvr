import { I18n } from "i18n-js";
import en from "@/locales/en.json";
import { catalogs } from "@/locales/catalogs";

const i18n = new I18n(catalogs, {
  defaultLocale: "en",
  enableFallback: true,
  defaultSeparator: "\u0001",
});

/** Follow ordered preferences, resolving only to catalogs included in this build. */
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
    const language = baseName.split("-")[0];
    if (Object.hasOwn(catalogs, baseName)) return baseName;
    if (Object.hasOwn(catalogs, language)) return language;
    const regionalFallback = Object.keys(catalogs).find((key) =>
      key.startsWith(`${language}-`),
    );
    if (regionalFallback) return regionalFallback;
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
