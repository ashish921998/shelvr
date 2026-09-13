import { I18n } from "i18n-js";
import type { MessageKey } from "@/locales/message-types";
import { pluralRules } from "@convex/model/localization";
import { catalogs } from "@/locales/catalogs";

// Catalog files use stable namespace.message identifiers. Expand them into
// i18n-js's normal namespace tree; English punctuation is only ever a value.
const translations = Object.fromEntries(
  Object.entries(catalogs).map(([locale, messages]) => {
    const namespaces: Record<
      string,
      Record<string, string | Record<string, string>>
    > = {};
    for (const [key, message] of Object.entries(messages)) {
      const [namespace, name] = key.split(".");
      (namespaces[namespace] ??= {})[name] = message;
    }
    return [locale, namespaces];
  }),
);
const i18n = new I18n(translations, {
  defaultLocale: "en",
  enableFallback: true,
});
for (const [locale, rule] of Object.entries(pluralRules)) {
  i18n.pluralization.register(locale, (_i18n, count) => [rule(Number(count))]);
}

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
  key: MessageKey,
  values: Record<string, string | number> = {},
  numberLocale = locale,
): string {
  const formatter = new Intl.NumberFormat(numberLocale);
  const formatted = Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      typeof value === "number" ? formatter.format(value) : value,
    ]),
  );
  const message = catalogs.en[key];
  if (typeof message === "object") {
    if (typeof values.count !== "number" || !Number.isFinite(values.count)) {
      throw new Error("Plural messages require a finite numeric count");
    }
    // Selection must receive a number, even when interpolation uses regional
    // grouping such as 1.234 or 12,34,567.
    formatted.formattedCount = formatter.format(values.count);
    return i18n.t(key, { ...formatted, count: values.count, locale });
  }
  return i18n.t(key, { ...formatted, locale });
}
