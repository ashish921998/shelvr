"use node";

import { v } from "convex/values";
import { generateObject } from "ai";
import { z } from "zod";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { missingEnvVariableUrl } from "./utils";

const MAX_HTML_BYTES = 1_500_000;
const MAX_RECLASSIFY_ITEMS = 2_000;
const RECLASSIFY_PAGE_SIZE = 100;

const classificationSchema = z.object({
  title: z.string().describe("Short, specific title for the saved item"),
  description: z
    .string()
    .describe("1-3 sentence description of what this item is about"),
  tags: z
    .array(z.string())
    .max(8)
    .describe("Lowercase topical tags, no # prefix"),
  spaceNames: z
    .array(z.string())
    .describe(
      "Names of existing user spaces this item belongs to. Only use exact names from the provided list.",
    ),
});

const matchSchema = z.object({
  itemIds: z
    .array(z.string())
    .describe("IDs of existing items that belong in the new space"),
});

/**
 * Process a newly created item: extract content (for links), classify with
 * the LLM, map space names → ids, and finalize.
 */
export const processItem = internalAction({
  args: { itemId: v.id("items") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.runQuery(internal.items.getItemInternal, {
      itemId: args.itemId,
    });
    if (!item) return null;

    try {
      assertAiGatewayConfigured();

      const spaces = await ctx.runQuery(internal.items.listUserSpacesInternal, {
        userId: item.userId,
      });

      let extractedText: string | undefined;
      let imageUrl: string | undefined;
      let imageAspectRatio: number | undefined;
      let sourceHint = "";

      if (item.type === "link" && item.url) {
        const page = await extractLinkContent(item.url);
        extractedText = page.text;
        imageUrl = page.imageUrl;
        imageAspectRatio = page.imageAspectRatio;
        sourceHint = [
          `URL: ${item.url}`,
          page.title ? `Page title: ${page.title}` : null,
          page.description ? `OG description: ${page.description}` : null,
          extractedText ? `Article body:\n${extractedText.slice(0, 8000)}` : null,
        ]
          .filter(Boolean)
          .join("\n\n");
      } else if (item.type === "note") {
        sourceHint = `User note:\n${item.note ?? ""}`;
        extractedText = item.note;
      } else if (item.type === "image") {
        sourceHint =
          "User saved an image. Infer a useful title, description, and tags from context alone (no vision input available in this pipeline yet).";
        if (item.note) sourceHint += `\nUser caption: ${item.note}`;
      }

      const spaceList =
        spaces.length === 0
          ? "(no spaces yet)"
          : spaces
              .map(
                (s) =>
                  `- ${s.name}${s.description ? `: ${s.description}` : ""}`,
              )
              .join("\n");

      const { object } = await generateObject({
        model: "google/gemini-3.1-flash-lite",
        schema: classificationSchema,
        prompt: [
          "You classify saved-for-later items for a personal knowledge hub called Shelvr.",
          "Produce a clear title, short description, topical tags, and which existing spaces the item belongs to.",
          "Only assign spaceNames that exactly match names from the user's space list. Prefer fewer accurate spaces over many loose ones.",
          "",
          `Item type: ${item.type}`,
          "",
          "User spaces:",
          spaceList,
          "",
          "Item content:",
          sourceHint || "(empty)",
        ].join("\n"),
      });

      const nameToId = new Map(
        spaces.map((s) => [s.name.toLowerCase(), s._id] as const),
      );
      const spaceIds = object.spaceNames
        .map((name) => nameToId.get(name.toLowerCase()))
        .filter((id): id is Id<"spaces"> => id !== undefined);

      await ctx.runMutation(internal.items.finalizeItem, {
        itemId: args.itemId,
        title: object.title.trim() || "Untitled",
        description: object.description.trim(),
        tags: object.tags.map((t) => t.trim().toLowerCase()).filter(Boolean),
        extractedText,
        imageUrl,
        imageAspectRatio,
        spaceIds,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown processing error";
      console.error(`processItem failed for ${args.itemId}:`, message);
      await ctx.runMutation(internal.items.markItemFailed, {
        itemId: args.itemId,
        error: message,
      });
    }

    return null;
  },
});

/**
 * When a new space is created, scan existing ready items and attach ones
 * that belong in the new space.
 */
export const reclassifyForNewSpace = internalAction({
  args: { spaceId: v.id("spaces") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const spaces = await ctx.runQuery(internal.spacesInternal.getSpace, {
      spaceId: args.spaceId,
    });
    if (!spaces) return null;

    try {
      assertAiGatewayConfigured();

      type ReadyItem = {
        _id: Id<"items">;
        title?: string;
        description?: string;
        tags?: string[];
        type: "link" | "image" | "note";
        url?: string;
        note?: string;
        extractedText?: string;
      };
      const items: ReadyItem[] = [];
      let cursor: string | null = null;
      for (;;) {
        const page: {
          page: ReadyItem[];
          isDone: boolean;
          continueCursor: string;
        } = await ctx.runQuery(internal.items.listReadyItemsPage, {
          userId: spaces.userId,
          paginationOpts: {
            numItems: RECLASSIFY_PAGE_SIZE,
            cursor,
          },
        });
        items.push(...page.page);
        if (page.isDone || items.length >= MAX_RECLASSIFY_ITEMS) break;
        cursor = page.continueCursor;
      }

      if (items.length === 0) return null;

      // Batch in chunks to stay within model context
      const chunkSize = 40;
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        const catalog = chunk
          .map((item) => {
            const bits = [
              `id=${item._id}`,
              `type=${item.type}`,
              item.title ? `title=${item.title}` : null,
              item.description ? `desc=${item.description}` : null,
              item.tags?.length ? `tags=${item.tags.join(",")}` : null,
              item.url ? `url=${item.url}` : null,
            ].filter(Boolean);
            return `- ${bits.join(" | ")}`;
          })
          .join("\n");

        const { object } = await generateObject({
          model: "google/gemini-3.1-flash-lite",
          schema: matchSchema,
          prompt: [
            "A user created a new themed collection (space). Decide which existing saved items belong in it.",
            "Return only item ids from the catalog that clearly fit. Prefer precision over recall.",
            "",
            `Space name: ${spaces.name}`,
            spaces.description
              ? `Space description: ${spaces.description}`
              : null,
            "",
            "Catalog:",
            catalog,
          ]
            .filter(Boolean)
            .join("\n"),
        });

        const validIds = new Set(chunk.map((item) => item._id as string));
        for (const rawId of object.itemIds) {
          if (!validIds.has(rawId)) continue;
          await ctx.runMutation(internal.items.linkItemToSpaceInternal, {
            userId: spaces.userId,
            spaceId: args.spaceId,
            itemId: rawId as Id<"items">,
          });
        }
      }
    } catch (error) {
      console.error(
        `reclassifyForNewSpace failed for ${args.spaceId}:`,
        error instanceof Error ? error.message : error,
      );
    }

    return null;
  },
});

function assertAiGatewayConfigured() {
  if (!process.env.AI_GATEWAY_API_KEY) {
    throw new Error(
      missingEnvVariableUrl(
        "AI_GATEWAY_API_KEY",
        "https://vercel.com/docs/ai-gateway",
      ),
    );
  }
}

type ExtractedPage = {
  title?: string;
  description?: string;
  text?: string;
  imageUrl?: string;
  imageAspectRatio?: number;
};

async function extractLinkContent(url: string): Promise<ExtractedPage> {
  const safeUrl = assertSafePublicHttpUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(safeUrl.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "ShelvrBot/1.0 (+https://shelvr.app; save-for-later content extractor)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    // Re-validate the post-redirect URL so open redirects cannot hit internals.
    if (response.url) {
      assertSafePublicHttpUrl(response.url);
    }

    if (!response.ok) {
      throw new Error(`Fetch failed with status ${response.status}`);
    }

    const html = await readResponseTextLimited(response, MAX_HTML_BYTES);
    const pageUrl = response.url || safeUrl.toString();
    const og = extractOpenGraph(html, pageUrl);
    const articleText = await extractArticleText(html, pageUrl);

    let imageAspectRatio: number | undefined;
    if (og.imageUrl) {
      imageAspectRatio = await probeImageAspectRatio(og.imageUrl);
    }

    return {
      title: og.title,
      description: og.description,
      text: articleText || og.description,
      imageUrl: og.imageUrl,
      imageAspectRatio,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractOpenGraph(html: string, pageUrl: string) {
  const getMeta = (keys: string[]) => {
    for (const key of keys) {
      const propRe = new RegExp(
        `<meta[^>]+(?:property|name)=["']${escapeRegExp(key)}["'][^>]+content=["']([^"']+)["']`,
        "i",
      );
      const contentFirstRe = new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escapeRegExp(key)}["']`,
        "i",
      );
      const match = html.match(propRe) ?? html.match(contentFirstRe);
      if (match?.[1]) return decodeHtmlEntities(match[1].trim());
    }
    return undefined;
  };

  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  const rawImage = getMeta(["og:image", "twitter:image", "twitter:image:src"]);

  return {
    title:
      getMeta(["og:title", "twitter:title"]) ??
      (titleTag ? decodeHtmlEntities(titleTag.trim()) : undefined),
    description: getMeta([
      "og:description",
      "twitter:description",
      "description",
    ]),
    imageUrl: resolveHttpUrl(rawImage, pageUrl),
  };
}

async function extractArticleText(
  html: string,
  url: string,
): Promise<string | undefined> {
  try {
    const { parseHTML } = await import("linkedom");
    const { Readability } = await import("@mozilla/readability");
    const { document } = parseHTML(html);
    // linkedom document is enough for Readability's needs
    const reader = new Readability(document as unknown as Document, {
      charThreshold: 50,
    });
    // Ensure base URI-ish fields exist for relative link resolution
    try {
      Object.defineProperty(document, "URL", { value: url, configurable: true });
    } catch {
      // ignore
    }
    const article = reader.parse();
    const text = article?.textContent?.replace(/\s+/g, " ").trim();
    if (text) return text.slice(0, 12_000);
  } catch (error) {
    console.warn("Readability extraction failed, using regex fallback:", error);
  }

  // Regex fallback: strip tags
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped ? stripped.slice(0, 8_000) : undefined;
}

/** Read image dimensions from header bytes (JPEG/PNG/GIF/WebP) — no deps. */
async function probeImageAspectRatio(
  imageUrl: string,
): Promise<number | undefined> {
  try {
    const safeUrl = assertSafePublicHttpUrl(imageUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(safeUrl.toString(), {
        signal: controller.signal,
        headers: { Range: "bytes=0-65535" },
        redirect: "follow",
      });
      if (response.url) {
        assertSafePublicHttpUrl(response.url);
      }
      if (!response.ok && response.status !== 206) return undefined;
      const buffer = new Uint8Array(
        await readResponseArrayBufferLimited(response, 65_536),
      );
      const dims = readImageSize(buffer);
      if (!dims || dims.height === 0) return undefined;
      return dims.width / dims.height;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return undefined;
  }
}

/**
 * Only allow public http(s) URLs. Blocks private/link-local/metadata hosts and
 * non-http schemes to reduce SSRF risk from user-supplied link saves.
 */
function assertSafePublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed");
  }

  if (url.username || url.password) {
    throw new Error("URLs with credentials are not allowed");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname) {
    throw new Error("Invalid URL host");
  }

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "0.0.0.0" ||
    hostname === "::" ||
    hostname === "::1" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".intranet")
  ) {
    throw new Error("Private/local URLs are not allowed");
  }

  if (isPrivateOrReservedIp(hostname)) {
    throw new Error("Private/local URLs are not allowed");
  }

  return url;
}

