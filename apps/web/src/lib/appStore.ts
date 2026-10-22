export const APP_STORE_ID = "6798143550";
export const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;

// App Store Connect caps a campaign token at 40 characters.
const CAMPAIGN_MAX = 40;
const CAMPAIGN_STORAGE_KEY = "shelvr_campaign";

export function sanitizeCampaign(value: string | null | undefined) {
  const clean = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, CAMPAIGN_MAX);
  return clean || undefined;
}

export function arrivalCampaign(search: string): string | undefined {
  const params = new URLSearchParams(search);
  const fromUrl =
    sanitizeCampaign(params.get("ct")) ??
    sanitizeCampaign(params.get("utm_campaign"));
  try {
    if (fromUrl) {
      window.sessionStorage.setItem(CAMPAIGN_STORAGE_KEY, fromUrl);
      return fromUrl;
    }
    return sanitizeCampaign(
      window.sessionStorage.getItem(CAMPAIGN_STORAGE_KEY),
    );
  } catch {
    return fromUrl;
  }
}

/**
 * The App Store link tagged for App Store Connect's campaign report. Apple only
 * attributes installs when both the provider token (`pt`) and the campaign
 * (`ct`) are present, so without `NEXT_PUBLIC_APP_STORE_PROVIDER_TOKEN` the
 * plain link is returned.
 */
export function appStoreUrl(campaign: string | undefined): string {
  const providerToken = process.env.NEXT_PUBLIC_APP_STORE_PROVIDER_TOKEN;
  const ct = sanitizeCampaign(campaign);
  if (!providerToken || !ct) return APP_STORE_URL;
  const params = new URLSearchParams({ pt: providerToken, ct, mt: "8" });
  return `${APP_STORE_URL}?${params.toString()}`;
}
