import { currentLocale } from "./i18n";
import { analytics } from "./analytics";

/** Match the app's supported language instead of an unsupported device language.
 * Store prices/currency still come from the user's storefront. */
export function revenueCatLocale(): string {
  const locale = currentLocale();
  const regions: Record<string, string> = {
    en: "en-US",
    de: "de-DE",
    es: "es-ES",
    fr: "fr-FR",
    ja: "ja-JP",
    ko: "ko-KR",
  };
  return regions[locale] ?? locale;
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
