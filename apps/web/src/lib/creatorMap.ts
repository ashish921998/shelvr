import { platform, type InAppBrowser } from "@/lib/bioLink";

export type AppLinkScheme = "shelvr" | "shelvr-dev" | "shelvr-preview";
export type SaveAllMode = "app" | "elsewhere" | "none";

const APP_LINK_SCHEMES: readonly AppLinkScheme[] = [
  "shelvr",
  "shelvr-dev",
  "shelvr-preview",
];

const IN_APP_NAMES: Record<InAppBrowser, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
};

export function appLinkScheme(
  value = process.env.APP_LINK_SCHEME,
): AppLinkScheme {
  return APP_LINK_SCHEMES.find((scheme) => scheme === value) ?? "shelvr";
}

export function creatorMapLink(
  scheme: AppLinkScheme,
  token: string,
  city: string,
): string {
  return `${scheme}:///?creatorMap=${encodeURIComponent(token)}&city=${encodeURIComponent(city)}`;
}

export function saveAllLabel(city: string, cityCount: number): string {
  return cityCount === 1 ? "Save all to Shelvr" : `Save ${city} to Shelvr`;
}

export function saveAllHint(
  inApp: InAppBrowser | undefined,
  cityCount: number,
): string {
  const tap = cityCount === 1 ? "tap Save all" : "tap your city’s button";
  if (inApp) {
    return `In ${IN_APP_NAMES[inApp]}, tap ••• up top, then Open in browser, and ${tap} there.`;
  }
  return `New to Shelvr? Install it, then come back to this page and ${tap}. If Shelvr opens on Home instead, update it from the App Store.`;
}

export function saveAllMode(userAgent: string): SaveAllMode {
  const device = platform(userAgent);
  if (device === "ios") return "app";
  return device === "android" ? "none" : "elsewhere";
}
