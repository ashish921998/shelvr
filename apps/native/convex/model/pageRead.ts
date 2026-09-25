"use node";

/**
 * Reading a saved link's page: fetch it through the safe fetcher, pick the
 * reader for the host (TikTok oEmbed, X syndication, Instagram embed, or a
 * plain HTML page), extract the title, meta, hero image, readable body and any
 * schema.org recipe, and follow a caption's link to its recipe page.
 *
 * `readPage(url)` is the one entry point the classifier needs. Host knowledge
 * stays here: the `ok` result says whether the model may be asked for a recipe
 * and which short-form source the page came from, so the caller never checks a
 * URL itself.
 *
 * Node-only (linkedom, Readability, safeFetch); imported from the `"use node"`
 * action module. Never import it from a query, mutation, or `schema.ts`.
 */
import { z } from "zod";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import type { Id } from "../_generated/dataModel";
import {
  safeFetch,
  decodeWithContentType,
  parseJson,
  isSafeFetchError,
  type SafeFetchError,
} from "./safeFetch";
import {
  instagramMedia,
  isInstagramUrl,
  isTikTokUrl,
  isXHost,
  shortFormSource,
  xStatusId,
} from "./externalUrl";
import type { ArticleMedia, PostMedia, Recipe } from "./itemFields";
import { logEvent } from "./log";
import { extractRecipeMarkup, sanitizeRecipe } from "./recipeMarkup";

// How much of the article body to store & render. Kept well under Convex's
// 1MB document limit; long-form essays run tens of thousands of chars.
const MAX_STORED_CONTENT_CHARS = 100000;
// How much page text the classifier prompt actually carries. Anything longer
// is cut, so the model never sees the tail.
export const PROMPT_CONTENT_CHARS = 6000;

// ---------------------------------------------------------------------------
// HTML extraction
// ---------------------------------------------------------------------------

function decodeEntities(text: string): string {
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
    .replace(/&amp;/g, "&")
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
    .replace(/&ldquo;/g, "“");
}

/** The page's `<link rel="canonical">` href, tolerant of attribute order. */
function extractCanonical(html: string): string | undefined {
  const tag = html.match(/<link[^>]*rel\s*=\s*["']canonical["'][^>]*>/i)?.[0];
  const href = tag?.match(/href\s*=\s*["']([^"']*)["']/i)?.[1]?.trim();
  return href ? decodeEntities(href) : undefined;
}

/** Find the content of a meta tag by property/name, tolerant of attribute order. */
function extractMetaContent(html: string, key: string): string | undefined {
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

type ImageSize = { width: number; height: number };

function readUint32BE(buf: Uint8Array, offset: number): number {
  return (
    (buf[offset] << 24) |
    (buf[offset + 1] << 16) |
    (buf[offset + 2] << 8) |
    buf[offset + 3]
  );
}

function readUint16BE(buf: Uint8Array, offset: number): number {
  return (buf[offset] << 8) | buf[offset + 1];
}

function readUint16LE(buf: Uint8Array, offset: number): number {
  return buf[offset] | (buf[offset + 1] << 8);
}

function hasBytes(
  buf: Uint8Array,
  offset: number,
  signature: number[],
): boolean {
  return signature.every((byte, i) => buf[offset + i] === byte);
}

// PNG — IHDR width/height are big-endian uint32 at offset 16/20.
function pngSize(buf: Uint8Array): ImageSize | undefined {
  if (buf.length < 24 || !hasBytes(buf, 0, [0x89, 0x50, 0x4e, 0x47])) {
    return undefined;
  }
  return { width: readUint32BE(buf, 16), height: readUint32BE(buf, 20) };
}

// GIF — little-endian uint16 at offset 6/8.
function gifSize(buf: Uint8Array): ImageSize | undefined {
  if (buf.length < 10 || !hasBytes(buf, 0, [0x47, 0x49, 0x46])) {
    return undefined;
  }
  return { width: readUint16LE(buf, 6), height: readUint16LE(buf, 8) };
}

// WebP — RIFF container tagged "WEBP", three sub-formats.
function webpSize(buf: Uint8Array): ImageSize | undefined {
  if (
    buf.length < 30 ||
    !hasBytes(buf, 0, [0x52, 0x49, 0x46, 0x46]) ||
    !hasBytes(buf, 8, [0x57, 0x45, 0x42, 0x50])
  ) {
    return undefined;
  }
  const fourCC = String.fromCharCode(buf[12], buf[13], buf[14], buf[15]);
  if (fourCC === "VP8 ") {
    return {
      width: readUint16LE(buf, 26) & 0x3fff,
      height: readUint16LE(buf, 28) & 0x3fff,
    };
  }
  if (fourCC === "VP8L") {
    const b0 = buf[21];
    const b1 = buf[22];
    const b2 = buf[23];
    const b3 = buf[24];
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    };
  }
  if (fourCC === "VP8X") {
    return {
      width: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)),
      height: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)),
    };
  }
  return undefined;
}

