import type { MessageKey } from "@/locales/message-types";
import { pluralRules } from "@convex/model/localization";
import {
  catalogs,
  isSupportedLocale,
  type SupportedLocale,
} from "@/locales/catalogs";

type Message = string | Record<string, string>;

// The locales a lookup tries in order: the exact one, its language, then
// English (the same chain i18n-js used with enableFallback).
function fallbackChain(locale: string): string[] {
  const chain: string[] = [];
  for (const entry of [locale, "en"]) {
    const codes = entry.split("-");
    for (const candidate of [
      entry,
      ...(codes.length === 3 ? [`${codes[0]}-${codes[1]}`] : []),
      codes[0],
    ]) {
      if (!chain.includes(candidate)) chain.push(candidate);
    }
  }
  return chain;
}

function lookup(locale: string, key: MessageKey): Message | undefined {
  for (const candidate of fallbackChain(locale)) {
    const message = isSupportedLocale(candidate)
      ? (catalogs[candidate][key] as Message | undefined)
      : undefined;
    if (message !== undefined && message !== null) return message;
  }
  return undefined;
}

const PLACEHOLDER = /(?:\{\{|%\{)(.*?)(?:\}\}?)/g;

function interpolate(
  message: string,
  values: Record<string, string | number>,
): string {
  return message.replace(PLACEHOLDER, (placeholder, name: string) => {
    const value = values[name] as string | number | undefined | null;
    return value === undefined || value === null
      ? `[missing "${placeholder}" value]`
      : value.toString();
  });
}

function missing(locale: string, scope: string): string {
  return `[missing "${locale}.${scope}" translation]`;
}

export function canonicalizeTag(tag: string) {
  try {
    const canonical = Intl.getCanonicalLocales(tag.replaceAll("_", "-"))[0];
    return { canonical, baseName: canonical.split(/-[ux]-/i)[0] };
  } catch {
    return undefined;
  }
}

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
    formatted.formattedCount = formatNumber(numberLocale, values.count);
  }
  const found = lookup(locale, key);
  if (typeof found === "string") {
    return interpolate(found, { ...formatted, locale });
  }
  if (found === undefined || typeof values.count !== "number") {
    return missing(locale, key);
  }
  const category = (pluralRules[locale] ?? pluralRules.en)(values.count);
  const variant = found[category] as string | undefined;
  if (variant === undefined) return missing(locale, `${key}.${category}`);
  return interpolate(variant, { ...formatted, count: values.count, locale });
}
