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
  isPinterestHost,
  isPinterestShortUrl,
  isXHost,
  linkSource,
  pinterestPinId,
  shortFormSource,
  xStatusId,
  normalizeExternalUrl,
  type LinkSource,
} from "./externalUrl";
import type { ArticleMedia, PostMedia, Recipe } from "./itemFields";
import { logEvent } from "./log";
import { extractRecipeMarkup, sanitizeRecipe } from "./recipeMarkup";
import { readImageSize } from "./imageSize";

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
      if (!LINK_HUB_HOSTS.has(host) && !isPinterestHost(host)) {
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
type InstagramEmbedFields = {
  caption?: string;
  username?: string;
  posterUrl?: string;
  /** The embed shows Instagram's "this post may have been removed" box. */
  brokenMedia?: true;
};

export function parseInstagramEmbed(html: string): InstagramEmbedFields {
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
    ...(/class="[^"]*\bEmbedBrokenMedia\b/.test(html)
      ? { brokenMedia: true as const }
      : {}),
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

type InstagramCard = {
  title?: string;
  image?: string;
  description?: string;
  /** The card calls the post a video or reel, whatever the URL says. */
  video?: true;
};

/** The link-preview card Instagram serves the crawler, or undefined for the
 * login shell, which titles itself just "Instagram" and names no post. */
function instagramCard(html: string): InstagramCard | undefined {
  const title = [
    extractMetaContent(html, "twitter:title"),
    extractMetaContent(html, "og:title"),
  ].find((candidate) => candidate !== undefined && candidate !== "Instagram");
  const image =
    extractMetaContent(html, "og:image") ??
    extractMetaContent(html, "twitter:image");
  if (title === undefined && image === undefined) {
    return undefined;
  }
  return {
    title,
    image,
    description: extractMetaContent(html, "og:description"),
    video: /•\s*Instagram (?:video|reel)\b/i.test(title ?? "")
      ? true
      : undefined,
  };
}

/** An Instagram link whose shortcode is known: a direct link, or a share
 * link once its redirect named the post. */
type InstagramPost = { kind: "reel" | "p" | "tv"; shortcode: string };

type InstagramMedia = ReturnType<typeof instagramMedia>;

function isInstagramPost(media: InstagramMedia): media is InstagramPost {
  return media?.shortcode !== undefined;
}

/** The post's plain address. The `/reels/` alias sends the crawler to the
 * login page, so even a direct link is read here. */
function instagramPostUrl(post: InstagramPost): string {
  return `https://www.instagram.com/${post.kind}/${post.shortcode}/`;
}

/** Fetch a post's page and its captioned embed. A direct link reads both at
 * once; a share link only names its post after the page fetch follows the
 * redirect, so its embed waits for the page. */
async function fetchInstagramPost(url: string) {
  const linked = instagramMedia(url);
  const direct = isInstagramPost(linked) ? linked : undefined;
  const embedFor = (post: InstagramPost | undefined) =>
    post
      ? fetchInstagramEmbed(`${instagramPostUrl(post)}embed/captioned/`)
      : Promise.resolve<InstagramEmbed>({ status: "missing" });
  const [page, directEmbed] = await Promise.all([
    fetchInstagramHtml(direct ? instagramPostUrl(direct) : url),
    direct ? embedFor(direct) : Promise.resolve(undefined),
  ]);
  if (!page.ok) {
    throw new PageFetchError(page.code, page.status);
  }
  const html = decodeWithContentType(page.bytes, page.contentType);
  const post =
    direct ??
    [page.finalUrl, extractMetaContent(html, "og:url"), extractCanonical(html)]
      .map((candidate) => instagramMedia(candidate, page.finalUrl))
      .find(isInstagramPost);
  const embed = directEmbed ?? (await embedFor(post));
  if (embed.status === "transient") {
    logEvent("warn", "instagram_caption_fetch_failed", {
      error_category: embed.errorCategory,
    });
  }
  return { page, html, kind: (post ?? linked)?.kind, embed };
}

/**
 * Read an Instagram post or reel. The page fetch decides gone/unreadable like
 * any link; the embed is best-effort. Shell markup is never article content:
 * the only content is the caption. A post Instagram calls broken is gone; any
 * other post it shares nothing about is a bare "Instagram" page that still
 * classifies from its URL. A transiently failed embed marks the read
 * incomplete so the save can retry.
 */
export async function fetchInstagram(url: string): Promise<PageData> {
  const { page, html, kind, embed } = await fetchInstagramPost(url);
  const embedded: InstagramEmbedFields =
    embed.status === "ok" ? parseInstagramEmbed(embed.html) : {};
  const card = instagramCard(html);
  const truncated =
    page.truncated === true || (embed.status === "ok" && embed.truncated);
  // Instagram answers 200 for a deleted or made-up post. The only "gone"
  // signal is that nothing about the post was read and the embed shows its
  // broken-media box, so that pair fails the save instead of saving it blank.
  // A cut read is no proof the metadata is missing, so it never counts.
  if (
    !truncated &&
    card === undefined &&
    embedded.caption === undefined &&
    embedded.posterUrl === undefined &&
    embedded.brokenMedia === true
  ) {
    throw new PageFetchError("http_error", 404);
  }
  const cardTitle = card?.title;
  const handle =
    embedded.username ?? cardTitle?.match(/\(@([A-Za-z0-9._]+)\)/)?.[1];
  const heroImageUrl = embedded.posterUrl ?? card?.image;
  const caption = embedded.caption?.slice(0, MAX_STORED_CONTENT_CHARS);
  const heroAspectRatio = heroImageUrl
    ? ((await fetchImageAspectRatio(heroImageUrl)) ??
      (kind === "p" ? 1 : 9 / 16))
    : undefined;
  return {
    title:
      Array.from(caption?.split("\n")[0] ?? "")
        .slice(0, 100)
        .join("") || cardTitle,
    // With a caption the card names the creator; without one the card is
    // already the title, so the page's own description is the only new text.
    description: caption ? cardTitle : card?.description,
    siteName: "Instagram",
    author: handle ? `@${handle}` : undefined,
    heroImageUrl,
    heroAspectRatio,
    content: caption,
    video: card?.video,
    ...(truncated ? { truncated: true as const } : {}),
    ...(embed.status === "transient" ? { incomplete: true as const } : {}),
  };
}

/**
 * A Pinterest pin page runs past the 1 MiB page read, and its meta tags sit
 * near the end: on a real pin `og:image` started at byte 1.24M, so a plain
 * read saved no image. What does fit is Pinterest's keyword-stuffed SEO title
 * and a cut description. Pinterest's public pin widget endpoint answers with
 * the pin itself in a few KB instead: the uploader's description, the source
 * link, the board, and the image. Every field is optional, since the endpoint
 * is undocumented; a pin it does not return falls back to the page read.
 */
const pinterestImageSchema = z.object({
  url: z.url(),
  width: z.number().positive(),
  height: z.number().positive(),
});

const pinterestPinSchema = z.object({
  title: z.string().nullish(),
  grid_title: z.string().nullish(),
  description: z.string().nullish(),
  link: z.string().nullish(),
  images: z.record(z.string(), pinterestImageSchema).nullish(),
  // Probed on real video pins (2026-09-28): every one said is_video: false,
  // and only a non-empty video list gave it away.
  videos: z.object({ video_list: z.record(z.string(), z.unknown()) }).nullish(),
  board: z.object({ name: z.string().nullish() }).nullish(),
  pinner: z
    .object({
      full_name: z.string().nullish(),
      username: z.string().nullish(),
    })
    .nullish(),
  rich_metadata: z.object({ title: z.string().nullish() }).nullish(),
});

const pinterestWidgetSchema = z.object({
  data: z.array(pinterestPinSchema.nullish().catch(null)),
});

type PinterestPin = z.infer<typeof pinterestPinSchema>;

/** The widget endpoint's answer, in the same three states as InstagramEmbed:
 * a pin, no pin (deleted, or a shape we cannot read), or a failure a retry
 * may not repeat. */
type PinterestWidget =
  | { status: "ok"; pin: PinterestPin }
  | { status: "missing" }
  | { status: "transient"; errorCategory: string };

/** The pin's id, and the URL it was found at: a `pin.it` short link is
 * followed to the pin it redirects to, so the page fallback reads that pin
 * directly instead of walking the redirects again. */
async function resolvePinterestUrl(
  url: string,
): Promise<{ id?: string; url: string }> {
  const id = pinterestPinId(url);
  if (id !== undefined || !isPinterestShortUrl(url)) {
    return { id, url };
  }
  // Only the landing URL matters, but keep the page cap: a live read showed a
  // smaller cap stalling past the deadline while the rest of a pin page is
  // drained, and every pin.it link timing out.
  const result = await safeFetch(url, {
    ...PAGE_FETCH_OPTIONS,
    // pin.it hops through api.pinterest.com and a /sent/ share URL.
    maxRedirects: 5,
  });
  if (!result.ok) {
    throw new PageFetchError(result.code, result.status);
  }
  if (isPinterestHomePage(result.finalUrl)) {
    throw new PageFetchError("http_error", 404);
  }
  return { id: pinterestPinId(result.finalUrl), url: result.finalUrl };
}

/** Pinterest answers a pin.it code it does not know, and a deleted pin's
 * page, with a 200 redirect to its home page rather than a 404. Saving that
 * page would save Pinterest itself, so a read that lands there is gone. */
function isPinterestHomePage(url: string): boolean {
  const parsed = new URL(url);
  return isPinterestHost(parsed.hostname) && parsed.pathname === "/";
}

async function readPinterestWidget(id: string): Promise<PinterestWidget> {
  let result: Awaited<ReturnType<typeof safeFetch>>;
  try {
    result = await safeFetch(
      `https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=${id}`,
      {
        timeoutMs: 15000,
        maxBytes: 256 * 1024,
        allowContentType: (ct) => ct.startsWith("application/json"),
        headers: {
          "User-Agent": BROWSER_USER_AGENT,
          Accept: "application/json",
        },
      },
    );
  } catch (error) {
    return { status: "transient", errorCategory: fetchErrorCategory(error) };
  }
  if (!result.ok) {
    return isTransientFetchFailure(result.code, result.status)
      ? {
          status: "transient",
          errorCategory: `page_fetch_error:${result.code}`,
        }
      : { status: "missing" };
  }
  let body: unknown;
  try {
    body = parseJson(result.bytes);
  } catch {
    // A 200 that is not JSON is the endpoint misbehaving, not a missing pin.
    return { status: "transient", errorCategory: "invalid_json" };
  }
  const pin = pinterestWidgetSchema.safeParse(body).data?.data[0];
  return pin ? { status: "ok", pin } : { status: "missing" };
}

/** The pin's largest image, as the 736px copy the pin page itself shows. The
 * widget lists only 236x and 564x copies; every pinimg size shares one path. */
function pinterestImage(
  images: PinterestPin["images"],
): { url: string; aspectRatio: number } | undefined {
  const largest = Object.values(images ?? {}).reduce<
    z.infer<typeof pinterestImageSchema> | undefined
  >(
    (best, image) =>
      best === undefined || image.width > best.width ? image : best,
    undefined,
  );
  if (largest === undefined) {
    return undefined;
  }
  const url = new URL(largest.url);
  if (url.hostname === "i.pinimg.com") {
    url.pathname = url.pathname.replace(/^\/\d+x\//, "/736x/");
  }
  return {
    url: url.toString(),
    aspectRatio: largest.width / largest.height,
  };
}

/** The pin's outbound source link, when it leads off Pinterest. */
function pinterestSourceLink(
  link: string | null | undefined,
): string | undefined {
  if (!link) {
    return undefined;
  }
  try {
    const url = new URL(link);
    return (url.protocol === "https:" || url.protocol === "http:") &&
      !isPinterestHost(url.hostname)
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

/** The pin as a page. Its description is the caption and the only content;
 * the board, video flag, and source page title travel as their own fields
 * for the prompt to render. */
/** A pinner's display name. Pinterest encodes some names more than once
 * ("A &amp;amp; B"), so entities are decoded until the name stops changing. */
function pinterestName(name: string | null | undefined): string | undefined {
  let decoded = name?.trim();
  for (let pass = 0; decoded && pass < 3; pass++) {
    const next = decodeEntities(decoded);
    if (next === decoded) break;
    decoded = next;
  }
  return decoded || undefined;
}

export function pinterestPage(pin: PinterestPin): PageData | undefined {
  const image = pinterestImage(pin.images);
  const description = pin.description
    ? decodeEntities(pin.description).trim()
    : "";
  if (image === undefined && description === "") {
    return undefined;
  }
  const title = (pin.grid_title || pin.title)?.trim();
  const sourceLink = pinterestSourceLink(pin.link);
  const sourceTitle = pin.rich_metadata?.title?.trim();
  return {
    title: title ? decodeEntities(title) : undefined,
    siteName: "Pinterest",
    author:
      pinterestName(pin.pinner?.full_name) || pin.pinner?.username || undefined,
    heroImageUrl: image?.url,
    heroAspectRatio: image?.aspectRatio,
    content: description || undefined,
    caption: true,
    board: pin.board?.name?.trim() || undefined,
    video:
      Object.keys(pin.videos?.video_list ?? {}).length > 0 ? true : undefined,
    linkedUrl: sourceLink,
    linkedTitle:
      sourceLink && sourceTitle ? decodeEntities(sourceTitle) : undefined,
  };
}

/** A pin read from the widget endpoint, or the pin's page when the endpoint
 * has nothing for it (a deleted pin 404s there and fails as gone). A page read
 * after the endpoint failed transiently is marked incomplete, so the save can
 * be retried for the widget's caption and image. */
async function fetchPinterestPin(url: string): Promise<PageData> {
  const resolved = await resolvePinterestUrl(url);
  const widget =
    resolved.id === undefined
      ? ({ status: "missing" } as const)
      : await readPinterestWidget(resolved.id);
  if (widget.status === "ok") {
    const page = pinterestPage(widget.pin);
    if (page !== undefined) {
      return withLinkedRecipe(page);
    }
  }
  if (widget.status === "transient") {
    logEvent("warn", "pinterest_widget_failed", {
      error_category: widget.errorCategory,
    });
    return {
      ...(await fetchPage(resolved.url, isPinterestHomePage)),
      incomplete: true,
    };
  }
  return fetchPage(resolved.url, isPinterestHomePage);
}

/**
 * Copy a preview into Convex storage through the connection-bound URL policy.
 * Clients receive only the stored copy. A refused or oversized image leaves
 * the save without a cover rather than exposing the remote URL to clients.
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
 * A caption source (TikTok, X, Instagram, a Pinterest pin) carries only a
 * caption, and the caption often links to the full recipe write-up. Follow
 * that one link and read its structured recipe markup. Best-effort: a
 * blocked, slow, or markup-less page leaves the post exactly as it was.
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

async function fetchPage(
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

/** The three outcomes that matter when reading a link's page: got it, the page
 * is gone for good (no classification, no retry), or it could not be read this
 * time (classify from the URL alone, retry later). Keeps the branching out of
 * processItem's body; failed outcomes carry the error for sanitized logging. */
type PageRead =
  | PageReadOk
  | { status: "gone"; error: PageFetchError }
  | { status: "unreadable"; error: PageFetchError };

/** A page that was read. Beyond the page itself it carries what the caller
 * would otherwise have to work out from the URL. */
type PageReadOk = {
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
function mayAskForRecipe(page: PageData): boolean {
  return (
    page.recipe === undefined &&
    // A cut caption reads as complete at any length, so the length check alone
    // would let the model transcribe a recipe that stops mid-ingredient.
    page.truncated !== true &&
    page.caption === true &&
    captionText(page) !== undefined
  );
}

/** Marks a reader's page as a caption: TikTok and X readers only ever return
 * a post's caption. */
async function asCaption(read: Promise<PageData>): Promise<PageData> {
  return { ...(await read), caption: true };
}

/** The reader for each platform with its own, each following its caption's
 * link to a recipe. Pinterest does that only for a pin it read from the
 * widget: its page fallback is not a caption, so it neither is marked one nor
 * has its links followed. */
const SOURCE_READERS = {
  tiktok: async (url) =>
    withLinkedRecipe(await asCaption(fetchTikTokOEmbed(url))),
  x: async (url) => withLinkedRecipe(await asCaption(fetchXPost(url))),
  instagram: async (url) => withLinkedRecipe(await fetchInstagram(url)),
  pinterest: fetchPinterestPin,
} satisfies Record<LinkSource, (url: string) => Promise<PageData>>;

export async function readPage(url: string): Promise<PageRead> {
  try {
    const source = linkSource(url);
    const page = source
      ? await SOURCE_READERS[source](url)
      : await fetchPage(url);
    const urlShortForm = shortFormSource(url);
    // The URL marks reels and TikToks as video; the reader also knows an
    // Instagram `/p/` post that is a video.
    const shortForm = urlShortForm && {
      ...urlShortForm,
      video: urlShortForm.video || page.video === true,
    };
    return {
      status: "ok",
      page,
      askForRecipe: mayAskForRecipe(page),
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
