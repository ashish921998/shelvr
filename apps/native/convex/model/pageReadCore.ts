"use node";

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

export const MAX_STORED_CONTENT_CHARS = 100000;

export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export const SHELVR_USER_AGENT = "Shelvr/1.0 (+https://shelvr-web.vercel.app)";

export const PROMPT_CONTENT_CHARS = 6000;

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

export function stripTags(html: string): string {
  let text = "";
  let from = 0;
  for (;;) {
    const open = html.indexOf("<", from);
    if (open === -1) return text + html.slice(from);
    text += html.slice(from, open);
    const close = html.indexOf(">", open + 1);
    if (close === -1) return text + html.slice(open).replaceAll("<", "");
    from = close > open + 1 ? close + 1 : open + 1;
  }
}

export function extractCanonical(html: string): string | undefined {
  const tag = html.match(/<link[^>]*rel\s*=\s*["']canonical["'][^>]*>/i)?.[0];
  const href = tag?.match(/href\s*=\s*["']([^"']*)["']/i)?.[1]?.trim();
  return href ? decodeEntities(href) : undefined;
}

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
    const content = html.match(pattern)?.[1]?.trim();
    if (content) {
      return decodeEntities(content);
    }
  }
  return undefined;
}

export async function fetchImageAspectRatio(
  imageUrl: string,
): Promise<number | undefined> {
  const result = await safeFetch(imageUrl, {
    timeoutMs: 10000,
    maxBytes: 131072,
    onOverflow: "truncate",
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
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (match !== undefined) {
    const title = decodeEntities(match).replace(/\s+/g, " ").trim();
    if (title !== "") {
      return title;
    }
  }
  return undefined;
}

function htmlToText(html: string): string {
  let text = html;
  text = text.replace(
    /<\/(p|div|section|h[1-6]|li|blockquote|tr|figcaption|pre)>/gi,
    "\n\n",
  );
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<li[^>]*>/gi, "- ");
  text = text.replace(/<[^>]+>/g, " ");
  text = decodeEntities(text);
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

const MIN_ARTICLE_CHARS = 120;

export function extractBodyText(html: string, url: string): string | undefined {
  try {
    const { document } = parseHTML(html);
    for (const element of document.querySelectorAll(
      'nav, footer, [role="navigation"], [role="banner"], [role="contentinfo"], .cookie-banner, #cookie-banner, .cookie-consent, #cookie-consent, .skip-link, .skip-to-content, .skip-nav, .screen-reader-shortcut',
    )) {
      element.remove();
    }
    if (document.querySelector(".mw-parser-output")) {
      for (const element of document.querySelectorAll(
        ".infobox, .navbox, .mw-editsection, sup.reference",
      )) {
        element.remove();
      }
    }
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
    try {
      const base = document.createElement("base");
      base.setAttribute("href", url);
      document.head?.appendChild(base);
    } catch {}
    const article = new Readability(document).parse();
    if (article?.content) {
      const text = htmlToText(article.content);
      if (text.trim().length >= MIN_ARTICLE_CHARS) {
        return text;
      }
    }
  } catch {}
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
  incomplete?: true;
  truncated?: true;
  media?: PostMedia[];
  recipe?: Recipe;
  caption?: true;
  board?: string;
  video?: true;
  linkedTitle?: string;
  linkedUrl?: string;
  postUrl?: string;
};

export function postField(postUrl: string | undefined): { postUrl?: string } {
  return postUrl ? { postUrl } : {};
}

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

function isLinkHub(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (isPinterestHost(host)) {
    return true;
  }
  for (const hub of LINK_HUB_HOSTS) {
    if (host === hub || host.endsWith(`.${hub}`)) {
      return true;
    }
  }
  return false;
}

export function firstLinkedUrl(text: string | undefined): string | undefined {
  if (!text) {
    return undefined;
  }
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'()]+/gi)) {
    const candidate = match[0].replace(/[.,;:!?]+$/, "");
    try {
      if (!isLinkHub(new URL(candidate).hostname)) {
        return candidate;
      }
    } catch {}
  }
  return undefined;
}

export function isTransientFetchFailure(code: SafeFetchError, status?: number) {
  return (
    code === "timeout" ||
    code === "fetch_failed" ||
    (code === "http_error" &&
      status !== undefined &&
      (status === 429 || status >= 500))
  );
}

export class PageFetchError extends Error {
  constructor(
    public readonly code: SafeFetchError,
    public readonly status?: number,
  ) {
    super(`page fetch failed: ${code}`);
    this.name = "PageFetchError";
  }
}

export function isPageFetchError(e: unknown): e is PageFetchError {
  return e instanceof PageFetchError;
}

export function fetchErrorCategory(error: unknown): string {
  if (isPageFetchError(error)) {
    return `page_fetch_error:${error.code}`;
  }
  if (isSafeFetchError(error)) {
    return `safe_fetch:${error.code}`;
  }
  if (error !== null && typeof error === "object" && "name" in error) {
    return `unexpected_error:${String(error.name)}`;
  }
  return "unexpected_error";
}

export const PAGE_FETCH_OPTIONS = {
  timeoutMs: 15000,
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

function recipeFromMarkup(
  html: string,
  truncated: true | undefined,
): Recipe | undefined {
  return truncated ? undefined : sanitizeRecipe(extractRecipeMarkup(html));
}

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
  isGone?: (finalUrl: string) => boolean,
): Promise<PageData> {
  const result = await safeFetch(url, PAGE_FETCH_OPTIONS);
  if (!result.ok) {
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
  const recipe = recipeFromMarkup(html, result.truncated);

  return {
    title,
    description,
    heroImageUrl,
    heroAspectRatio,
    siteName,
    content,
    ...(result.truncated ? { truncated: true as const } : {}),
    ...(recipe ? { recipe } : {}),
  };
}

export function captionText(page: PageData): string | undefined {
  return page.content !== undefined &&
    page.content.length <= PROMPT_CONTENT_CHARS
    ? page.content
    : undefined;
}
