import { currentLocale } from "./i18n";
import { analytics } from "./analytics";
import type { SupportedLocale } from "@/locales/catalogs";

const REVENUECAT_LOCALES: Record<SupportedLocale, string> = {
  en: "en-US",
  de: "de-DE",
  es: "es-ES",
  "es-MX": "es-MX",
  fr: "fr-FR",
  "fr-CA": "fr-CA",
  ja: "ja-JP",
  ko: "ko-KR",
  "pt-BR": "pt-BR",
};

/** Match the app's supported language instead of an unsupported device language.
 * Store prices/currency still come from the user's storefront. */
export function revenueCatLocale(): string {
  return REVENUECAT_LOCALES[currentLocale()];
}

export async function syncRevenueCatUILocale(
  purchases: {
    overridePreferredLocale: (locale: string) => Promise<void>;
  } | null,
): Promise<boolean> {
  if (!purchases) return false;
  try {
    await purchases.overridePreferredLocale(revenueCatLocale());
    return true;
  } catch (error) {
    analytics.captureError("purchase_ui_locale_sync_failed", error);
    return false;
  }
}