// JPEG — walk segments to the start-of-frame marker.
function jpegSize(buf: Uint8Array): ImageSize | undefined {
  if (buf.length < 2 || !hasBytes(buf, 0, [0xff, 0xd8])) {
    return undefined;
  }
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buf[offset + 1];
    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame) {
      return {
        height: readUint16BE(buf, offset + 5),
        width: readUint16BE(buf, offset + 7),
      };
    }
    const segLen = readUint16BE(buf, offset + 2);
    if (segLen <= 0) {
      break;
    }
    offset += 2 + segLen;
  }
  return undefined;
}

/**
 * Read the pixel dimensions straight from an image file's header bytes.
 * Covers PNG, GIF, WebP (VP8/VP8L/VP8X) and JPEG — no dependencies. Returns
 * undefined for formats we don't recognize or truncated buffers.
 */
export function readImageSize(buf: Uint8Array): ImageSize | undefined {
  return pngSize(buf) ?? gifSize(buf) ?? webpSize(buf) ?? jpegSize(buf);
}

/**
 * Fetch just enough of a metadata image to read its real width/height ratio.
 * Best-effort: any policy/transport failure returns no ratio and the caller
 * falls back to a sensible default. Routes through the safe fetcher so the
 * destination is policy-checked and the body is hard-capped at 128 KiB even if
 * the server ignores Range.
 */
async function fetchImageAspectRatio(
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
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
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
  articleMedia?: ArticleMedia[];
  /** The recipe the page declares in schema.org markup (or, for a caption
   * source, the recipe page its caption links to). Already sanitized. */
  recipe?: Recipe;
  /** The caption's first outside link, when the reader saw the real href
   * rather than the display text. Readers that don't set it fall back to
   * scanning the caption in `withLinkedRecipe`. */
  linkedUrl?: string;
};

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
      if (!LINK_HUB_HOSTS.has(host)) {
        return candidate;
      }
    } catch {
      // Not a URL after all; keep scanning.
    }
  }
  return undefined;
}

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/**
 * TikTok refuses bot page loads, but its public oEmbed endpoint answers with
 * the caption, creator, and a 9:16 poster — everything the card needs. TikTok
 * also returns 400 for unsupported URL shapes, so only true 404/410 responses
 * are treated as permanently gone by the shared page reader.
 */
async function fetchTikTokOEmbed(url: string): Promise<PageData> {
  const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
  const result = await safeFetch(endpoint, {
    timeoutMs: 15000,
    maxBytes: 64 * 1024,
    allowContentType: (ct) => ct.startsWith("application/json"),
    headers: { "User-Agent": BROWSER_USER_AGENT, Accept: "application/json" },
  });
  if (!result.ok) {
    throw new PageFetchError(result.code, result.status);
  }
  const data = parseJson(result.bytes) as Record<string, unknown>;
  const str = (key: string) => {
    const value = data[key];
    return typeof value === "string" && value !== "" ? value : undefined;
  };
  const width = Number(data.thumbnail_width);
  const height = Number(data.thumbnail_height);
  const handle = str("author_unique_id");
  const caption = str("title");
  return {
    title: caption,
    siteName: "TikTok",
    author: handle ? `@${handle}` : str("author_name"),
    heroImageUrl: str("thumbnail_url"),
    heroAspectRatio: width > 0 && height > 0 ? width / height : 9 / 16,
    content: caption,
  };
}

/**
 * X serves posts behind JS rendering and a login wall, but its public oEmbed
 * endpoint answers with the post markup and author. The markup is
 * `<blockquote><p>post text</p>&mdash; Author (@handle) <a>date</a></blockquote>`,
 * so only the first paragraph becomes content; the attribution stays out. A
 * body that is not a JSON object is unreadable, like a page that fails to
 * parse, so the item keeps its URL-only fallback instead of crashing.
 */
