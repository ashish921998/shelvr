/**
 * Stored settings and the small amount of environment-sniffing the extension
 * does. Everything here is shared by the service worker and the popup, which
 * run in separate contexts and only agree through `chrome.storage`.
 */

/**
 * The production deployment's HTTP Actions origin — the same deployment
 * `apps/native/app.config.js` pins production builds to, with `.convex.cloud`
 * swapped for the `.convex.site` host that serves `convex/http.ts`.
 *
 * Overridable from the popup's advanced field so a developer can point the
 * extension at their own dev deployment; `manifest.json` grants
 * `https://*.convex.site/` precisely so that override needs no new permission.
 */
export const DEFAULT_ENDPOINT = "https://amiable-setter-120.convex.site";

export const STORAGE_KEYS = {
  /** The connection token. The only credential the extension holds. */
  token: "token",
  endpoint: "endpoint",
  /** Last known `/extension/session` answer, so the popup can paint before the
   * network comes back. */
  account: "account",
  /** The handful of recent saves the popup lists. */
  recent: "recent",
  /** What the last background save did, so a save started from the keyboard or
   * the context menu can explain itself when the popup is next opened. */
  lastResult: "lastResult",
};

/** Saves kept for the popup's recent list. A reminder of what just went in,
 * not a second library — the app is the library. */
export const MAX_RECENT = 5;

export async function readSettings() {
  const stored = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  return {
    token: stored[STORAGE_KEYS.token] ?? null,
    endpoint: stored[STORAGE_KEYS.endpoint] ?? DEFAULT_ENDPOINT,
    account: stored[STORAGE_KEYS.account] ?? null,
    recent: stored[STORAGE_KEYS.recent] ?? [],
    lastResult: stored[STORAGE_KEYS.lastResult] ?? null,
  };
}

export async function writeSettings(patch) {
  await chrome.storage.local.set(patch);
}

export async function clearConnection() {
  await chrome.storage.local.remove([
    STORAGE_KEYS.token,
    STORAGE_KEYS.account,
    STORAGE_KEYS.recent,
    STORAGE_KEYS.lastResult,
  ]);
}

/**
 * Canonicalize a typed endpoint, or null if it is not one we may call.
 *
 * The check mirrors `host_permissions`: anything outside `https://*.convex.site`
 * would be blocked by the browser anyway, so catching it here turns a confusing
 * network failure into a plain "that isn't a Shelvr backend".
 */
export function normalizeEndpoint(raw) {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!url.hostname.endsWith(".convex.site")) return null;
  return url.origin;
}

/**
 * A human label for this browser, proposed at pairing so the app's list reads
 * "Chrome on macOS" rather than a row of identical entries. Display copy only
 * — the server bounds and sanitizes it, and nothing keys on it.
 */
export function describeBrowser() {
  const data = navigator.userAgentData;
  const platform = data?.platform || guessPlatform();
  const brand = data?.brands
    ?.map((entry) => entry.brand)
    .find((name) => !/not.*a.*brand/i.test(name) && name !== "Chromium");
  const browser = brand || guessBrowser();
  return platform ? `${browser} on ${platform}` : browser;
}

function guessBrowser() {
  const ua = navigator.userAgent;
  if (/\bEdg\//.test(ua)) return "Edge";
  if (/\bOPR\//.test(ua)) return "Opera";
  if (/\bFirefox\//.test(ua)) return "Firefox";
  if (/\bChrome\//.test(ua)) return "Chrome";
  return "Browser";
}

function guessPlatform() {
  const ua = navigator.userAgent;
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Windows/.test(ua)) return "Windows";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Linux/.test(ua)) return "Linux";
  return "";
}
