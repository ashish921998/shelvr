import { appStoreUrl, sanitizeCampaign } from "./appStore";

const BIO_PRODUCT_PAGE_ID: string | undefined = undefined;

export type InAppBrowser = "tiktok" | "instagram" | "facebook";
export type Platform = "ios" | "android" | "other";

/** The social app whose built-in browser opened the page, if any. These
 * browsers cannot open the App Store reliably, so the page asks the visitor
 * to leave for their real browser first. */
export function inAppBrowser(userAgent: string): InAppBrowser | undefined {
  if (/musical_ly|BytedanceWebview|TikTok|trill_/i.test(userAgent)) {
    return "tiktok";
  }
  if (/Instagram/i.test(userAgent)) return "instagram";
  if (/FBAN|FBAV|FB_IAB|FBIOS/.test(userAgent)) return "facebook";
  return undefined;
}

export function platform(userAgent: string): Platform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "other";
}

/** iPadOS Safari in its default desktop mode reports a Mac user agent; a
 * touch screen gives it away. */
export function isIPadDesktop(userAgent: string, maxTouchPoints: number) {
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

export function bioAppStoreUrl(
  campaign: string | undefined,
  productPageId: string | undefined = BIO_PRODUCT_PAGE_ID,
): string {
  const href = appStoreUrl(campaign);
  if (!productPageId) return href;
  const url = new URL(href);
  url.searchParams.set("ppid", productPageId);
  return url.toString();
}

export const CHROME_TRIED_PARAM = "chrome";

/**
 * An Android intent that reopens `href` in Chrome. If Chrome cannot take it,
 * the in-app browser loads the fallback: the same page, marked as tried.
 */
export function chromeIntentUrl(href: string): string {
  const url = new URL(href);
  const fallback = new URL(href);
  fallback.searchParams.set(CHROME_TRIED_PARAM, "0");
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(fallback.toString())};end`;
}

export const PLAY_STORE_LIVE = false;
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=app.shelvr.save";

export function playStoreUrl(campaign: string | undefined): string {
  const ct = sanitizeCampaign(campaign);
  if (!ct) return PLAY_STORE_URL;
  const referrer = new URLSearchParams({ utm_campaign: ct }).toString();
  return `${PLAY_STORE_URL}&${new URLSearchParams({ referrer }).toString()}`;
}

type BioAction = "overlay" | "app_store" | "play_store" | "stay";

export function bioAction(
  inApp: InAppBrowser | undefined,
  device: Platform,
  playLive: boolean = PLAY_STORE_LIVE,
): BioAction {
  const store =
    device === "ios"
      ? "app_store"
      : device === "android" && playLive
        ? "play_store"
        : "stay";
  if (store === "stay") return "stay";
  return inApp ? "overlay" : store;
}
