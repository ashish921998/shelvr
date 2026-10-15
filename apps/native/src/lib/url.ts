import { isYouTubeUrl } from "@convex/model/externalUrl";

const URL_PATTERN = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+([/?#]\S*)?$/i;

export function isProbablyUrl(text: string) {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  return URL_PATTERN.test(trimmed);
}

const TRAILING_PUNCTUATION = /[.,;:!?'"]/;

/** A closing bracket only ends the URL when the text never opened it: a caption
 * like "(see https://example.com/a)" borrows the paren, whereas
 * "https://en.wikipedia.org/wiki/Function_(mathematics)" needs its own. */
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

/** Extracts the first http(s) URL embedded in a block of text, or null.
 * Share-sheet payloads from real apps (TikTok, Instagram, X) usually wrap the
 * URL in template caption text ("Check out this video! https://...") rather
 * than sending a bare URL, so link detection has to look INSIDE the text.
 * Trailing sentence punctuation is stripped so the extracted link saves
 * cleanly. Returns null when the text contains no http(s) URL. */
export function extractFirstUrl(text: string): string | null {
  const match = text.trim().match(/https?:\/\/[^\s<>"]+/i);
  if (!match) return null;
  return trimTrailingPunctuation(match[0]);
}

/** The link in text typed into the article composer, or null when it holds
 * none. A single token is passed through untouched (trailing punctuation,
 * internationalized hosts and all) so the server's URL policy stays the judge
 * of anything that could be an address; only text that plainly is not one, a
 * word without a dot or a sentence without a link, is refused here. */
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

// Labels a country's domain files its sites under (bbc.co.uk, abc.net.au).
const REGISTRY_LABELS = new Set([
  "ac",
  "co",
  "com",
  "edu",
  "gov",
  "net",
  "org",
]);

/** The label that names the site: ikea in www.ikea.com, wikipedia in
 * en.wikipedia.org, bbc in bbc.co.uk. */
function siteLabel(host: string): string {
  // A fully qualified host (ikea.com.) ends in an empty root label.
  const labels = host.replace(/\.$/, "").split(".");
  if (labels.length < 2) return host;
  const second = labels[labels.length - 2];
  return labels.length > 2 && REGISTRY_LABELS.has(second)
    ? labels[labels.length - 3]
    : second;
}

/** A site's first letter, like a book spine: what a save with no picture shows
 * in place of one. Array.from keeps an emoji or other astral first character
 * whole. Undefined when there is no host to take it from, or when the host is
 * punycode, whose first letter would be a meaningless X. */
export function siteMonogram(url: string | undefined): string | undefined {
  const label = siteLabel(displayHost(url));
  if (label.startsWith("xn--")) return undefined;
  return Array.from(label)[0]?.toLocaleUpperCase();
}

/** A YouTube link that plays a video: a watch, Shorts, live, clip or embed
 * page, or a youtu.be link. A channel, playlist or search page is not one. */
export function isYouTubeVideoUrl(url: string | undefined): boolean {
  if (!isYouTubeUrl(url)) return false;
  try {
    const { hostname, pathname, searchParams } = new URL(url ?? "");
    if (hostname.toLowerCase() === "youtu.be") return pathname.length > 1;
    if (pathname === "/watch") return searchParams.has("v");
    return /^\/(shorts|live|clip|embed|v)\/[^/]+/.test(pathname);
  } catch {
    return false;
  }
}