function resolveHttpUrl(
  value: string | undefined,
  baseUrl: string,
): string | undefined {
  if (!value) return undefined;
  try {
    const resolved = new URL(value, baseUrl);
    assertSafePublicHttpUrl(resolved.toString());
    return resolved.toString();
  } catch {
    return undefined;
  }
}

function isPrivateOrReservedIp(hostname: string): boolean {
  // IPv4
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) {
    const parts = hostname.split(".").map((p) => Number(p));
    if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return true;
    }
    const [a, b] = parts as [number, number, number, number];
    if (a === 0) return true; // "this" network
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    if (a === 192 && b === 0 && parts[2] === 0) return true; // IETF protocol assignments
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  // IPv6 (including IPv4-mapped)
  if (hostname.includes(":")) {
    const normalized = hostname.toLowerCase();
    if (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") || // unique local
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb") // link-local fe80::/10
    ) {
      return true;
    }
    // IPv4-mapped IPv6 ::ffff:a.b.c.d (Node's URL may also emit ::ffff:xxxx:yyyy
    // hex form, which is not caught by the dotted regex above). Treat any
    // ::ffff: prefix as suspect: parse it to an IPv4 if possible, otherwise
    // block to prevent hex-encoded loopback bypasses (e.g. ::ffff:7f00:1).
    if (normalized.startsWith("::ffff:")) {
      const rest = normalized.slice("::ffff:".length);
      // Dotted-decimal form
      const v4mapped = rest.match(/^\d{1,3}(?:\.\d{1,3}){3}$/);
      if (v4mapped) {
        return isPrivateOrReservedIp(rest);
      }
      // Hex form: xxxx:yyyy
      const hexMapped = rest.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
      if (hexMapped) {
        const high = parseInt(hexMapped[1], 16);
        const low = parseInt(hexMapped[2], 16);
        const a = (high >> 8) & 0xff;
        const b = high & 0xff;
        const c = (low >> 8) & 0xff;
        const d = low & 0xff;
        return isPrivateOrReservedIp(`${a}.${b}.${c}.${d}`);
      }
      // Unknown ::ffff: form — block defensively
      return true;
    }
  }

  return false;
}

