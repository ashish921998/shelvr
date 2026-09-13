import { I18n } from "i18n-js";
import type { MessageKey } from "@/locales/message-types";
import { pluralRules } from "@convex/model/localization";
import {
  catalogs,
  isSupportedLocale,
  type SupportedLocale,
} from "@/locales/catalogs";

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

export function canonicalizeTag(tag: string) {
  try {
    const canonical = Intl.getCanonicalLocales(tag.replaceAll("_", "-"))[0];
    // Hermes supports canonicalization but does not guarantee Intl.Locale.
    return { canonical, baseName: canonical.split(/-[ux]-/i)[0] };
  } catch {
    return undefined;
  }
}

/** Follow ordered preferences, resolving only to catalogs included in this build. */
export function resolveLocale(
  languageTags: readonly string[],
): SupportedLocale {
  for (const tag of languageTags) {
    const normalized = canonicalizeTag(tag);
    if (!normalized) continue;
    const { baseName } = normalized;
    const language = baseName.split("-")[0];
    if (isSupportedLocale(baseName)) return baseName;
    if (isSupportedLocale(language)) return language;
    const regionalFallback = Object.keys(catalogs)
      .filter(isSupportedLocale)
      .find((key) => key.startsWith(`${language}-`));
    if (regionalFallback) return regionalFallback;
  }
  return "en";
}

const numberFormatters = new Map<string, Intl.NumberFormat>();
function formatNumber(locale: string, value: number): string {
  let formatter = numberFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale);
    // Device tags may include arbitrary region/numbering extensions.
    if (numberFormatters.size >= 32) numberFormatters.clear();
    numberFormatters.set(locale, formatter);
  }
  return formatter.format(value);
}

export function translate(
  locale: string,
  key: MessageKey,
  values: Record<string, string | number> = {},
  numberLocale = locale,
): string {
  const formatted = Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      typeof value === "number" ? formatNumber(numberLocale, value) : value,
    ]),
  );
  const message = catalogs.en[key];
  if (typeof message === "object") {
    if (typeof values.count !== "number" || !Number.isFinite(values.count)) {
      throw new Error("Plural messages require a finite numeric count");
    }
    // Selection must receive a number, even when interpolation uses regional
    // grouping such as 1.234 or 12,34,567.
    formatted.formattedCount = formatNumber(numberLocale, values.count);
    return i18n.t(key, { ...formatted, count: values.count, locale });
  }
  return i18n.t(key, { ...formatted, locale });
}
