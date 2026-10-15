"use node";

/** Shared page data, bounded fetches, HTML extraction and recipe helpers. */
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import {
  safeFetch,
  decodeWithContentType,
  isSafeFetchError,
  type SafeFetchError,
} from "./safeFetch";
import { isPinterestHost, normalizeExternalUrl } from "./externalUrl";
import type { PostMedia, Recipe } from "./itemFields";
import { extractRecipeMarkup, sanitizeRecipe } from "./recipeMarkup";
import { readImageSize } from "./imageSize";

export { z } from "zod";
export { env } from "../_generated/server";
export { safeFetch, decodeWithContentType, parseJson } from "./safeFetch";
export { logEvent } from "./log";
export type { PostMedia } from "./itemFields";

// How much of the article body to store & render. Kept well under Convex's
// 1MB document limit; long-form essays run tens of thousands of chars.
export const MAX_STORED_CONTENT_CHARS = 100000;

// Plain pages are read as a browser would read them: ordinary sites serve
// their link preview markup to browsers, and many refuse unknown agents.
export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** What Shelvr says it is to the platforms it reads by name (TikTok, YouTube,
 * X, Instagram, Pinterest). */
export const SHELVR_USER_AGENT = "Shelvr/1.0 (+https://shelvr-web.vercel.app)";

// How much page text the classifier prompt actually carries. Anything longer
// is cut, so the model never sees the tail.
export const PROMPT_CONTENT_CHARS = 6000;

// ---------------------------------------------------------------------------
// HTML extraction
// ---------------------------------------------------------------------------

/** `&amp;` decodes last, so "&amp;lt;" becomes "&lt;" and never "<". */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      return Number.isFinite(n) && n >= 0 && n <= 0x10ffff
        ? String.fromCodePoint(n)
        : "";
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => {
      const n = parseInt(code, 16);
      return Number.isFinite(n) && n >= 0 && n <= 0x10ffff
        ? String.fromCodePoint(n)
        : "";
    })
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;/g, "…")
    .replace(/&rsquo;/g, "’")
    .replace(/&lsquo;/g, "‘")
    .replace(/&rdquo;/g, "”")
    .replace(/&ldquo;/g, "“")
    .replace(/&amp;/g, "&");
}