async function readResponseTextLimited(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new Error("Page too large to extract");
  }

  const bytes = await readResponseArrayBufferLimited(response, maxBytes);
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

async function readResponseArrayBufferLimited(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!response.body) {
    const buf = new Uint8Array(await response.arrayBuffer());
    if (buf.byteLength > maxBytes) {
      throw new Error("Page too large to extract");
    }
    return buf;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new Error("Page too large to extract");
      }
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function readImageSize(
  bytes: Uint8Array,
): { width: number; height: number } | undefined {
  // PNG
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const width = readUInt32BE(bytes, 16);
    const height = readUInt32BE(bytes, 20);
    return { width, height };
  }

  // GIF
  if (
    bytes.length >= 10 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46
  ) {
    const width = bytes[6]! | (bytes[7]! << 8);
    const height = bytes[8]! | (bytes[9]! << 8);
    return { width, height };
  }

  // WebP (VP8X / VP8 / VP8L simplified)
  if (
    bytes.length >= 30 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    // VP8X
    if (
      bytes[12] === 0x56 &&
      bytes[13] === 0x50 &&
      bytes[14] === 0x38 &&
      bytes[15] === 0x58
    ) {
      const width = 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16));
      const height = 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16));
      return { width, height };
    }
  }

  // JPEG — scan for SOF0/SOF2
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1]!;
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
      // SOF0 / SOF1 / SOF2
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        const height = (bytes[offset + 5]! << 8) | bytes[offset + 6]!;
        const width = (bytes[offset + 7]! << 8) | bytes[offset + 8]!;
        return { width, height };
      }
      offset += 2 + length;
    }
  }

  return undefined;
}

function readUInt32BE(bytes: Uint8Array, offset: number) {
  return (
    ((bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!) >>>
    0
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
