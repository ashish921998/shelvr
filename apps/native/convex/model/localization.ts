import { de, en, es, fr, ja, ko, pt } from "make-plural";

// Share the same CLDR cardinal rules between app copy and push notifications.
// Hermes does not need Intl.PluralRules or a global polyfill.
export const pluralRules: Record<string, (count: number) => string> = {
  de,
  en,
  es,
  "es-MX": es,
  fr,
  "fr-CA": fr,
  ja,
  ko,
  "pt-BR": pt,
};
