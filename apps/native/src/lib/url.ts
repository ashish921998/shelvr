import { isYouTubeUrl } from "@convex/model/externalUrl";

const URL_PATTERN = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+([/?#]\S*)?$/i;

export function isProbablyUrl(text: string) {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  return URL_PATTERN.test(trimmed);
}

const TRAILING_PUNCTUATION = /[.,;:!?'"]/;

function closesMoreThanItOpens(url: string, open: string, close: string) {
  let depth = 0;
  for (const char of url) {
    if (char === open) depth += 1;
    else if (char === close) depth -= 1;
  }
  return depth < 0;
}

function trimTrailingPunctuation(url: string) {
  let trimmed = url;
  while (trimmed.length > 0) {
    const last = trimmed[trimmed.length - 1];
    const drop =
      TRAILING_PUNCTUATION.test(last) ||
      (last === ")" && closesMoreThanItOpens(trimmed, "(", ")")) ||
      (last === "]" && closesMoreThanItOpens(trimmed, "[", "]"));
    if (!drop) break;
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
}

export function extractFirstUrl(text: string): string | null {
  const match = text.trim().match(/https?:\/\/[^\s<>"]+/i);
  if (!match) return null;
  return trimTrailingPunctuation(match[0]);
}

export function typedLink(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (/\s/.test(trimmed)) return extractFirstUrl(trimmed);
  return trimmed.includes(".") ? trimmed : null;
}

export function displayHost(url: string | undefined) {
  if (!url) return "";
  try {
    return new URL(
      /^https?:\/\//i.test(url) ? url : `https://${url}`,
    ).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const REGISTRY_LABELS = new Set([
  "ac",
  "co",
  "com",
  "edu",
  "gov",
  "net",
  "org",
]);

function siteLabel(host: string): string {
  const labels = host.replace(/\.$/, "").split(".");
  if (labels.length < 2) return host;
  const second = labels[labels.length - 2];
  return labels.length > 2 && REGISTRY_LABELS.has(second)
    ? labels[labels.length - 3]
    : second;
}

export function siteMonogram(url: string | undefined): string | undefined {
  const label = siteLabel(displayHost(url));
  if (label.startsWith("xn--")) return undefined;
  return Array.from(label)[0]?.toLocaleUpperCase();
}

export function youTubeVideo(
  url: string | undefined,
): "video" | "short" | undefined {
  if (!isYouTubeUrl(url)) return undefined;
  try {
    const { hostname, pathname, searchParams } = new URL(url ?? "");
    if (/^\/shorts\/[^/]+/.test(pathname)) return "short";
    if (hostname.toLowerCase() === "youtu.be") {
      return pathname.length > 1 ? "video" : undefined;
    }
    if (pathname === "/watch") {
      return searchParams.get("v") ? "video" : undefined;
    }
    return /^\/(live|clip|embed|v)\/[^/]+/.test(pathname) ? "video" : undefined;
  } catch {
    return undefined;
  }
}

export function isYouTubeVideoUrl(url: string | undefined): boolean {
  return youTubeVideo(url) !== undefined;
}