export async function fetchXoEmbed(url: string): Promise<PageData> {
  const endpoint = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`;
  const result = await safeFetch(endpoint, {
    timeoutMs: 15000,
    maxBytes: 64 * 1024,
    allowContentType: (ct) => ct.startsWith("application/json"),
    headers: { "User-Agent": BROWSER_USER_AGENT, Accept: "application/json" },
  });
  if (!result.ok) {
    throw new PageFetchError(result.code, result.status);
  }
  let parsed: unknown;
  try {
    parsed = parseJson(result.bytes);
  } catch {
    throw new PageFetchError("http_error", result.status);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new PageFetchError("http_error", result.status);
  }
  const data = parsed as Record<string, unknown>;
  const str = (key: string) => {
    const value = data[key];
    return typeof value === "string" && value !== "" ? value : undefined;
  };
  const html = str("html") ?? "";
  const paragraph = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const body = paragraph ? paragraph[1] : html;
  const content = decodeEntities(
    body
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
  // Post links are t.co redirects whose anchor text is the display URL;
  // attached media links display as pic.twitter.com and lead nowhere useful.
  const hrefs = Array.from(
    body.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi),
  )
    .filter(([, , label]) => !/^\s*pic\.(twitter|x)\.com/i.test(label))
    .map(([, href]) => decodeEntities(href));
  // author_url carries the handle; author_name is the display name.
  const handle = str("author_url")?.match(
    /(?:twitter\.com|x\.com)\/([^/?#]+)/i,
  )?.[1];
  return {
    title: content.slice(0, 100) || undefined,
    siteName: "X",
    author: handle ? `@${handle}` : str("author_name"),
    content: content || undefined,
    linkedUrl: firstLinkedUrl(hrefs.join(" ")),
  };
}

const xDimensions = {
  width: z.number().positive(),
  height: z.number().positive(),
};

const xSyndicationSchema = z.object({
  text: z.string().optional(),
  user: z.object({ screen_name: z.string() }).optional(),
  possibly_sensitive: z.boolean().optional(),
  entities: z
    .object({
      urls: z
        .array(z.object({ url: z.string(), expanded_url: z.string() }))
        .optional(),
      media: z.array(z.object({ url: z.string() })).optional(),
    })
    .optional(),
  mediaDetails: z
    .array(
      z.object({
        type: z.string(),
        media_url_https: z.url(),
        original_info: z.object(xDimensions),
      }),
    )
    .optional(),
  // Present when `text` is the first 280 characters of a longer post.
  note_tweet: z.object({}).optional(),
  article: z
    .object({
      title: z.string(),
      preview_text: z.string().optional(),
      cover_media: z
        .object({
          media_info: z.object({
            original_img_url: z.url(),
            original_img_width: xDimensions.width,
            original_img_height: xDimensions.height,
          }),
        })
        .optional(),
    })
    .optional(),
});

const X_MEDIA_KINDS: Partial<Record<string, PostMedia["kind"]>> = {
  photo: "photo",
  video: "video",
  animated_gif: "gif",
};

/** pbs.twimg.com serves a small rendition by default (600 px for older
 * posts); `name=large` is the largest one, capped at 2048 px. */
function xLargeImage(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("name", "large");
  return parsed.toString();
}

/** A post's display text: X escapes `&`, `<`, and `>`, shortens links to
 * t.co, and appends a t.co link for its attached media. */
function xPostText(
  post: z.infer<typeof xSyndicationSchema>,
): string | undefined {
  let text = decodeEntities(post.text ?? "");
  for (const link of post.entities?.urls ?? []) {
    text = text.replaceAll(link.url, link.expanded_url);
  }
  for (const attachment of post.entities?.media ?? []) {
    text = text.replaceAll(attachment.url, "");
  }
  text = text.trim();
  if (text === "") {
    return undefined;
  }
  return post.note_tweet ? `${text}…` : text;
}

type XSyndicationRead = {
  page: PageData;
  isArticle: boolean;
  sensitive: boolean;
};

function parseXSyndication(body: unknown): XSyndicationRead | undefined {
  const parsed = xSyndicationSchema.safeParse(body);
  if (!parsed.success) {
    return undefined;
  }
  const post = parsed.data;
  const author = post.user ? `@${post.user.screen_name}` : undefined;
  // X hides sensitive media behind a warning; the feed and widget have none.
  const cover = post.possibly_sensitive
    ? undefined
    : post.article?.cover_media?.media_info;
  if (post.article) {
    // Syndication cuts the preview mid-sentence; X's web app loads the rest
    // from its private API.
    const preview = post.article.preview_text?.trim();
    return {
      isArticle: true,
      sensitive: post.possibly_sensitive === true,
      page: {
        title: post.article.title,
        siteName: "X",
        author,
        content: preview ? `${preview}…` : undefined,
        // The preview is a cut copy; withXArticleBody swaps in the whole body
        // when X's private API answers.
        ...(preview ? { truncated: true as const } : {}),
        heroImageUrl: cover ? xLargeImage(cover.original_img_url) : undefined,
        heroAspectRatio: cover
          ? cover.original_img_width / cover.original_img_height
          : undefined,
      },
    };
  }
  const content = xPostText(post);
  const attachments = post.possibly_sensitive ? [] : (post.mediaDetails ?? []);
  const media = attachments.flatMap((attachment) => {
    const kind = X_MEDIA_KINDS[attachment.type];
    return kind
      ? [
          {
            kind,
            imageUrl: xLargeImage(attachment.media_url_https),
            aspectRatio:
              attachment.original_info.width / attachment.original_info.height,
          },
        ]
      : [];
  });
  if (content === undefined && media.length === 0) {
    return undefined;
  }
  return {
    isArticle: false,
    sensitive: post.possibly_sensitive === true,
    page: {
      title: content ? Array.from(content).slice(0, 100).join("") : undefined,
      siteName: "X",
      author,
      content,
      ...(post.note_tweet ? { truncated: true as const } : {}),
      ...(media.length > 0
        ? {
            heroImageUrl: media[0].imageUrl,
            heroAspectRatio: media[0].aspectRatio,
            media,
          }
        : {}),
    },
  };
}

// fxtwitter mirrors the Draft.js blocks X's web app renders an Article from.
// Entity offsets count code points, not UTF-16 units.
const fxArticleSchema = z.object({
  status: z.object({
    id: z.string(),
    article: z.object({
      content: z.object({
        blocks: z.array(
          z.object({
            type: z.string(),
            text: z.string(),
            entityRanges: z
              .array(
                z.object({
                  key: z.coerce.string(),
                  offset: z.number().int().nonnegative(),
                  length: z.number().int().positive(),
                }),
              )
              .default([]),
          }),
        ),
        entityMap: z.array(
          z.object({
            key: z.string(),
            value: z.object({
              type: z.string(),
              data: z.object({
                url: z.string().optional(),
                // Parsed in blockMedia, so an odd shape skips the image
                // rather than the whole body.
                mediaItems: z.unknown().optional(),
              }),
            }),
          }),
        ),
      }),
      // Parsed one entry at a time (see articleMediaById), so a media type
      // this schema does not know cannot cost the whole body.
      media_entities: z.array(z.unknown()).default([]),
    }),
  }),
});

const fxMediaItemsSchema = z.array(
  z.object({ mediaId: z.union([z.string(), z.number()]).transform(String) }),
);

const fxImageInfo = z.object({
  original_img_url: z.url(),
  original_img_width: xDimensions.width,
  original_img_height: xDimensions.height,
});

const fxMediaEntitySchema = z.object({
  media_id: z.coerce.string(),
  media_info: z.discriminatedUnion("__typename", [
    fxImageInfo.extend({ __typename: z.literal("ApiImage") }),
    z.object({
      __typename: z.enum(["ApiVideo", "ApiGif"]),
      preview_image: fxImageInfo,
    }),
  ]),
});

type FxArticle = z.infer<typeof fxArticleSchema>["status"]["article"];
type FxArticleContent = FxArticle["content"];

const FXTWITTER_USER_AGENT = "Shelvr/1.0 (+https://shelvr.app)";

/** An external link's URL, for the reader to see where "HERE" goes. Links to
 * X itself (mentions, cashtags, subscribe buttons) read fine as their text. */
function externalLinkUrl(url: string | undefined): string | undefined {
  if (url === undefined) {
    return undefined;
  }
  try {
    const parsed = new URL(url);
    const web = parsed.protocol === "https:" || parsed.protocol === "http:";
    return web && !isXHost(parsed.hostname) ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

function articleBlockText(
  block: FxArticleContent["blocks"][number],
  links: Map<string, string>,
): string {
  const chars = Array.from(block.text);
  const ranges = [...block.entityRanges].sort((a, b) => b.offset - a.offset);
  for (const range of ranges) {
    const url = links.get(range.key);
    const end = range.offset + range.length;
    if (url === undefined || end > chars.length) {
      continue;
    }
    const anchor = chars.slice(range.offset, end).join("");
    if (!anchor.includes(url)) {
      chars.splice(end, 0, ` (${url})`);
    }
  }
  return chars
    .join("")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** Where to show an Article's images and videos, keyed by media id. */
function articleMediaById(
  entities: unknown[],
): Map<string, Omit<ArticleMedia, "paragraph">> {
  const byId = new Map<string, Omit<ArticleMedia, "paragraph">>();
  for (const entity of entities) {
    const parsed = fxMediaEntitySchema.safeParse(entity);
    if (!parsed.success) {
      continue;
    }
    const info = parsed.data.media_info;
    const image = info.__typename === "ApiImage" ? info : info.preview_image;
    byId.set(parsed.data.media_id, {
      kind:
        info.__typename === "ApiImage"
          ? "photo"
          : info.__typename === "ApiVideo"
            ? "video"
            : "gif",
      imageUrl: xLargeImage(image.original_img_url),
      aspectRatio: image.original_img_width / image.original_img_height,
    });
  }
  return byId;
}

/** The readable media an atomic block points at. */
function blockMedia(
  block: FxArticleContent["blocks"][number],
  content: FxArticleContent,
  mediaById: Map<string, Omit<ArticleMedia, "paragraph">>,
): Omit<ArticleMedia, "paragraph">[] {
  return block.entityRanges.flatMap((range) => {
    const entity = content.entityMap.find((e) => e.key === range.key);
    const items = fxMediaItemsSchema.safeParse(entity?.value.data.mediaItems);
    return (items.success ? items.data : []).flatMap((item) => {
      const found = mediaById.get(item.mediaId);
      return found ? [found] : [];
    });
  });
}

const MAX_ARTICLE_MEDIA = 50;

type ArticleBody = { text: string; media: ArticleMedia[] };

/** The plain-text body the reader view renders, one paragraph per text
 * block, and the images and videos that sit between those paragraphs.
 * Embedded posts and dividers are atomic blocks the reader cannot show, so
 * they are left out rather than marked. */
function articleBody(article: FxArticle): ArticleBody | undefined {
  const { content } = article;
  const mediaById = articleMediaById(article.media_entities);
  const links = new Map<string, string>();
  for (const entity of content.entityMap) {
    const url =
      entity.value.type === "LINK"
        ? externalLinkUrl(entity.value.data.url)
        : undefined;
    if (url !== undefined) {
      links.set(entity.key, url);
    }
  }
  const paragraphs: string[] = [];
  const media: ArticleMedia[] = [];
  let listNumber = 0;
  for (const block of content.blocks) {
    if (block.type === "atomic") {
      for (const found of blockMedia(block, content, mediaById)) {
        media.push({ ...found, paragraph: paragraphs.length });
      }
    }
    const text = block.type === "atomic" ? "" : articleBlockText(block, links);
    if (text === "") {
      continue;
    }
    listNumber = block.type === "ordered-list-item" ? listNumber + 1 : 0;
    paragraphs.push(
      block.type === "unordered-list-item"
        ? `- ${text}`
        : block.type === "ordered-list-item"
          ? `${listNumber}. ${text}`
          : text,
    );
  }
  const joined = paragraphs.join("\n\n");
  const text = joined.slice(0, MAX_STORED_CONTENT_CHARS);
  if (text === "") {
    return undefined;
  }
  // A cut body loses its last paragraphs, and the media after them.
  const kept =
    text.length === joined.length
      ? paragraphs.length
      : text.split("\n\n").length - 1;
  return {
    text,
    media: media.filter((m) => m.paragraph <= kept).slice(0, MAX_ARTICLE_MEDIA),
  };
}

type ArticleBodyRead =
  | { ok: true; body: ArticleBody }
  | { ok: false; category: string };

async function readXArticleBody(id: string): Promise<ArticleBodyRead> {
  const result = await safeFetch(`https://api.fxtwitter.com/2/status/${id}`, {
    timeoutMs: 5000,
    maxBytes: 2 * 1024 * 1024,
    maxRedirects: 0,
    allowContentType: (ct) => ct.startsWith("application/json"),
    headers: { "User-Agent": FXTWITTER_USER_AGENT, Accept: "application/json" },
  });
  if (!result.ok) {
    return {
      ok: false,
      category:
        result.status === undefined
          ? `fetch:${result.code}`
          : `fetch:${result.code}:${result.status}`,
    };
  }
  let json: unknown;
  try {
    json = parseJson(result.bytes);
  } catch {
    return { ok: false, category: "unreadable_json" };
  }
  const parsed = fxArticleSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, category: "schema_mismatch" };
  }
  if (parsed.data.status.id !== id) {
    return { ok: false, category: "id_mismatch" };
  }
  const body = articleBody(parsed.data.status.article);
  return body === undefined
    ? { ok: false, category: "empty_body" }
    : { ok: true, body };
}

