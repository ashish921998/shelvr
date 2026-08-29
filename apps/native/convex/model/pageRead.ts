"use node";

import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { PageFetchError } from "./externalErrors";
import { readImageSize } from "./imageDimensions";
import { decodeWithContentType, safeFetch } from "./safeFetch";

const MAX_STORED_CONTENT_CHARS = 100000;

export type PageData = {
  title?: string;
  description?: string;
  heroImageUrl?: string;
  heroAspectRatio?: number;
  siteName?: string;
  content?: string;
};

export type PageRead =
  | { status: "ok"; page: PageData }
  | { status: "gone"; error: PageFetchError }
  | { status: "unreadable"; error: PageFetchError };

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

/** Find a meta tag by property/name, tolerant of attribute order. */
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

async function fetchImageAspectRatio(imageUrl: string): Promise<number | undefined> {
  const result = await safeFetch(imageUrl, {
    timeoutMs: 10000,
    maxBytes: 131072,
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
  if (!result.ok) return undefined;
  const size = readImageSize(result.bytes);
  return size && size.width > 0 && size.height > 0
    ? size.width / size.height
    : undefined;
}

function extractTitle(html: string): string | undefined {
  const ogTitle = extractMetaContent(html, "og:title");
  if (ogTitle) return ogTitle;
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return undefined;
  const title = decodeEntities(match[1]).replace(/\s+/g, " ").trim();
  return title === "" ? undefined : title;
}

function stripElements(html: string, tags: string[]): string {
  let out = html;
  for (const tag of tags) {
    out = out.replace(new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, "gi"), " ");
  }
  return out;
}

function htmlToText(html: string): string {
  let text = html;
  text = text.replace(/<\/(p|div|section|h[1-6]|li|blockquote|tr|figcaption|pre)>/gi, "\n\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<li[^>]*>/gi, "- ");
  text = text.replace(/<[^>]+>/g, " ");
  text = decodeEntities(text);
  return text
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph.replace(/[ \t]+/g, " ").replace(/\n/g, " ").trim(),
    )
    .filter((paragraph) => paragraph !== "")
    .join("\n\n")
    .slice(0, MAX_STORED_CONTENT_CHARS);
}

function extractBodyTextRegex(html: string): string {
  let scope = html;
  const article = html.match(/<article[\s\S]*?<\/article>/i);
  if (article) {
    scope = article[0];
  } else {
    const main = html.match(/<main[\s\S]*?<\/main>/i);
    if (main) {
      scope = main[0];
    } else {
      const body = html.match(/<body[\s\S]*<\/body>/i);
      if (body) scope = body[0];
    }
  }
  scope = stripElements(scope, [
    "script",
    "style",
    "noscript",
    "svg",
    "nav",
    "header",
    "footer",
    "aside",
    "form",
    "iframe",
    "template",
  ]);
  scope = scope.replace(/<!--[\s\S]*?-->/g, " ");
  return htmlToText(scope);
}

function extractBodyText(html: string, url: string): string {
  try {
    const { document } = parseHTML(html);
    try {
      const base = document.createElement("base");
      base.setAttribute("href", url);
      document.head?.appendChild(base);
    } catch {
      // Readability can still parse without a base URL.
    }
    const article = new Readability(document).parse();
    if (article?.content) {
      const text = htmlToText(article.content);
      if (text.trim() !== "") return text;
    }
  } catch {
    // Fall through to the deliberately conservative regex extractor.
  }
  return extractBodyTextRegex(html);
}

/**
 * Purely parse page metadata and readable content from already-bounded HTML.
 * Network enrichment belongs to `readPage`, so fixtures can exercise this
 * function without hidden I/O.
 */
export function parsePageHtml(
  html: string,
  finalUrl: string,
): PageData {
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
  return {
    title,
    description,
    heroImageUrl,
    heroAspectRatio,
    siteName,
    content: content === "" ? undefined : content,
  };
}

async function fetchPage(url: string): Promise<PageData> {
  const result = await safeFetch(url, {
    timeoutMs: 15000,
    maxBytes: 1024 * 1024,
    onOverflow: "truncate",
    allowContentType: (contentType) =>
      contentType.startsWith("text/html") ||
      contentType.startsWith("application/xhtml+xml") ||
      contentType.startsWith("application/xml"),
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!result.ok) {
    throw new PageFetchError(result.code, result.status);
  }
  const page = parsePageHtml(
    decodeWithContentType(result.bytes, result.contentType),
    result.finalUrl,
  );
  if (page.heroImageUrl && page.heroAspectRatio === undefined) {
    return {
      ...page,
      heroAspectRatio: await fetchImageAspectRatio(page.heroImageUrl),
    };
  }
  return page;
}

/** True only when retrying cannot make the resource readable. */
export function pageGone(status: number | undefined): boolean {
  return status === 404 || status === 410;
}

/**
 * Give the page-read module a URL and receive one of three domain outcomes.
 */
export async function readPage(url: string): Promise<PageRead> {
  try {
    return { status: "ok", page: await fetchPage(url) };
  } catch (error) {
    if (!(error instanceof PageFetchError)) throw error;
    return pageGone(error.status)
      ? { status: "gone", error }
      : { status: "unreadable", error };
  }
}
