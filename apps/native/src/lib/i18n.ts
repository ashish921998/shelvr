import { getLocales, useLocales } from "expo-localization";
import en from "@/locales/en.json";
import { resolveLocale, translate } from "./i18n-core";

/** Subscribe each translated screen to device/per-app language changes. */
export function useAppLocale(): string {
  return resolveLocale(useLocales().map((locale) => locale.languageTag));
}

export function currentLocale(): string {
  return resolveLocale(getLocales().map((locale) => locale.languageTag));
}

export function formattingLocale(): string {
  const selected = currentLocale();
  let fallback = selected;
  for (const locale of getLocales()) {
    try {
      const canonical = Intl.getCanonicalLocales(
        locale.languageTag.replaceAll("_", "-"),
      )[0];
      const [language, ...subtags] = canonical.split(/-[ux]-/i)[0].split("-");
      const normalizedLanguage = language === "no" ? "nb" : language;
      if (normalizedLanguage === selected.split("-")[0]) return canonical;
      // Keep the region while using English month names for unsupported languages.
      const region = subtags.find((part) => /^[A-Z]{2}$|^\d{3}$/.test(part));
      if (fallback === "en" && region) fallback = `en-${region}`;
    } catch {
      continue;
    }
  }
  return fallback;
}

/** Read at call time so alerts and callbacks never capture a stale language. */
export function t(
  source: string,
  values?: Record<string, string | number>,
): string {
  const locale = currentLocale();
  const formattedValues = Object.fromEntries(
    Object.entries(values ?? {}).map(([key, value]) => [
      key,
      typeof value === "number"
        ? new Intl.NumberFormat(formattingLocale()).format(value)
        : value,
    ]),
  );
  return translate(locale, source, formattedValues);
}

export function localizeError(
  message: unknown,
  fallback = "Save failed. Please try again.",
): string {
  return t(
    typeof message === "string" && Object.hasOwn(en, message)
      ? message
      : fallback,
  );
}