/** The page's `<link rel="canonical">` href, tolerant of attribute order. */
export function extractCanonical(html: string): string | undefined {
  const tag = html.match(/<link[^>]*rel\s*=\s*["']canonical["'][^>]*>/i)?.[0];
  const href = tag?.match(/href\s*=\s*["']([^"']*)["']/i)?.[1]?.trim();
  return href ? decodeEntities(href) : undefined;
}

/** Find the content of a meta tag by property/name, tolerant of attribute order. */
export function extractMetaContent(
  html: string,
  key: string,
): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]*(?:property|name)\\s*=\\s*["']${escaped}["'][^>]*content\\s*=\\s*["']([^"']*)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta[^>]*content\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name)\\s*=\\s*["']${escaped}["'][^>]*>`,
      "i",
    ),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1].trim() !== "") {
      return decodeEntities(match[1].trim());
    }
  }
  return undefined;
}

/**
 * Fetch just enough of a metadata image to read its real width/height ratio.
 * Best-effort: any policy/transport failure returns no ratio and the caller
 * falls back to a sensible default. Routes through the safe fetcher so the
 * destination is policy-checked and the body is hard-capped at 128 KiB even if
 * the server ignores Range.
 */
export async function fetchImageAspectRatio(
  imageUrl: string,
): Promise<number | undefined> {
  const result = await safeFetch(imageUrl, {
    timeoutMs: 10000,
    // Header bytes live at the front; 128 KiB covers large EXIF blocks. The
    // safe fetcher enforces this cap on actual streamed bytes regardless of
    // what the server sends, so a Range-ignoring server still cannot exhaust us.
    maxBytes: 131072,
    // Allow only the raster types readImageSize parses (PNG/GIF/WebP/JPEG).
    // SVG is intentionally excluded: it is XML and can carry scripts/XXE, and
    // readImageSize returns undefined for it anyway. ct is already lowercased
    // by the safe fetcher.
    allowContentType: (ct) =>
      ct === "image/png" ||
      ct === "image/gif" ||
      ct === "image/webp" ||
      ct === "image/jpeg" ||
      ct.startsWith("image/png;") ||
      ct.startsWith("image/gif;") ||
      ct.startsWith("image/webp;") ||
      ct.startsWith("image/jpeg;"),
    headers: {
      "User-Agent": BROWSER_USER_AGENT,
      Range: "bytes=0-131071",
    },
  });
  if (!result.ok) {
    // A blocked or oversized hero image is best-effort — no aspect ratio.
    return undefined;
  }
  const size = readImageSize(result.bytes);
  if (size && size.width > 0 && size.height > 0) {
    return size.width / size.height;
  }
  return undefined;
}

function extractTitle(html: string): string | undefined {
  const ogTitle = extractMetaContent(html, "og:title");
  if (ogTitle) {
    return ogTitle;
  }
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (match) {
    const title = decodeEntities(match[1]).replace(/\s+/g, " ").trim();
    if (title !== "") {
      return title;
    }
  }
  return undefined;
}

function htmlToText(html: string): string {
  let text = html;
  // Block-level boundaries become paragraph breaks.
  text = text.replace(
    /<\/(p|div|section|h[1-6]|li|blockquote|tr|figcaption|pre)>/gi,
    "\n\n",
  );
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<li[^>]*>/gi, "- ");
  // Drop every remaining tag.
  text = text.replace(/<[^>]+>/g, " ");
  text = decodeEntities(text);
  // Collapse intra-line whitespace, keep paragraph breaks.
  text = text
    .split(/\n{2,}/)
    .map((para) =>
      para
        .replace(/[ \t]+/g, " ")
        .replace(/\n/g, " ")
        .trim(),
    )
    .filter((para) => para !== "")
    .join("\n\n");
  return text.slice(0, MAX_STORED_CONTENT_CHARS);
}

/**
 * Extract the readable article body. Mozilla Readability (the engine behind
 * Firefox Reader View) scores DOM blocks by text density and link ratio to
 * isolate the real article, discarding nav, ads, share widgets, comment
 * counts, captions, and other boilerplate — so it works across arbitrary
 * article pages rather than one site's markup. We feed its cleaned article
 * HTML through htmlToText to get the paragraph-separated plain text the client
 * renders. Pages without a readable article do not store a body.
 */
// Shortest extraction worth calling an article body. Under this a bot-hostile
// or JS-rendered page has yielded only chrome, and the classifier writing a
// description of that chrome is worse than it knowing there was no body: it
// still has the title, the site and the page's own meta description. The
// shortest text the tests deliberately keep is a little under 200 characters.
const MIN_ARTICLE_CHARS = 120;

export function extractBodyText(html: string, url: string): string | undefined {
  try {
    const { document } = parseHTML(html);
    // Remove explicit page chrome before parsing: the readerability preflight
    // rejects short articles, while parse() can retain chrome on sparse pages.
    for (const element of document.querySelectorAll(
      'nav, footer, [role="navigation"], [role="banner"], [role="contentinfo"], .cookie-banner, #cookie-banner, .cookie-consent, #cookie-consent, .skip-link, .skip-to-content, .skip-nav, .screen-reader-shortcut',
    )) {
      element.remove();
    }
    // MediaWiki chrome (Wikipedia and other MediaWiki sites): the fact box
    // would otherwise open the body as one line per row, and citation marks
    // and edit links would interrupt the prose. Only on a MediaWiki page,
    // since other sites use "infobox" for real content.
    if (document.querySelector(".mw-parser-output")) {
      for (const element of document.querySelectorAll(
        ".infobox, .navbox, .mw-editsection, sup.reference",
      )) {
        element.remove();
      }
    }
    // A skip link is an in-page anchor, so it sits outside nav and banner and
    // reads to Readability as ordinary body text.
    for (const anchor of document.querySelectorAll('a[href^="#"]')) {
      if (/^\s*skip\b/i.test(anchor.textContent ?? "")) {
        anchor.remove();
      }
    }
    for (const menu of document.querySelectorAll(".menu")) {
      const links = Array.from(menu.querySelectorAll("a"));
      const linkText = links
        .map((link) => link.textContent ?? "")
        .join("")
        .replace(/\s/g, "");
      const menuText = (menu.textContent ?? "").replace(/\s/g, "");
      if (links.length > 0 && menuText === linkText) {
        menu.remove();
      }
    }
    // Give Readability a base URL so it can resolve/keep links correctly.
    try {
      const base = document.createElement("base");
      base.setAttribute("href", url);
      document.head?.appendChild(base);
    } catch {
      // Non-fatal — Readability still parses without a <base>.
    }
    const article = new Readability(document).parse();
    if (article?.content) {
      const text = htmlToText(article.content);
      if (text.trim().length >= MIN_ARTICLE_CHARS) {
        return text;
      }
    }
  } catch {
    // Malformed pages without a readable body remain bare links.
  }
  return undefined;
}

export type PageData = {
  title?: string;
  description?: string;
  heroImageUrl?: string;
  heroAspectRatio?: number;
  siteName?: string;
  author?: string;
  content?: string;
  /** A best-effort part of the read failed transiently (e.g. the Instagram
   * caption), so a retry can still add content. Internal only. */
  incomplete?: true;
  /** The source served a cut copy of its own text, so `content` ends early no
   * matter how short it is. X does this for a long post (`note_tweet`) and for
   * an Article preview. Internal only. */
  truncated?: true;
  media?: PostMedia[];
  /** The recipe the page declares in schema.org markup (or, for a caption
   * source, the recipe page its caption links to). Already sanitized. */
  recipe?: Recipe;
  /** The reader returned a post's caption rather than a page body, so the
   * model may be asked to transcribe a recipe from it. */
  caption?: true;
  /** The Pinterest board a pin was saved to. */
  board?: string;
  /** The post is a video, though only its caption was read. */
  video?: true;
  /** The title of the page `linkedUrl` leads to, when the source names it. */
  linkedTitle?: string;
  /** The caption's first outside link, when the reader saw the real href
   * rather than the display text. Readers that don't set it fall back to
   * scanning the caption in `withLinkedRecipe`. */
  linkedUrl?: string;
  /** The post's own address, once a share or short link has named it. */
  postUrl?: string;
};

export function postField(postUrl: string | undefined): { postUrl?: string } {
  return postUrl ? { postUrl } : {};
}

/** Hosts whose pages are link hubs or the social network itself — never the
 * recipe write-up — so a caption pointing there is not worth a fetch. */
const LINK_HUB_HOSTS = new Set([
  "linktr.ee",
  "linkin.bio",
  "beacons.ai",
  "bio.link",
  "lnk.bio",
  "tiktok.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "youtube.com",
  "youtu.be",
]);

/** First http(s) URL in a caption worth following for a recipe, with trailing
 * punctuation trimmed and link hubs skipped. Exported pure for unit testing. */
export function firstLinkedUrl(text: string | undefined): string | undefined {
  if (!text) {
    return undefined;
  }
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'()]+/gi)) {
    const candidate = match[0].replace(/[.,;:!?]+$/, "");
    try {
      const host = new URL(candidate).hostname.replace(/^www\./, "");
      if (!LINK_HUB_HOSTS.has(host) && !isPinterestHost(host)) {
        return candidate;
      }
    } catch {
      // Not a URL after all; keep scanning.
    }
  }
  return undefined;
}

/** True for a fetch failure a later retry may not repeat: a timeout, a network
 * error, rate limiting, or a server error. */
export function isTransientFetchFailure(code: SafeFetchError, status?: number) {
  return (
    code === "timeout" ||
    code === "fetch_failed" ||
    (code === "http_error" &&
      status !== undefined &&
      (status === 429 || status >= 500))
  );
}

/**
 * Thrown when the page could not be read through the safe-fetch policy: the
 * resource may be blocked by policy, refused, or simply gone. Carries only a
 * stable code (never the URL, addresses, or response body) so callers can log
 * a sanitized category. A failed primary page fetch is a CORE processing
 * problem, unlike a blocked best-effort hero image.
 */
export class PageFetchError extends Error {
  constructor(
    public readonly code: SafeFetchError,
    /** HTTP status when `code` is `http_error`. Feeds `pageGone`. */
    public readonly status?: number,
  ) {
    super(`page fetch failed: ${code}`);
    this.name = "PageFetchError";
  }
}

export function isPageFetchError(e: unknown): e is PageFetchError {
  return e instanceof PageFetchError;
}

/**
 * Reduce a caught fetch error to a safe log category. Fetch-policy errors
 * expose only their stable code; anything else retains the error's constructor
 * name (e.g. TypeError) for observability without leaking data — never the
 * error's message or cause, which may carry a URL, response body, or resolved
 * address.
 */
export function fetchErrorCategory(error: unknown): string {
  if (isPageFetchError(error)) {
    return `page_fetch_error:${error.code}`;
  }
  // Defensive: safeFetch returns error codes in its result type and never
  // throws SafeFetchErrorClass itself, but if a future caller uses the
  // throwing variant directly this branch ensures the error is summarized.
  if (isSafeFetchError(error)) {
    return `safe_fetch:${error.code}`;
  }
  // Include the constructor name so genuine bugs are diagnosable in logs; the
  // name (TypeError, RangeError, ...) carries no user/request data.
  if (error !== null && typeof error === "object" && "name" in error) {
    return `unexpected_error:${String(error.name)}`;
  }
  return "unexpected_error";
}

/** Fetch policy for an HTML page read: the saved link itself, or the recipe
 * page a caption links to. */
export const PAGE_FETCH_OPTIONS = {
  timeoutMs: 15000,
  // Hard cap on the streamed page body. Generous for real articles; bounded
  // to deny a malicious/buggy server from exhausting memory. Truncate instead
  // of failing — a large page's first 1 MiB is still enough for extraction.
  maxBytes: 1024 * 1024,
  onOverflow: "truncate",
  allowContentType: (ct: string) =>
    ct.startsWith("text/html") ||
    ct.startsWith("application/xhtml+xml") ||
    ct.startsWith("application/xml"),
  headers: {
    "User-Agent": BROWSER_USER_AGENT,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  },
} as const;

/**
 * The recipe a page declares in its own schema.org markup, or undefined when
 * it declares none.
 *
 * A read cut off at `maxBytes` yields nothing, because a cut document still
 * parses. Microdata's ingredient and step lists simply stop early, and a recipe
 * whose method stops after step 1 reads exactly like a recipe with one step —
 * `sanitizeRecipe` checks that the lists are non-empty and within budget, which
 * a prefix satisfies. JSON-LD survives a cut only by accident, since
 * `JSON.parse` rejects a half-written object, so the guard belongs here where
 * both markup shapes pass through rather than inside the extractor.
 */
function recipeFromMarkup(
  html: string,
  truncated: true | undefined,
): Recipe | undefined {
  return truncated ? undefined : sanitizeRecipe(extractRecipeMarkup(html));
}

/**
 * A caption source (TikTok, X, Instagram, a Pinterest pin) carries only a
 * caption, and the caption often links to the full recipe write-up. Follow
 * that one link and read its structured recipe markup. Best-effort: a
 * blocked, slow, or markup-less page leaves the post exactly as it was.
 */
export async function withLinkedRecipe(page: PageData): Promise<PageData> {
  const caption = captionText(page);
  if (caption === undefined) {
    return page;
  }
  const linkedUrl = page.linkedUrl ?? firstLinkedUrl(caption);
  if (linkedUrl === undefined) {
    return page;
  }
  try {
    const result = await safeFetch(linkedUrl, PAGE_FETCH_OPTIONS);
    if (!result.ok) {
      return page;
    }
    const recipe = recipeFromMarkup(
      decodeWithContentType(result.bytes, result.contentType),
      result.truncated,
    );
    return recipe === undefined ? page : { ...page, recipe };
  } catch {
    return page;
  }
}

export async function fetchPage(
  url: string,
  /** A landing URL that means the page is gone despite a 200. */
  isGone?: (finalUrl: string) => boolean,
): Promise<PageData> {
  const result = await safeFetch(url, PAGE_FETCH_OPTIONS);
  if (!result.ok) {
    // Surface only the policy code (+ status for http_error); readPage decides
    // whether the item can still be saved.
    throw new PageFetchError(result.code, result.status);
  }
  if (isGone?.(result.finalUrl)) {
    throw new PageFetchError("http_error", 404);
  }
  const finalUrl = result.finalUrl;
  const html = decodeWithContentType(result.bytes, result.contentType);

  const title = extractTitle(html);
  const description =
    extractMetaContent(html, "og:description") ??
    extractMetaContent(html, "description");

  let heroImageUrl =
    extractMetaContent(html, "og:image") ??
    extractMetaContent(html, "og:image:url") ??
    extractMetaContent(html, "twitter:image");
  if (heroImageUrl) {
    try {
      heroImageUrl = normalizeExternalUrl(
        new URL(heroImageUrl, finalUrl).toString(),
      );
    } catch {
      heroImageUrl = undefined;
    }
  }

  // Match the preview to the OG image's real shape. Prefer the dimensions the
  // page declares; if absent, read them from the image file itself.
  let heroAspectRatio: number | undefined;
  if (heroImageUrl) {
    const ogWidth = Number(extractMetaContent(html, "og:image:width"));
    const ogHeight = Number(extractMetaContent(html, "og:image:height"));
    if (
      Number.isFinite(ogWidth) &&
      Number.isFinite(ogHeight) &&
      ogWidth > 0 &&
      ogHeight > 0
    ) {
      heroAspectRatio = ogWidth / ogHeight;
    } else {
      heroAspectRatio = await fetchImageAspectRatio(heroImageUrl);
    }
  }

  let siteName = extractMetaContent(html, "og:site_name");
  if (!siteName) {
    try {
      siteName = new URL(finalUrl).hostname.replace(/^www\./, "");
    } catch {
      siteName = undefined;
    }
  }

  const content = extractBodyText(html, finalUrl);
  // The page's own schema.org Recipe markup is the recipe: exact lines, no
  // prompt window, nothing invented. Absent for anything not a recipe.
  const recipe = recipeFromMarkup(html, result.truncated);

  return {
    title,
    description,
    heroImageUrl,
    heroAspectRatio,
    siteName,
    content,
    // A page over the fetch cap gives us a prefix, so `content` ends early
    // however long it looks.
    ...(result.truncated ? { truncated: true as const } : {}),
    ...(recipe ? { recipe } : {}),
  };
}

/** The page's text when the model receives all of it, which is what makes it a
 * caption rather than a body. A longer read (an X Article, a blog post) is
 * neither text whose one outbound link is the recipe it describes, nor text a
 * model can transcribe a recipe from without inventing the part that was cut. */
export function captionText(page: PageData): string | undefined {
  return page.content !== undefined &&
    page.content.length <= PROMPT_CONTENT_CHARS
    ? page.content
    : undefined;
}