/** fxtwitter is an unofficial mirror of X's private web API, so the full body
 * is a bonus: any failure keeps the syndication preview. */
async function withXArticleBody(
  id: string,
  page: PageData,
  sensitive: boolean,
): Promise<PageData> {
  const read = await readXArticleBody(id);
  if (read.ok) {
    // Sensitive media stays hidden, as for posts. An Article that opens
    // with its cover would show it twice.
    const media = sensitive
      ? []
      : read.body.media.filter(
          (m) => m.paragraph > 0 || m.imageUrl !== page.heroImageUrl,
        );
    // The whole body replaces the cut preview, so the read is no longer short
    // of its source.
    const { truncated: _preview, ...whole } = page;
    return {
      ...whole,
      content: read.body.text,
      ...(media.length > 0 ? { articleMedia: media } : {}),
    };
  }
  logEvent("warn", "x_article_body_fallback", {
    error_category: read.category,
  });
  return page;
}

/** react-tweet's token for the syndication endpoint, derived from the id. */
function xSyndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

/** X's public syndication endpoint (the one embedded posts render from)
 * carries Article titles and covers and the post's media, which oEmbed does
 * not. */
export async function fetchXPost(url: string): Promise<PageData> {
  const id = xStatusId(url);
  if (id === undefined) {
    return await fetchXoEmbed(url);
  }
  const result = await safeFetch(
    `https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${xSyndicationToken(id)}`,
    {
      timeoutMs: 10000,
      maxBytes: 256 * 1024,
      allowContentType: (ct) => ct.startsWith("application/json"),
      headers: { "User-Agent": BROWSER_USER_AGENT, Accept: "application/json" },
    },
  );
  let read: XSyndicationRead | undefined;
  if (result.ok) {
    try {
      read = parseXSyndication(parseJson(result.bytes));
    } catch {
      read = undefined;
    }
  }
  if (read) {
    return read.isArticle
      ? await withXArticleBody(id, read.page, read.sensitive)
      : read.page;
  }
  logEvent("warn", "x_syndication_fallback", {
    error_category: result.ok
      ? "unreadable_post"
      : `page_fetch_error:${result.code}`,
  });
  return await fetchXoEmbed(url);
}

