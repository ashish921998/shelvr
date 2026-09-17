"use node";

import { v } from "convex/values";
import { env, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { GenericActionCtx } from "convex/server";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { generateObject, wrapLanguageModel } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import {
  safeFetch,
  decodeWithContentType,
  parseJson,
  isSafeFetchError,
  type SafeFetchError,
} from "./model/safeFetch";
import {
  instagramMedia,
  isInstagramUrl,
  isTikTokUrl,
  isXHost,
  shortFormSource,
  xStatusId,
} from "./model/externalUrl";
import { MAX_SPACE_PROMPT_BYTES } from "./model/imagePolicy";
import {
  INTENT_KINDS,
  type ArticleMedia,
  type PostMedia,
  type Recipe,
} from "./model/itemFields";
import { logEvent } from "./model/log";
import { extractRecipeMarkup, type RecipeDraft } from "./model/recipeMarkup";
import {
  deliverPostHogEvent,
  newDeliveryId,
  scheduleCaptureRetry,
} from "./model/posthogCapture";
import { readStoredImage, StoredImageError } from "./model/storedImage";

// Call Google directly (no Vercel AI Gateway). The default `google` provider
// reads the GOOGLE_GENERATIVE_AI_API_KEY deployment env var.
const MODEL_NAME = "gemini-3.1-flash-lite";
// Token usage lands in the Convex log stream of whichever action made the call,
// so classification and product-search spend can be told apart per invocation.
const MODEL = wrapLanguageModel({
  model: google(MODEL_NAME),
  middleware: {
    wrapGenerate: async ({ doGenerate }) => {
      const result = await doGenerate();
      logEvent("info", "model_usage", {
        model: MODEL_NAME,
        input_tokens: result.usage.inputTokens.total,
        cache_read_tokens: result.usage.inputTokens.cacheRead,
        output_tokens: result.usage.outputTokens.total,
        reasoning_tokens: result.usage.outputTokens.reasoning,
      });
      return result;
    },
  },
});

// Deadlines for every generateObject call. Without one a hung provider holds
// the action until Convex kills it at 10 minutes and the item stays
// `processing` with no failure path. The signal spans retries (the SDK does
// not retry an abort), so each figure is the per-call worst case. Per action
// the budget is one model call plus the safeFetch deadlines around it (15 s
// page + 10 s hero image + 10 s poster), so the longest processItem run ends
// in about 100 s — far under both the action limit and PROCESSING_STALE_MS.
const CLASSIFY_TIMEOUT_MS = 60_000;
// Ranking up to 100 titled items is a longer prompt but a tiny output.
const RECOMMEND_TIMEOUT_MS = 45_000;
// One short query or 0-3 intents: a small output over a small prompt.
const SMALL_TIMEOUT_MS = 30_000;
// One retry on retryable provider errors (429/5xx). The default of 2 would let
// a flaky provider triple the wall-clock spend inside a single deadline.
const MODEL_MAX_RETRIES = 1;

function modelCallOptions(timeoutMs: number): {
  abortSignal: AbortSignal;
  maxRetries: number;
} {
  return {
    abortSignal: AbortSignal.timeout(timeoutMs),
    maxRetries: MODEL_MAX_RETRIES,
  };
}

/** True for the error a timed-out or aborted model call rejects with. The SDK
 * rethrows the raw signal reason (a DOMException named TimeoutError for
 * AbortSignal.timeout, AbortError for a manual abort). Checked by name so the
 * error's message (which can echo the request) is never inspected. */
function isModelTimeout(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "name" in error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

type CategorizationOutcome =
  | "succeeded"
  | "partial"
  | "not_found"
  | "rejected"
  | "failed";

// One classification outcome is one row in the AI health dashboard, so a
// transient PostHog failure retries rather than dropping the row.
const MAX_CATEGORIZATION_ATTEMPTS = 3;

const categorizationTelemetryArgs = {
  outcome: v.union(
    v.literal("succeeded"),
    v.literal("partial"),
    v.literal("not_found"),
    v.literal("rejected"),
    v.literal("failed"),
  ),
  itemType: v.union(v.literal("image"), v.literal("link"), v.literal("note")),
  durationMs: v.number(),
  errorCategory: v.optional(v.string()),
  deliveryId: v.optional(v.string()),
  attempt: v.optional(v.number()),
};

type CategorizationTelemetry = {
  outcome: CategorizationOutcome;
  itemType: "image" | "link" | "note";
  durationMs: number;
  errorCategory?: string;
  deliveryId?: string;
  attempt?: number;
};

/** No item ids, URLs, content, or user identifiers leave Convex. */
async function captureCategorizationTelemetry(
  ctx: GenericActionCtx<DataModel>,
  args: CategorizationTelemetry,
): Promise<void> {
  const deliveryId = args.deliveryId ?? newDeliveryId();
  const delivery = await deliverPostHogEvent({
    event: `ai_categorization_${args.outcome}`,
    distinctId: "shelvr-convex-ai",
    deliveryId,
    properties: {
      $process_person_profile: false,
      service: "convex-ai",
      provider: "google",
      model: MODEL_NAME,
      item_type: args.itemType,
      outcome: args.outcome,
      duration_ms: args.durationMs,
      ...(args.errorCategory !== undefined
        ? { error_category: args.errorCategory }
        : {}),
    },
  });
  if (delivery.status === "delivered" || delivery.status === "unconfigured") {
    return;
  }
  if (delivery.status === "rejected") {
    logEvent("warn", "ai_observability_delivery_failed", {
      status: delivery.httpStatus,
    });
    return;
  }
  const attempt = args.attempt ?? 0;
  const retried = await scheduleCaptureRetry(
    attempt,
    MAX_CATEGORIZATION_ATTEMPTS,
    (delayMs, nextAttempt) =>
      ctx.scheduler.runAfter(
        delayMs,
        internal.ai.retryCategorizationTelemetry,
        { ...args, deliveryId, attempt: nextAttempt },
      ),
  );
  if (!retried) {
    logEvent("warn", "ai_observability_delivery_failed", {
      status: delivery.httpStatus,
    });
  }
}

/** Schedulable target for the retry above; the first attempt still runs inline
 * with the classification that produced it. */
export const retryCategorizationTelemetry = internalAction({
  args: categorizationTelemetryArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    await captureCategorizationTelemetry(ctx, args);
    return null;
  },
});

const SYSTEM_PROMPT =
  "You are the classifier for Shelvr, a save-it-for-later app. Titles must be short and " +
  "punchy — like a label on a folder, not a headline. Aim for 2-4 words, never a full " +
  "sentence, and never end with a period.";

// The closed set of intent kinds the model may emit is INTENT_KINDS from
// model/itemFields — the same tuple the Convex validators derive from, so the
// zod enum below and the DB shape cannot drift. Anything outside it is
// dropped in sanitizeIntents before finalize.

// Appended to every classification prompt. Describes the catalog and the rules
// that keep intents genuinely useful (and, for social posts, honest).
const INTENTS_PROMPT_BLOCK = [
  "Also propose up to 5 useful actions ('intents') the user could take on this item. Only include ones that clearly apply — an empty list is fine, and do not pad. Each intent has a kind, a short label (1-3 words, no trailing punctuation), and a value (the payload). Available kinds:",
  "- open_url: open a link, or deep-link into a native app (a social post, video, profile, product page). value must be a full https:// URL. For a social post in a screenshot, if you can clearly read the @handle, link to that profile (e.g. https://x.com/HANDLE) — NEVER invent a post/status id you cannot actually see. If the saved item already has a URL pointing at a specific post, use that exact URL.",
  "- copy: copy a short, specific string to the clipboard (an address, code, wallet/handle, quoted line). Put the exact text in value.",
  "- web_search: search the web. value is the query.",
  "- open_maps: open a place in maps. value is a place name or address.",
  "- call: call a phone number. value is the phone number.",
  "- message: text a phone number. value is the phone number.",
  "- email: email someone. value is the email address.",
  "- add_event: add a calendar event. value is the event title.",
  "Give each a concrete label like 'Open in X', 'Copy address', 'Call', or 'Add to calendar'.",
].join("\n");

// How much extracted text to feed the classifier. The model only needs enough
// to understand the piece — it doesn't read the whole thing.
const MAX_CONTENT_CHARS = 8000;
// How much of the article body to store & render. Kept well under Convex's
// 1MB document limit; long-form essays run tens of thousands of chars.
const MAX_STORED_CONTENT_CHARS = 100000;
// How much page text the classifier prompt actually carries. Anything longer
// is cut, so the model never sees the tail.
const PROMPT_CONTENT_CHARS = 6000;

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
function readImageSize(buf: Uint8Array): ImageSize | undefined {
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
export function extractBodyText(html: string, url: string): string | undefined {
  try {
    const { document } = parseHTML(html);
    // Remove explicit page chrome before parsing: the readerability preflight
    // rejects short articles, while parse() can retain chrome on sparse pages.
    for (const element of document.querySelectorAll(
      'nav, footer, [role="navigation"], [role="banner"], [role="contentinfo"], .cookie-banner, #cookie-banner, .cookie-consent, #cookie-consent',
    )) {
      element.remove();
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
      if (text.trim() !== "") {
        return text;
      }
    }
  } catch {
    // Malformed pages without a readable body remain bare links.
  }
  return undefined;
}

type PageData = {
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
  | { status: "ok"; html: string }
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
    return { status: "transient", errorCategory: summarizeError(error) };
  }
  if (result.ok) {
    return {
      status: "ok",
      html: decodeWithContentType(result.bytes, result.contentType),
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
  read: LinkRead | undefined,
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

/**
 * Reduce a caught error to a safe log category. Fetch-policy errors expose only
 * their stable code; anything else retains the error's constructor name (e.g.
 * TypeError) for observability without leaking data — never the error's message
 * or cause, which may carry a URL, response body, or resolved address.
 */
function summarizeError(error: unknown): string {
  if (error instanceof StoredImageError) return `stored_image:${error.code}`;
  if (isPageFetchError(error)) {
    return `page_fetch_error:${error.code}`;
  }
  // A model call that hit its AbortSignal.timeout deadline. Its own stable
  // category so provider slowness is visible in telemetry separately from
  // genuine bugs, and so callers can treat it as retryable.
  if (isModelTimeout(error)) {
    return "model_timeout";
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
    const recipe = sanitizeRecipe(
      extractRecipeMarkup(
        decodeWithContentType(result.bytes, result.contentType),
      ),
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
  const recipe = sanitizeRecipe(extractRecipeMarkup(html));

  return {
    title,
    description,
    heroImageUrl,
    heroAspectRatio,
    siteName,
    content,
    ...(recipe ? { recipe } : {}),
  };
}

/** The three outcomes that matter when reading a link's page: got it, the page
 * is gone for good (no classification, no retry), or it could not be read this
 * time (classify from the URL alone, retry later). Keeps the branching out of
 * processItem's body; failed outcomes carry the error for sanitized logging. */
type PageRead =
  | { status: "ok"; page: PageData }
  | { status: "gone"; error: PageFetchError }
  | { status: "unreadable"; error: PageFetchError };

/** The read outcomes that reach finalizeItem: "gone" fails the item before
 * classification, and the fetch error is dropped — nothing downstream of the
 * sanitized log rereads it. */
type LinkRead = { status: "ok"; page: PageData } | { status: "unreadable" };

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

async function readPage(url: string): Promise<PageRead> {
  try {
    const page = isTikTokUrl(url)
      ? await withLinkedRecipe(await fetchTikTokOEmbed(url))
      : xStatusId(url)
        ? await withLinkedRecipe(await fetchXPost(url))
        : isInstagramUrl(url)
          ? await withLinkedRecipe(await fetchInstagram(url))
          : await fetchPage(url);
    return { status: "ok", page };
  } catch (error) {
    if (!isPageFetchError(error)) {
      throw error;
    }
    return pageGone(error.status)
      ? { status: "gone", error }
      : { status: "unreadable", error };
  }
}

// ---------------------------------------------------------------------------
// AI classification
// ---------------------------------------------------------------------------

const intentSchema = z.object({
  kind: z
    .enum(INTENT_KINDS)
    .describe(
      "The action type. open_url: open a link / deep-link into a native app via an https URL. copy: copy exact text. web_search: search a term. open_maps: open a place. call/message: a phone number. email: an email address. add_event: add a calendar event.",
    ),
  label: z
    .string()
    .describe(
      "Short button text, 1-3 words, e.g. 'Open in X', 'Copy address', 'Call'. No trailing punctuation.",
    ),
  value: z
    .string()
    .describe(
      "The payload. open_url: a real https:// URL you can actually see (never a guessed id). copy: the exact text. web_search: the query. open_maps: place/address. call/message: phone number. email: email address. add_event: event title.",
    ),
});

const itemAnalysisSchema = z.object({
  title: z
    .string()
    .describe(
      "A very short title, ideally 2-4 words and never more than ~6. No trailing punctuation, no full sentences.",
    ),
  description: z
    .string()
    .describe("A 1-2 sentence summary of what this item is"),
  tags: z
    .array(z.string())
    .describe("4-8 lowercase tags, each one or two words"),
  spaceNames: z
    .array(z.string())
    .describe(
      "The names of the provided spaces this item clearly belongs to; empty if none match",
    ),
  intents: z
    .array(intentSchema)
    .describe(
      "0-5 pressable actions that would be genuinely useful for this item. Empty if none clearly apply; do not pad.",
    ),
});

const recipeSchema = z
  .object({
    name: z.string().optional().describe("The recipe's own name"),
    servings: z
      .string()
      .optional()
      .describe("Yield exactly as stated, e.g. '4 servings' or '12 cookies'"),
    ingredients: z
      .array(z.string())
      .describe("Every ingredient line, quantities included, in source order"),
    steps: z
      .array(z.string())
      .describe(
        "Every instruction step, numbered or not in the source, in order, each one a complete instruction",
      ),
  })
  .nullable()
  .describe(
    "If this item is a recipe, the complete ingredients and steps exactly as the source states them — the user wants the recipe itself, not the story around it. null for anything that is not a recipe, and never lines the source does not contain.",
  );

/** The classifier output for sources where the model is the only way to get
 * a recipe: captions, screenshots, notes. Web pages classify with the base
 * schema — their recipe comes from schema.org markup, so asking the model
 * again would only cost output tokens and invite a truncated guess. */
const itemAnalysisWithRecipeSchema = itemAnalysisSchema.extend({
  recipe: recipeSchema,
});

type Intent = z.infer<typeof intentSchema>;

const ALLOWED_INTENT_KINDS = new Set<string>(INTENT_KINDS);

/**
 * Clean the model's proposed intents before they're persisted: drop unknown
 * kinds, trim/limit text, require a plausible payload per kind (open_url must
 * be http(s); email needs an @; call/message need a digit), dedupe, and cap the
 * count. A rejected intent is simply omitted — never fails the whole finalize.
 */
function sanitizeIntents(raw: Intent[] | undefined): Intent[] {
  const seen = new Set<string>();
  return (raw ?? [])
    .filter((i) => ALLOWED_INTENT_KINDS.has(i.kind))
    .map((i) => ({
      kind: i.kind,
      label: i.label.trim().slice(0, 40),
      value: i.value.trim(),
    }))
    .filter((i) => i.label !== "" && i.value !== "")
    .filter((i) => {
      switch (i.kind) {
        case "open_url":
          return /^https?:\/\//i.test(i.value);
        case "email":
          return i.value.includes("@");
        case "call":
        case "message":
          return /\d/.test(i.value);
        default:
          return true;
      }
    })
    .filter((i) => {
      const key = `${i.kind}|${i.value.toLowerCase()}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 5);
}

// Bounds for a proposed recipe. Both reject the whole recipe rather than
// shorten it, so they sit well above what a real recipe reaches: an elaborate
// multi-component bake runs to a few thousand characters, not twenty thousand.
const MAX_RECIPE_LINES = 120;
const MAX_RECIPE_CHARS = 20000;
const MAX_RECIPE_NAME_CHARS = 120;
const MAX_RECIPE_SERVINGS_CHARS = 60;

/** Clean a proposed recipe (page markup or model) before it's persisted: trim
 * every line, drop the empty ones, and reject the whole recipe when a list
 * comes back empty (the markup is incomplete or the model is guessing) or when
 * it is too long to store.
 *
 * Nothing here shortens a recipe. The card replaces the article body, so a cut
 * instruction is a wrong recipe the reader cannot tell from a right one and
 * cannot read around; a recipe over budget is refused instead, which leaves the
 * article in place. Repeated lines are kept for the same reason: a recipe in
 * components lists the same quantity under each one, and a dough really does
 * rest twice. A rejected recipe is simply omitted — never fails the whole
 * finalize. */
export function sanitizeRecipe(
  raw: RecipeDraft | null | undefined,
): Recipe | undefined {
  if (!raw) {
    return undefined;
  }
  const clean = (lines: string[] | undefined): string[] =>
    (lines ?? []).map((line) => line.trim()).filter((line) => line !== "");
  const ingredients = clean(raw.ingredients);
  const steps = clean(raw.steps);
  if (ingredients.length === 0 || steps.length === 0) {
    return undefined;
  }
  if (
    ingredients.length > MAX_RECIPE_LINES ||
    steps.length > MAX_RECIPE_LINES
  ) {
    return undefined;
  }
  // Blank name/servings are left out entirely (not set to undefined) so the
  // persisted document never carries an explicit undefined key. Both label the
  // recipe rather than state it, so capping their length loses no instruction.
  const name = raw.name?.trim().slice(0, MAX_RECIPE_NAME_CHARS);
  const servings = raw.servings?.trim().slice(0, MAX_RECIPE_SERVINGS_CHARS);
  const recipe = {
    ...(name ? { name } : {}),
    ...(servings ? { servings } : {}),
    ingredients,
    steps,
  };
  return recipeChars(recipe) > MAX_RECIPE_CHARS ? undefined : recipe;
}

function recipeChars(recipe: Recipe): number {
  return [
    recipe.name ?? "",
    recipe.servings ?? "",
    ...recipe.ingredients,
    ...recipe.steps,
  ].reduce((total, line) => total + line.length, 0);
}

function spacesPromptBlock(
  spaces: { name: string; description?: string }[],
): string {
  if (spaces.length === 0) {
    return "The user has no spaces yet, so spaceNames must be an empty array.";
  }
  // Count JSON-escaped UTF-8 bytes, not characters; preserve exact space names.
  let remaining = MAX_SPACE_PROMPT_BYTES;
  const candidates: string[] = [];
  for (const space of spaces) {
    const description = Array.from(space.description ?? "")
      .slice(0, 512)
      .join("");
    const line = `- "${space.name}"${description ? `: ${description}` : ""}`;
    const size = Buffer.byteLength(JSON.stringify(line + "\n"), "utf8");
    if (size > remaining) continue;
    remaining -= size;
    candidates.push(line);
  }
  const lines = candidates.join("\n");
  return `The user organizes items into spaces. Candidate spaces:\n${lines}\n\nIn spaceNames, include only the exact names of spaces this item CLEARLY belongs to. Only include confident matches. If none clearly match, return an empty array.`;
}

/** The model's classification for one item, plus the link-read artifacts the
 * finalize step needs (always undefined for images and notes, which are fully
 * enriched by definition). */
type Classification = {
  result: z.infer<typeof itemAnalysisSchema> & {
    /** Present only when the source was classified with the recipe schema. */
    recipe?: z.infer<typeof recipeSchema>;
  };
  page?: PageData;
  linkRead?: LinkRead;
};

/** Either a classification, or `terminal` when the item was already failed
 * here (a gone URL) and the pipeline must stop. */
type AnalysisOutcome = Classification | { terminal: true };

/** How the prompt introduces a page's content: a short-form social link only
 * carries its caption. */
function captionIntro(url: string | undefined): string {
  const source = shortFormSource(url);
  if (source === undefined) {
    return "Page content:";
  }
  return source.video
    ? "This is a short video. Only its caption is available:"
    : `This is a ${source.site} post. Only its caption is available:`;
}

/** Build the link prompt. Sections the page read couldn't produce are
 * dropped; an unreadable read swaps the page body for a URL-only instruction
 * so the model invents nothing the URL doesn't show. */
function linkAnalysisPrompt(
  item: Doc<"items">,
  page: PageData | undefined,
  linkRead: LinkRead | undefined,
  spacesBlock: string,
  askForRecipe: boolean,
): string {
  return [
    "You are helping organize a save-it-for-later app. Analyze this saved web page and produce a title, a 1-2 sentence description, 4-8 lowercase tags (one or two words each), and matching space names.",
    askForRecipe
      ? "If the caption shares a recipe, also fill the recipe field with its complete ingredients and steps exactly as the caption states them (null otherwise). Never add lines the caption does not contain — a caption that only names a dish is not a recipe."
      : "",
    spacesBlock,
    `URL: ${item.url}`,
    page?.title ? `Page title: ${page.title}` : "",
    page?.siteName ? `Site: ${page.siteName}` : "",
    page?.author ? `Creator: ${page.author}` : "",
    page?.description ? `Meta description: ${page.description}` : "",
    page?.content
      ? `${captionIntro(item.url)}\n${page.content.slice(0, PROMPT_CONTENT_CHARS)}`
      : "No page content could be extracted.",
    linkRead?.status === "unreadable"
      ? "The page could not be read, so you have ONLY the URL. Base the title, description, and tags strictly on what the URL itself reveals (site, section, slug). Do NOT invent specifics — no facts, quotes, prices, names, or claims that are not literally present in the URL. Prefer a plain descriptive title over a confident-sounding one."
      : "",
    INTENTS_PROMPT_BLOCK,
  ]
    .filter((line) => line !== "")
    .join("\n\n");
}

/**
 * Links read the page first. A gone URL (404/410) is terminal: the item is
 * failed here and `terminal` tells the caller to stop. An unreadable read is
 * not terminal — the item still classifies from the URL alone.
 */
async function analyzeLinkItem(
  ctx: ActionCtx,
  args: { itemId: Id<"items">; runId?: string },
  item: Doc<"items">,
  spacesBlock: string,
  startedAt: number,
): Promise<AnalysisOutcome> {
  if (!item.url) {
    throw new Error("Link item has no url");
  }
  const read = await readPage(item.url);
  if (read.status === "gone") {
    // Nothing to read and nothing to retry: a 404/410 is terminal.
    logEvent("error", "process_item_gone", {
      item_id: args.itemId,
      error_category: summarizeError(read.error),
    });
    await failItemAndRecordOutcome(
      ctx,
      args,
      { itemType: item.type, startedAt },
      { reason: "not_found", telemetry: "not_found" },
    );
    return { terminal: true };
  }
  if (read.status === "unreadable") {
    // Refused (403/429), server error, timeout, or oversized: the link is
    // probably still good, so save a usable item classified from the URL
    // and let the user retry the fetch later.
    logEvent("warn", "process_item_unreadable", {
      item_id: args.itemId,
      error_category: summarizeError(read.error),
    });
  }
  const page = read.status === "unreadable" ? undefined : read.page;
  // The model proposes a recipe only from a caption it can read in full, and
  // only when the caption's own link did not already yield the structured
  // recipe. Web pages and URL-only reads never ask: nothing to read exactly.
  const askForRecipe =
    page !== undefined &&
    page.recipe === undefined &&
    // A cut caption reads as complete at any length, so the length check alone
    // would let the model transcribe a recipe that stops mid-ingredient.
    page.truncated !== true &&
    isCaptionSource(item.url) &&
    captionText(page) !== undefined;
  const call = {
    model: MODEL,
    ...modelCallOptions(CLASSIFY_TIMEOUT_MS),
    system: SYSTEM_PROMPT,
    prompt: linkAnalysisPrompt(item, page, read, spacesBlock, askForRecipe),
  };
  const result = askForRecipe
    ? (await generateObject({ ...call, schema: itemAnalysisWithRecipeSchema }))
        .object
    : (await generateObject({ ...call, schema: itemAnalysisSchema })).object;
  return { result, page, linkRead: read };
}

async function analyzeImageItem(
  ctx: ActionCtx,
  item: Doc<"items">,
  spacesBlock: string,
): Promise<Classification> {
  if (!item.storageId) {
    throw new StoredImageError("not_found");
  }
  const image = await readStoredImage(ctx.storage, item.storageId);
  const { object } = await generateObject({
    model: MODEL,
    ...modelCallOptions(CLASSIFY_TIMEOUT_MS),
    system: SYSTEM_PROMPT,
    schema: itemAnalysisWithRecipeSchema,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "You are helping organize a save-it-for-later app. Analyze this saved image and produce a short evocative title, a 1-2 sentence description of what it shows, 4-8 lowercase tags (one or two words each), and matching space names.",
              "If the image is a recipe (a screenshot or photo of a written recipe), also fill the recipe field with every ingredient and step exactly as written in the image (null otherwise). A photo of a dish with no written recipe is not a recipe.",
              spacesBlock,
              INTENTS_PROMPT_BLOCK,
            ].join("\n\n"),
          },
          {
            type: "file",
            data: image.bytes,
            mediaType: image.mediaType ?? "image",
          },
        ],
      },
    ],
  });
  return { result: object };
}

async function analyzeNoteItem(
  item: Doc<"items">,
  spacesBlock: string,
): Promise<Classification> {
  if (!item.note) {
    throw new Error("Note item has no text");
  }
  const { object } = await generateObject({
    model: MODEL,
    ...modelCallOptions(CLASSIFY_TIMEOUT_MS),
    system: SYSTEM_PROMPT,
    // Notes never carry a recipe field: the note text itself is what the user
    // wrote (and edits), so a lifted copy would only duplicate it.
    schema: itemAnalysisSchema,
    prompt: [
      "You are helping organize a save-it-for-later app. Analyze this saved note and produce a short evocative title, a 1-2 sentence description, 4-8 lowercase tags (one or two words each), and matching space names.",
      spacesBlock,
      ...(item.titleSource === "user" && item.title
        ? [`The user titled this note: ${item.title}`]
        : []),
      `Note:\n${item.note.slice(0, MAX_CONTENT_CHARS)}`,
      INTENTS_PROMPT_BLOCK,
    ].join("\n\n"),
  });
  return { result: object };
}

/** The recipe to persist: structured markup (the page's own, or the page a
 * caption links to) wins; the model's proposal only exists for sources that
 * were classified with the recipe schema (captions, images). Exported pure
 * for unit testing. */
export function finalRecipe(
  page: { recipe?: Recipe } | undefined,
  result: { recipe?: RecipeDraft | null },
): Recipe | undefined {
  return page?.recipe ?? sanitizeRecipe(result.recipe);
}

/** Map the model's returned space names back to ids (case-insensitive,
 * trimmed). Unknown names are dropped — the classifier only ever suggests
 * spaces it was shown. */
function spaceNameIds(
  spaceNames: string[],
  spaces: { _id: Id<"spaces">; name: string }[],
): Id<"spaces">[] {
  const idByName = new Map(
    spaces.map((s) => [s.name.trim().toLowerCase(), s._id]),
  );
  const ids: Id<"spaces">[] = [];
  for (const name of spaceNames) {
    const id = idByName.get(name.trim().toLowerCase());
    if (id !== undefined) {
      ids.push(id);
    }
  }
  return ids;
}

type ActionCtx = GenericActionCtx<DataModel>;

/**
 * Fail the item and count the outcome exactly once: failItem is run-fenced,
 * so telemetry is recorded only when this run's write was the applied one and
 * the item type is known. Shared by the terminal 404 path and
 * handleProcessingFailure so the fail-and-record sequence cannot drift apart.
 */
async function failItemAndRecordOutcome(
  ctx: ActionCtx,
  args: { itemId: Id<"items">; runId?: string },
  run: { itemType?: "image" | "link" | "note"; startedAt: number },
  outcome: {
    reason: "image_too_large" | "not_found" | "error";
    telemetry: CategorizationOutcome;
    errorCategory?: string;
  },
): Promise<void> {
  const failed = await ctx.runMutation(internal.items.failItem, {
    itemId: args.itemId,
    runId: args.runId,
    reason: outcome.reason,
  });
  // Same fence as finalize: a superseded run's outcome is nobody's.
  if (run.itemType !== undefined && failed === "applied") {
    await captureCategorizationTelemetry(ctx, {
      outcome: outcome.telemetry,
      itemType: run.itemType,
      durationMs: Date.now() - run.startedAt,
      ...(outcome.errorCategory !== undefined
        ? { errorCategory: outcome.errorCategory }
        : {}),
    });
  }
}

/**
 * Fail the item and record the outcome. A stored-image policy failure maps
 * to its own reason; a timed-out model call is an expected operational
 * condition, so it warns (not errors) and fails with the retryable `error`
 * reason. Returns the sanitized error category for the caller to rethrow, or
 * null when the failure is fully handled — rethrowing would page on provider
 * slowness.
 */
async function handleProcessingFailure(
  ctx: ActionCtx,
  args: { itemId: Id<"items">; runId?: string },
  error: unknown,
  run: {
    itemType?: "image" | "link" | "note";
    posterStorageId?: Id<"_storage">;
    startedAt: number;
  },
): Promise<string | null> {
  // Sanitized error log. For fetch-policy failures (PageFetchError,
  // SafeFetchError) log only the stable policy code + item id — never the
  // error object, its cause, URLs, headers, response bodies, or resolved
  // addresses. For other errors log a generic category so a thrown Error's
  // message (which may include a URL) is not leaked either.
  const errorCategory = summarizeError(error);
  if (error instanceof StoredImageError) {
    const tooLarge = error.code === "too_large";
    await failItemAndRecordOutcome(ctx, args, run, {
      reason: tooLarge ? "image_too_large" : "not_found",
      telemetry: tooLarge ? "rejected" : "not_found",
      errorCategory,
    });
    return null;
  }
  const timedOut = isModelTimeout(error);
  logEvent(
    timedOut ? "warn" : "error",
    timedOut ? "process_item_timed_out" : "process_item_failed",
    { item_id: args.itemId, error_category: errorCategory },
  );
  if (run.posterStorageId !== undefined) {
    await ctx.runMutation(internal.items.deleteStorageIfUnreferenced, {
      storageId: run.posterStorageId,
    });
  }
  // failItem is run-fenced: if a retry already superseded this run the write
  // is skipped, which is exactly right — the newer run owns the item's status
  // now, and its outcome is the one worth counting.
  await failItemAndRecordOutcome(ctx, args, run, {
    reason: "error",
    telemetry: "failed",
    errorCategory,
  });
  return timedOut ? null : errorCategory;
}

/** Whether this run may go on. An edited note's quiet refresh (see
 * updateNoteItem) must still own the item and win the refresh bucket; every
 * other run always may. */
async function refreshClaimed(
  ctx: ActionCtx,
  args: { itemId: Id<"items">; runId?: string; refresh?: boolean },
): Promise<boolean> {
  if (args.refresh !== true) {
    return true;
  }
  if (args.runId === undefined) {
    return false;
  }
  return await ctx.runMutation(internal.items.claimNoteRefresh, {
    itemId: args.itemId,
    runId: args.runId,
  });
}

export const processItem = internalAction({
  args: {
    itemId: v.id("items"),
    // The run id the scheduling mutation stamped on the item. Passed through
    // to finalizeItem/failItem, which write only while it still matches, so
    // this run cannot overwrite a newer one. Optional only so jobs scheduled
    // before run fencing shipped still validate.
    runId: v.optional(v.string()),
    // Set by updateNoteItem to quietly re-classify an edited note. The run
    // must still own the item and win the refresh bucket, and a failure leaves
    // the ready note untouched.
    refresh: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    let itemType: "image" | "link" | "note" | undefined;
    let posterStorageId: Id<"_storage"> | undefined;
    try {
      const item = await ctx.runQuery(internal.items.getItemInternal, {
        itemId: args.itemId,
      });
      if (item === null || item.processingRunId !== args.runId) {
        return null;
      }
      itemType = item.type;
      if (!(await refreshClaimed(ctx, args))) {
        return null;
      }
      // Only dynamic spaces are visible to the classifier: matches become
      // pending suggestions. Non-dynamic spaces never hear from the pipeline.
      const allSpaces = await ctx.runQuery(internal.spaces.listSpacesInternal, {
        userId: item.userId,
      });
      const spaces = allSpaces.filter((s) => s.dynamic === true);
      const spacesBlock = spacesPromptBlock(spaces);

      let outcome: AnalysisOutcome;
      if (item.type === "link") {
        outcome = await analyzeLinkItem(
          ctx,
          args,
          item,
          spacesBlock,
          startedAt,
        );
      } else if (item.type === "image") {
        outcome = await analyzeImageItem(ctx, item, spacesBlock);
      } else {
        outcome = await analyzeNoteItem(item, spacesBlock);
      }
      if ("terminal" in outcome) {
        return null;
      }
      // The link's page-read outcome, if any: it decides the enrichment flag
      // at finalize, the "URL alone" prompt nudge, and the telemetry outcome.
      // Only links fetch a page, so images/notes leave this undefined and
      // stay fully enriched.
      const { result, page, linkRead } = outcome;

      // Map returned space names back to ids (case-insensitive, trimmed).
      const spaceIds = spaceNameIds(result.spaceNames, spaces);

      posterStorageId =
        item.type === "link" &&
        shortFormSource(item.url) !== undefined &&
        page?.heroImageUrl
          ? await storePoster(ctx, page.heroImageUrl)
          : undefined;

      const finalized = await ctx.runMutation(internal.items.finalizeItem, {
        itemId: args.itemId,
        runId: args.runId,
        title: result.title,
        keepTitle: args.refresh === true,
        description: result.description,
        tags: result.tags.map((t) => t.trim().toLowerCase()).filter(Boolean),
        content: page?.content,
        siteName: page?.siteName,
        author: page?.author,
        heroImageUrl: page?.heroImageUrl,
        media: page?.media,
        articleMedia: page?.articleMedia,
        storageId: posterStorageId,
        // Links: the OG image's shape. Images/notes: preserve the ratio the
        // client captured on upload (patching undefined would drop the field).
        aspectRatio:
          item.type === "link" ? page?.heroAspectRatio : item.aspectRatio,
        intents: sanitizeIntents(result.intents),
        recipe: finalRecipe(page, result),
        enrichment: linkEnrichment(linkRead),
        status: "ready",
      });
      if (finalized !== "applied") {
        // The item was deleted, or a newer run owns it (the user retried while
        // this run was awaiting the model). Either way this run's output is
        // discarded: release the poster it stored and stop without touching
        // memberships or telemetry for a result nobody will see. Not an
        // error — the fence working is the expected outcome of that race.
        if (posterStorageId !== undefined) {
          await ctx.runMutation(internal.items.deleteStorageIfUnreferenced, {
            storageId: posterStorageId,
          });
        }
        return null;
      }
      await ctx.runMutation(internal.items.setSpacesForItem, {
        itemId: args.itemId,
        spaceIds,
        runId: args.runId,
      });

      if (args.refresh === true) {
        // An edited note: search and suggestions are updated. Steering and
        // categorization telemetry already ran when the note was saved.
        return null;
      }
      // If the user filed this item straight into spaces while it was still
      // processing, run the purpose-steering pass now that it's classified.
      const savedSpaceIds = await ctx.runQuery(
        internal.spaces.listSavedSpaceIdsForItemInternal,
        {
          itemId: args.itemId,
        },
      );
      for (const spaceId of savedSpaceIds) {
        await ctx.scheduler.runAfter(0, internal.ai.steerItemForSpace, {
          itemId: args.itemId,
          spaceId,
        });
      }
      await captureCategorizationTelemetry(ctx, {
        outcome:
          linkEnrichment(linkRead) === "partial" ? "partial" : "succeeded",
        itemType: item.type,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      if (args.refresh === true) {
        // The note is already ready; keep it rather than fail it.
        logEvent("warn", "note_refresh_failed", {
          item_id: args.itemId,
          error_category: summarizeError(error),
        });
        return null;
      }
      const rethrowCategory = await handleProcessingFailure(ctx, args, error, {
        itemType,
        posterStorageId,
        startedAt,
      });
      if (rethrowCategory !== null) {
        // Rethrow so Convex error tracking sees the failure.
        throw new Error(`ai_categorization_failed:${rethrowCategory}`);
      }
    }
    return null;
  },
});

/**
 * One-off: fill in aspectRatio for existing image items that don't have one
 * (older saves whose ratio was dropped before it was persisted). Reads the
 * stored file's header bytes directly — no re-upload needed.
 */
export const backfillImageAspectRatios = internalAction({
  args: {},
  returns: v.object({ scanned: v.number(), updated: v.number() }),
  handler: async (ctx): Promise<{ scanned: number; updated: number }> => {
    const targets = await ctx.runQuery(
      internal.items.listImagesNeedingRatioInternal,
      {},
    );
    let updated = 0;
    for (const target of targets) {
      const blob = await ctx.storage.get(target.storageId);
      if (blob === null) {
        continue;
      }
      const size = readImageSize(new Uint8Array(await blob.arrayBuffer()));
      if (size && size.width > 0 && size.height > 0) {
        await ctx.runMutation(internal.items.setAspectRatioInternal, {
          itemId: target._id,
          aspectRatio: size.width / size.height,
        });
        updated++;
      }
    }
    return { scanned: targets.length, updated };
  },
});

const recommendSchema = z.object({
  itemNumbers: z
    .array(z.number().int())
    .describe(
      "The numbers of the items that clearly belong in this space; empty if none",
    ),
});

// A recommendation pass surfaces "a couple of good picks", not an exhaustive
// sweep — the user can always add more by hand or ask again later.
const MAX_RECOMMENDATIONS = 8;

/**
 * Recommend existing items for a space, off nothing but its title. Runs when
 * a space is created, and again whenever its dynamic toggle turns on. Writes
 * `suggested` rows only — the user decides what actually enters the space —
 * and never re-suggests anything they already filed or dismissed.
 */
export const recommendForSpace = internalAction({
  args: { spaceId: v.id("spaces") },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const space = await ctx.runQuery(internal.spaces.getSpaceInternal, {
        spaceId: args.spaceId,
      });
      if (space === null) {
        return null;
      }
      const memberIds = new Set(
        await ctx.runQuery(internal.spaces.listMemberItemIdsInternal, {
          spaceId: args.spaceId,
        }),
      );
      const items = (
        await ctx.runQuery(internal.items.listReadyItemsInternal, {
          userId: space.userId,
          limit: 100,
        })
      ).filter((item) => !memberIds.has(item._id));
      if (items.length === 0) {
        return null;
      }

      const itemLines = items
        .map((item, i) => {
          const parts = [
            item.title ?? "(untitled)",
            item.description ?? "",
            item.tags.length > 0 ? `tags: ${item.tags.join(", ")}` : "",
          ].filter((p) => p !== "");
          return `${i + 1}. ${parts.join(" — ")}`;
        })
        .join("\n");

      const { object } = await generateObject({
        model: MODEL,
        ...modelCallOptions(RECOMMEND_TIMEOUT_MS),
        schema: recommendSchema,
        prompt: [
          "You are helping organize a save-it-for-later app. The user just created a space (a themed collection) and Shelvr recommends a few existing saves for it — the user decides which to keep.",
          `Space name: "${space.name}"${space.description ? `\nSpace description: ${space.description}` : ""}`,
          "Below is a numbered list of the user's saved items. Return the numbers of a handful of items that CLEARLY belong in this space — quality over quantity, high-confidence picks only, at most 8. If nothing clearly fits, return an empty array.",
          itemLines,
        ].join("\n\n"),
      });

      const itemIds: Id<"items">[] = [];
      for (const n of object.itemNumbers) {
        if (Number.isInteger(n) && n >= 1 && n <= items.length) {
          itemIds.push(items[n - 1]._id);
        }
        if (itemIds.length >= MAX_RECOMMENDATIONS) {
          break;
        }
      }
      if (itemIds.length > 0) {
        await ctx.runMutation(internal.items.suggestItemsForSpace, {
          spaceId: args.spaceId,
          itemIds,
        });
      }
    } catch (error) {
      // Sanitized: log a category, not the raw error object.
      logEvent("error", "recommend_for_space_failed", {
        space_id: args.spaceId,
        error_category: summarizeError(error),
      });
    }
    return null;
  },
});

const productQuerySchema = z.object({
  query: z
    .string()
    // Bound the model-provided query so the SerpAPI request URL (fixed prefix +
    // percent-encoded query + API key) stays well under safeFetch's 2047-char
    // URL cap. A real product query is a few words; this only guards a runaway
    // model output.
    .max(500)
    .describe(
      "A concise shopping search query for the primary product: brand (if identifiable) + product type + distinguishing attributes, e.g. 'west elm leather sofa cognac'. Empty string if there is no identifiable product.",
    ),
});

type Product = {
  title: string;
  url: string;
  price?: string;
  merchant?: string;
  thumbnailUrl?: string;
};

const MAX_PRODUCTS = 5;

/** Pull the fields we render out of SerpAPI's google_shopping response. */
function parseShoppingResults(payload: unknown): Product[] {
  const results = (payload as { shopping_results?: unknown[] })
    ?.shopping_results;
  if (!Array.isArray(results)) {
    return [];
  }
  const products: Product[] = [];
  for (const raw of results) {
    const entry = raw as {
      title?: unknown;
      product_link?: unknown;
      link?: unknown;
      price?: unknown;
      source?: unknown;
      thumbnail?: unknown;
    };
    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    const url =
      typeof entry.product_link === "string"
        ? entry.product_link
        : typeof entry.link === "string"
          ? entry.link
          : "";
    if (title === "" || !/^https?:\/\//i.test(url)) {
      continue;
    }
    products.push({
      title: title.slice(0, 120),
      url,
      price: typeof entry.price === "string" ? entry.price : undefined,
      merchant: typeof entry.source === "string" ? entry.source : undefined,
      thumbnailUrl:
        typeof entry.thumbnail === "string" ? entry.thumbnail : undefined,
    });
    if (products.length >= MAX_PRODUCTS) {
      break;
    }
  }
  return products;
}

/**
 * Phase-3 "Find links": user-pressed the button on an item, so identify the
 * product (vision for images, text otherwise), run one SerpAPI Google
 * Shopping search, and store the top real results (price, merchant,
 * thumbnail) on the item.
 */
export const findProductLinks = internalAction({
  args: { itemId: v.id("items") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const fail = () =>
      ctx.runMutation(internal.items.setProductsInternal, {
        itemId: args.itemId,
        productsStatus: "failed",
      });
    try {
      const item = await ctx.runQuery(internal.items.getItemInternal, {
        itemId: args.itemId,
      });
      if (item === null) {
        return null;
      }
      const apiKey = env.SERPAPI_KEY;
      if (!apiKey) {
        logEvent("error", "find_product_links_unconfigured", {
          item_id: args.itemId,
          missing_env: "SERPAPI_KEY",
        });
        await fail();
        return null;
      }

      // Build the product query. Images go through the vision model; links
      // and notes already have classified text that describes the thing.
      let query: string;
      if (item.type === "image") {
        if (!item.storageId) {
          throw new StoredImageError("not_found");
        }
        const image = await readStoredImage(ctx.storage, item.storageId);
        const { object } = await generateObject({
          model: MODEL,
          ...modelCallOptions(SMALL_TIMEOUT_MS),
          schema: productQuerySchema,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Identify the primary product shown in this image and produce a shopping search query for it. If nothing in the image is a purchasable product, return an empty query.",
                },
                {
                  type: "file",
                  data: image.bytes,
                  mediaType: image.mediaType ?? "image",
                },
              ],
            },
          ],
        });
        query = object.query.trim();
      } else {
        const { object } = await generateObject({
          model: MODEL,
          ...modelCallOptions(SMALL_TIMEOUT_MS),
          schema: productQuerySchema,
          prompt: [
            "Identify the primary purchasable product described by this saved item and produce a shopping search query for it. If it does not describe a product, return an empty query.",
            `Title: ${item.title ?? "(untitled)"}`,
            item.description ? `Description: ${item.description}` : "",
            item.tags.length > 0 ? `Tags: ${item.tags.join(", ")}` : "",
            item.url ? `URL: ${item.url}` : "",
            item.note ? `Note: ${item.note.slice(0, 2000)}` : "",
          ]
            .filter((line) => line !== "")
            .join("\n"),
        });
        query = object.query.trim();
      }

      if (query === "") {
        // Not a product — an empty, successful result (the UI says so).
        await ctx.runMutation(internal.items.setProductsInternal, {
          itemId: args.itemId,
          products: [],
          productsStatus: "ready",
        });
        return null;
      }

      // Build the fixed SerpAPI request URL. The destination is not
      // user-controlled, but the response is still bounded: JSON content type
      // required, 1 MiB stream cap before parse, 20s deadline, and the same
      // public-address/redirect policy. The API key lives in the query string,
      // so the safe fetcher must never log the URL (it logs only codes), and we
      // redact explicitly below.
      const serpApiUrl = `https://serpapi.com/search.json?engine=google_shopping&gl=us&hl=en&q=${encodeURIComponent(query)}&api_key=${apiKey}`;
      const result = await safeFetch(serpApiUrl, {
        timeoutMs: 20000,
        maxBytes: 1024 * 1024,
        allowContentType: (ct) =>
          ct === "application/json" || ct.startsWith("application/json;"),
      });
      if (!result.ok) {
        // Log only the policy code — never the URL (it carries the API key),
        // never a response body or resolved address.
        logEvent("error", "find_product_links_blocked", {
          item_id: args.itemId,
          fetch_code: result.code,
        });
        await fail();
        return null;
      }
      const products = parseShoppingResults(parseJson(result.bytes));

      await ctx.runMutation(internal.items.setProductsInternal, {
        itemId: args.itemId,
        products,
        productsStatus: "ready",
      });
    } catch (error) {
      if (error instanceof StoredImageError) {
        await ctx.runMutation(internal.items.setProductsInternal, {
          itemId: args.itemId,
          productsStatus: "unavailable",
        });
        return null;
      }
      // Sanitized error log: never the raw error object (which may carry the
      // request URL with the API key, or a response body). summarizeError
      // reduces fetch-policy errors to a code and everything else to a category.
      logEvent("error", "find_product_links_failed", {
        item_id: args.itemId,
        error_category: summarizeError(error),
      });
      await fail();
    }
    return null;
  },
});

const steerSchema = z.object({
  intents: z
    .array(intentSchema)
    .describe(
      "0-3 actions that serve the space's purpose for this item. Empty if none genuinely apply; do not pad.",
    ),
});

/**
 * Phase-2 purpose steering: when an item lands in a space (direct add or an
 * accepted suggestion), the space's title steers a light enrich pass. The
 * result is written to that membership row, so the same couch can carry a
 * shopping link in "apartment shopping list" and nothing extra elsewhere.
 */
export const steerItemForSpace = internalAction({
  args: { itemId: v.id("items"), spaceId: v.id("spaces") },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const [item, space] = await Promise.all([
        ctx.runQuery(internal.items.getItemInternal, { itemId: args.itemId }),
        ctx.runQuery(internal.spaces.getSpaceInternal, {
          spaceId: args.spaceId,
        }),
      ]);
      if (item === null || space === null || item.status !== "ready") {
        return null;
      }

      const { object } = await generateObject({
        model: MODEL,
        ...modelCallOptions(SMALL_TIMEOUT_MS),
        schema: steerSchema,
        prompt: [
          `You are helping a save-it-for-later app. The user filed a saved item into their space "${space.name}" — treat that title as a statement of purpose and propose up to 3 actions ('intents') that serve it for this specific item.`,
          [
            `Item title: ${item.title ?? "(untitled)"}`,
            item.description ? `Description: ${item.description}` : "",
            item.tags.length > 0 ? `Tags: ${item.tags.join(", ")}` : "",
            item.url ? `URL: ${item.url}` : "",
          ]
            .filter((line) => line !== "")
            .join("\n"),
          INTENTS_PROMPT_BLOCK,
          "Steering by space purpose:",
          "- Shopping/wishlist space: identify the product and include an open_url intent to a Google Shopping search, https://www.google.com/search?tbm=shop&q=PRODUCT+QUERY, labeled like 'Shop this'.",
          "- Travel space: prefer open_maps for places and open_url for official/booking pages you can actually see.",
          "- Recipes/cooking space: a web_search for the dish or an open_url to the recipe.",
          "Only propose intents that genuinely serve this space's purpose — the item's general actions already exist elsewhere. An empty list is fine.",
        ].join("\n\n"),
      });

      const intents = sanitizeIntents(object.intents).slice(0, 3);
      if (intents.length > 0) {
        await ctx.runMutation(internal.spaces.setMembershipIntentsInternal, {
          itemId: args.itemId,
          spaceId: args.spaceId,
          intents,
        });
      }
    } catch (error) {
      // Sanitized: log a category, not the raw error object.
      logEvent("error", "steer_item_for_space_failed", {
        item_id: args.itemId,
        space_id: args.spaceId,
        error_category: summarizeError(error),
      });
    }
    return null;
  },
});
