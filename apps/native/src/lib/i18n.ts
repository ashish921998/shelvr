import { getLocales, useLocales } from "expo-localization";
import type {
  MessageArgs,
  MessageKey,
  TextMessageKey,
} from "@/locales/message-types";
import type { SupportedLocale } from "@/locales/catalogs";
import { canonicalizeTag, resolveLocale, translate } from "./i18n-core";

export function useAppLocale(): SupportedLocale {
  return resolveLocale(useLocales().map((locale) => locale.languageTag));
}

export function currentLocale(): SupportedLocale {
  return resolveLocale(getLocales().map((locale) => locale.languageTag));
}

export function formattingLocale(): string {
  const selected = currentLocale();
  let fallback: string = selected;
  for (const locale of getLocales()) {
    const normalized = canonicalizeTag(locale.languageTag);
    if (!normalized) continue;
    const { canonical, baseName } = normalized;
    const [language, ...subtags] = baseName.split("-");
    if (language === selected.split("-")[0]) return canonical;
    const region = subtags.find((part) => /^[A-Z]{2}$|^\d{3}$/.test(part));
    if (fallback === "en" && region) fallback = `en-${region}`;
  }
  return fallback;
}

export function t<K extends MessageKey>(
  key: K,
  ...[values]: MessageArgs<K>
): string {
  return translate(currentLocale(), key, values, formattingLocale());
}

const ERROR_MESSAGES: Record<string, TextMessageKey> = {
  "This photo is too large to read. Save a smaller copy (under 14 MB).":
    "errors.photoTooLarge",
  "This photo is empty. Please save it again.": "errors.photoEmpty",
  "Photo limit reached (1,000). Delete some photos to save more.":
    "errors.photoLimit",
  "Give the space a name.": "errors.spaceNameEmpty",
  "Space names can be up to 60 characters.": "errors.spaceNameTooLong",
  "This photo is unavailable or empty. Please save it again.":
    "errors.photoUnavailable",
};

export function localizeError(
  message: unknown,
  fallback: TextMessageKey = "errors.saveFallback",
): string {
  const key =
    typeof message === "string" && Object.hasOwn(ERROR_MESSAGES, message)
      ? ERROR_MESSAGES[message]
      : fallback;
  return t(key);
}