/**
 * Instagram serves browsers a login shell with no metadata, but answers a link
 * preview crawler with `twitter:title` ("Name (@handle) • Instagram reel") and
 * a square-cropped `og:image`. Its captioned embed adds the caption and the
 * uncropped poster. Parsed apart from the fetch so it is testable.
 */
export function parseInstagramEmbed(html: string): {
  caption?: string;
  username?: string;
  posterUrl?: string;
} {
  const block = html.match(
    /<div class="Caption">([\s\S]*?)<div class="CaptionComments">/i,
  )?.[1];
  const username = block
    ?.match(/<a[^>]*class="CaptionUsername"[^>]*>([^<]*)<\/a>/i)?.[1]
    ?.trim();
  const caption = block
    ? decodeEntities(
        block
          .replace(/<a[^>]*class="CaptionUsername"[^>]*>[^<]*<\/a>/i, "")
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<[^>]+>/g, ""),
      )
        .split("\n")
        .map((line) => line.replace(/[ \t]+/g, " ").trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
    : undefined;
  const img = html.match(/<img[^>]*class="EmbeddedMediaImage"[^>]*>/i)?.[0];
  const src = img?.match(/\ssrc="([^"]+)"/i)?.[1];
  return {
    caption: caption || undefined,
    username: username ? decodeEntities(username) : undefined,
    posterUrl: src ? decodeEntities(src) : undefined,
  };
}

