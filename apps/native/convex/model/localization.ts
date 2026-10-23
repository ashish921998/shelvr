import { de, en, es, fr, ja, ko, pt } from "make-plural";

// Hermes does not need Intl.PluralRules or a global polyfill.
type PluralRule = (count: number) => string;

export const pluralRules: Record<string, PluralRule> & { en: PluralRule } = {
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