const LINK_PREVIEW_USER_AGENT = "facebookexternalhit/1.1";

async function fetchInstagramHtml(url: string) {
  return await safeFetch(url, {
    timeoutMs: 15000,
    maxBytes: 1024 * 1024,
    onOverflow: "truncate",
    allowContentType: (ct) => ct.startsWith("text/html"),
    headers: {
      "User-Agent": LINK_PREVIEW_USER_AGENT,
      Accept: "text/html",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
}

type InstagramEmbed =
  | { status: "ok"; html: string; truncated?: true }
  | { status: "missing" }
  | { status: "transient"; errorCategory: string };

/** True for a fetch failure a later retry may not repeat: a timeout, a network
 * error, rate limiting, or a server error. */
function isTransientFetchFailure(code: SafeFetchError, status?: number) {
  return (
    code === "timeout" ||
    code === "fetch_failed" ||
    (code === "http_error" &&
      status !== undefined &&
      (status === 429 || status >= 500))
  );
}

async function fetchInstagramEmbed(url: string): Promise<InstagramEmbed> {
  let result: Awaited<ReturnType<typeof fetchInstagramHtml>>;
  try {
    result = await fetchInstagramHtml(url);
  } catch (error) {
    return { status: "transient", errorCategory: fetchErrorCategory(error) };
  }
  if (result.ok) {
    return {
      status: "ok",
      html: decodeWithContentType(result.bytes, result.contentType),
      ...(result.truncated ? { truncated: true as const } : {}),
    };
  }
  return isTransientFetchFailure(result.code, result.status)
    ? { status: "transient", errorCategory: `page_fetch_error:${result.code}` }
    : { status: "missing" };
}

/**
 * Read an Instagram post or reel. The page fetch decides gone/unreadable like
 * any link; the embed is best-effort. Shell markup is never article content:
 * the only content is the caption. When Instagram shares nothing, the result
 * is a bare "Instagram" page and the item still classifies from its URL. A
 * transiently failed embed marks the read incomplete so the save can retry.
 */
export async function fetchInstagram(url: string): Promise<PageData> {
  const linked = instagramMedia(url);
  const embedFor = (media: { kind: string; shortcode?: string } | undefined) =>
    media?.shortcode
      ? fetchInstagramEmbed(
          `https://www.instagram.com/${media.kind}/${media.shortcode}/embed/captioned/`,
        )
      : Promise.resolve<InstagramEmbed>({ status: "missing" });
  // A direct link names its shortcode, so the embed is read alongside the
  // page. A share link only names it after the page fetch follows the
  // redirect, so its embed waits for the page.
  const [page, directEmbed] = await Promise.all([
    fetchInstagramHtml(url),
    linked?.shortcode ? embedFor(linked) : Promise.resolve(undefined),
  ]);
  if (!page.ok) {
    throw new PageFetchError(page.code, page.status);
  }
  const html = decodeWithContentType(page.bytes, page.contentType);
  const media = linked?.shortcode
    ? linked
    : ([
        page.finalUrl,
        extractMetaContent(html, "og:url"),
        extractCanonical(html),
      ]
        .map((candidate) => instagramMedia(candidate, page.finalUrl))
        .find((candidate) => candidate?.shortcode) ?? linked);
  const embed = directEmbed ?? (await embedFor(media));
  if (embed.status === "transient") {
    logEvent("warn", "instagram_caption_fetch_failed", {
      error_category: embed.errorCategory,
    });
  }
  const embedded = embed.status === "ok" ? parseInstagramEmbed(embed.html) : {};
  const cardTitle =
    extractMetaContent(html, "twitter:title") ??
    extractMetaContent(html, "og:title");
  const handle =
    embedded.username ?? cardTitle?.match(/\(@([A-Za-z0-9._]+)\)/)?.[1];
  const heroImageUrl =
    embedded.posterUrl ??
    extractMetaContent(html, "og:image") ??
    extractMetaContent(html, "twitter:image");
  const caption = embedded.caption?.slice(0, MAX_STORED_CONTENT_CHARS);
  const heroAspectRatio = heroImageUrl
    ? ((await fetchImageAspectRatio(heroImageUrl)) ??
      (media?.kind === "p" ? 1 : 9 / 16))
    : undefined;
  return {
    title:
      Array.from(caption?.split("\n")[0] ?? "")
        .slice(0, 100)
        .join("") || cardTitle,
    // With a caption the card names the creator; without one the card is
    // already the title, so the page's own description is the only new text.
    description: caption
      ? cardTitle
      : extractMetaContent(html, "og:description"),
    siteName: "Instagram",
    author: handle ? `@${handle}` : undefined,
    heroImageUrl,
    heroAspectRatio,
    content: caption,
    ...(page.truncated || (embed.status === "ok" && embed.truncated)
      ? { truncated: true as const }
      : {}),
    ...(embed.status === "transient" ? { incomplete: true as const } : {}),
  };
}

/**
 * Copy a poster into Convex storage. TikTok and Instagram poster URLs are
 * signed and expire, so the card would go blank without this. Best-effort:
 * a blocked or oversized image leaves the (short-lived) URL as the fallback.
 */
export async function storePoster(
  ctx: { storage: { store: (blob: Blob) => Promise<Id<"_storage">> } },
  imageUrl: string,
): Promise<Id<"_storage"> | undefined> {
  const result = await safeFetch(imageUrl, {
    timeoutMs: 10000,
    maxBytes: 3 * 1024 * 1024,
    allowContentType: (ct) =>
      ct.startsWith("image/jpeg") ||
      ct.startsWith("image/png") ||
      ct.startsWith("image/webp"),
    headers: { "User-Agent": BROWSER_USER_AGENT },
  });
  if (!result.ok) {
    return undefined;
  }
  try {
    return await ctx.storage.store(
      new Blob([new Uint8Array(result.bytes)], {
        type: result.contentType.split(";")[0],
      }),
    );
  } catch {
    return undefined;
  }
}

/**
 * Thrown when the page could not be read through the safe-fetch policy: the
 * resource may be blocked by policy, refused, or simply gone. Carries only a
 * stable code (never the URL, addresses, or response body) so callers can log
 * a sanitized category. A failed primary page fetch is a CORE processing
 * problem, unlike a blocked best-effort hero image.
 */
class PageFetchError extends Error {
  constructor(
    public readonly code: SafeFetchError,
    /** HTTP status when `code` is `http_error`. Feeds `pageGone`. */
    public readonly status?: number,
  ) {
    super(`page fetch failed: ${code}`);
    this.name = "PageFetchError";
  }
}

function isPageFetchError(e: unknown): e is PageFetchError {
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

/** True when the page will never be readable: the resource is gone (404/410).
 * Such an item must NOT be classified from its URL alone — the model would
 * invent content from the slug. Exported pure for unit testing. */
export function pageGone(status: number | undefined): boolean {
  return status === 404 || status === 410;
}

/**
 * Pure decision for the enrichment flag a finalized item earns from one
 * pipeline run, taken straight from the page-read outcome: "partial" when the
 * page could not be read at all (retryable — the classifier worked from the
 * URL alone), "no_article" when the page read fine but yielded no extractable
 * article body (the URL itself is the save; a retry cannot change the
 * outcome), undefined when fully enriched. A missing read (images/notes never
 * fetch a page) is fully enriched; "gone" never reaches finalize — a gone
 * page fails the item instead. Exported pure for unit testing.
 */
export function linkEnrichment(
  read: { status: "ok"; page: PageData } | { status: "unreadable" } | undefined,
): "partial" | "no_article" | undefined {
  if (read === undefined) {
    return undefined;
  }
  if (read.status === "unreadable" || read.page.incomplete) {
    return "partial";
  }
  return read.page.content || read.page.media?.length
    ? undefined
    : "no_article";
}

/** Fetch policy for an HTML page read: the saved link itself, or the recipe
 * page a caption links to. */
const PAGE_FETCH_OPTIONS = {
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
 * A caption source (TikTok, X) carries only a caption, and the caption often
 * links to the full recipe write-up. Follow that one link and read its
 * structured recipe markup. Best-effort: a blocked, slow, or markup-less page
 * leaves the post exactly as it was.
 */
async function withLinkedRecipe(page: PageData): Promise<PageData> {
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

async function fetchPage(url: string): Promise<PageData> {
  const result = await safeFetch(url, PAGE_FETCH_OPTIONS);
  if (!result.ok) {
    // Surface only the policy code (+ status for http_error); readPage decides
    // whether the item can still be saved.
    throw new PageFetchError(result.code, result.status);
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
      heroImageUrl = new URL(heroImageUrl, finalUrl).toString();
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

/** The three outcomes that matter when reading a link's page: got it, the page
 * is gone for good (no classification, no retry), or it could not be read this
 * time (classify from the URL alone, retry later). Keeps the branching out of
 * processItem's body; failed outcomes carry the error for sanitized logging. */
export type PageRead =
  | PageReadOk
  | { status: "gone"; error: PageFetchError }
  | { status: "unreadable"; error: PageFetchError };

/** A page that was read. Beyond the page itself it carries what the caller
 * would otherwise have to work out from the URL. */
export type PageReadOk = {
  status: "ok";
  page: PageData;
  /** True when the model may be asked to propose a recipe: the page is a
   * caption source, the caption was read in full and not cut short, and no
   * structured recipe was already accepted from markup. */
  askForRecipe: boolean;
  /** Set when the link is a short-form social post (TikTok, Instagram), whose
   * only text is a caption and whose poster URL expires. */
  shortForm?: ShortFormSource;
};

export type ShortFormSource = NonNullable<ReturnType<typeof shortFormSource>>;

/** The read outcomes that reach finalizeItem: "gone" fails the item before
 * classification, and the fetch error is dropped — nothing downstream of the
 * sanitized log rereads it. */
export type LinkRead = PageReadOk | { status: "unreadable" };

/** True for saves whose readable text is a post caption rather than a page
 * body. Only these let the model propose a recipe: a caption has no schema.org
 * markup to read. Real web pages use their markup instead. */
function isCaptionSource(url: string): boolean {
  return isTikTokUrl(url) || xStatusId(url) !== undefined;
}

/** The page's text when the model receives all of it, which is what makes it a
 * caption rather than a body. A longer read (an X Article, a blog post) is
 * neither text whose one outbound link is the recipe it describes, nor text a
 * model can transcribe a recipe from without inventing the part that was cut. */
function captionText(page: PageData): string | undefined {
  return page.content !== undefined &&
    page.content.length <= PROMPT_CONTENT_CHARS
    ? page.content
    : undefined;
}

/** The model proposes a recipe only from a caption it can read in full, and
 * only when the caption's own link did not already yield the structured
 * recipe. Web pages and URL-only reads never ask: nothing to read exactly. */
function mayAskForRecipe(url: string, page: PageData): boolean {
  return (
    page.recipe === undefined &&
    // A cut caption reads as complete at any length, so the length check alone
    // would let the model transcribe a recipe that stops mid-ingredient.
    page.truncated !== true &&
    isCaptionSource(url) &&
    captionText(page) !== undefined
  );
}

export async function readPage(url: string): Promise<PageRead> {
  try {
    const page = isTikTokUrl(url)
      ? await withLinkedRecipe(await fetchTikTokOEmbed(url))
      : xStatusId(url)
        ? await withLinkedRecipe(await fetchXPost(url))
        : isInstagramUrl(url)
          ? await withLinkedRecipe(await fetchInstagram(url))
          : await fetchPage(url);
    const shortForm = shortFormSource(url);
    return {
      status: "ok",
      page,
      askForRecipe: mayAskForRecipe(url, page),
      ...(shortForm ? { shortForm } : {}),
    };
  } catch (error) {
    if (!isPageFetchError(error)) {
      throw error;
    }
    return pageGone(error.status)
      ? { status: "gone", error }
      : { status: "unreadable", error };
  }
}
