"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { safeFetch, parseJson } from "./model/safeFetch";
import { summarizeExternalError } from "./model/externalErrors";
import { readImageSize } from "./model/imageDimensions";
import { readPage, type PageData } from "./model/pageRead";

// Call Google directly (no Vercel AI Gateway). The default `google` provider
// reads the GOOGLE_GENERATIVE_AI_API_KEY deployment env var.
const MODEL = google("gemini-3.1-flash-lite");

const SYSTEM_PROMPT =
  "You are the classifier for Shelvr, a save-it-for-later app. Titles must be short and " +
  "punchy — like a label on a folder, not a headline. Aim for 2-4 words, never a full " +
  "sentence, and never end with a period.";

// The closed set of intent kinds the model may emit. Kept in sync with the
// Convex validator in items.ts; anything outside this set is dropped before
// finalize so a hallucinated kind can never reach the DB.
const INTENT_KINDS = [
  "open_url",
  "copy",
  "web_search",
  "open_maps",
  "call",
  "email",
  "message",
  "add_event",
] as const;

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

function spacesPromptBlock(
  spaces: { name: string; description?: string }[],
): string {
  if (spaces.length === 0) {
    return "The user has no spaces yet, so spaceNames must be an empty array.";
  }
  const lines = spaces
    .map(
      (s) => `- "${s.name}"${s.description ? `: ${s.description}` : ""}`,
    )
    .join("\n");
  return `The user organizes items into spaces. Candidate spaces:\n${lines}\n\nIn spaceNames, include only the exact names of spaces this item CLEARLY belongs to. Only include confident matches. If none clearly match, return an empty array.`;
}


export const processItem = internalAction({
  args: { itemId: v.id("items") },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const item = await ctx.runQuery(internal.items.getItemInternal, {
        itemId: args.itemId,
      });
      if (item === null) {
        return null;
      }
      // Only dynamic spaces are visible to the classifier: matches become
      // pending suggestions. Non-dynamic spaces never hear from the pipeline.
      const allSpaces = await ctx.runQuery(internal.spaces.listSpacesInternal, {
        userId: item.userId,
      });
      const spaces = allSpaces.filter((s) => s.dynamic === true);
      const spacesBlock = spacesPromptBlock(spaces);

      let page: PageData | undefined;
      let result: z.infer<typeof itemAnalysisSchema>;
      // Set when the page body could not be read but the item is still worth
      // saving: the classifier runs on the URL alone and the row is flagged so
      // the client can offer a retry instead of showing a fully enriched save.
      let unreadable = false;

      if (item.type === "link") {
        if (!item.url) {
          throw new Error("Link item has no url");
        }
        const read = await readPage(item.url);
        if (read.status === "gone") {
          // Nothing to read and nothing to retry: a 404/410 is terminal.
          console.error(
            `processItem gone for ${args.itemId}:`,
            summarizeExternalError(read.error),
          );
          await ctx.runMutation(internal.items.failItem, {
            itemId: args.itemId,
            reason: "not_found",
          });
          return null;
        }
        if (read.status === "unreadable") {
          // Refused (403/429), server error, timeout, or oversized: the link is
          // probably still good, so save a usable item classified from the URL
          // and let the user retry the fetch later.
          console.warn(
            `processItem unreadable for ${args.itemId}:`,
            summarizeExternalError(read.error),
          );
          unreadable = true;
        } else {
          page = read.page;
        }
        const { object } = await generateObject({
          model: MODEL,
          system: SYSTEM_PROMPT,
          schema: itemAnalysisSchema,
          prompt: [
            "You are helping organize a save-it-for-later app. Analyze this saved web page and produce a title, a 1-2 sentence description, 4-8 lowercase tags (one or two words each), and matching space names.",
            spacesBlock,
            `URL: ${item.url}`,
            page?.title ? `Page title: ${page.title}` : "",
            page?.siteName ? `Site: ${page.siteName}` : "",
            page?.description ? `Meta description: ${page.description}` : "",
            page?.content
              ? `Page content:\n${page.content.slice(0, 6000)}`
              : "No page content could be extracted.",
            unreadable
              ? "The page could not be read, so you have ONLY the URL. Base the title, description, and tags strictly on what the URL itself reveals (site, section, slug). Do NOT invent specifics — no facts, quotes, prices, names, or claims that are not literally present in the URL. Prefer a plain descriptive title over a confident-sounding one."
              : "",
            INTENTS_PROMPT_BLOCK,
          ]
            .filter((line) => line !== "")
            .join("\n\n"),
        });
        result = object;
      } else if (item.type === "image") {
        if (!item.storageId) {
          throw new Error("Image item has no storageId");
        }
        const imageUrl = await ctx.storage.getUrl(item.storageId);
        if (imageUrl === null) {
          throw new Error("Image file not found in storage");
        }
        const { object } = await generateObject({
          model: MODEL,
          system: SYSTEM_PROMPT,
          schema: itemAnalysisSchema,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: [
                    "You are helping organize a save-it-for-later app. Analyze this saved image and produce a short evocative title, a 1-2 sentence description of what it shows, 4-8 lowercase tags (one or two words each), and matching space names.",
                    spacesBlock,
                    INTENTS_PROMPT_BLOCK,
                  ].join("\n\n"),
                },
                { type: "image", image: new URL(imageUrl) },
              ],
            },
          ],
        });
        result = object;
      } else {
        if (!item.note) {
          throw new Error("Note item has no text");
        }
        const { object } = await generateObject({
          model: MODEL,
          system: SYSTEM_PROMPT,
          schema: itemAnalysisSchema,
          prompt: [
            "You are helping organize a save-it-for-later app. Analyze this saved note and produce a short evocative title, a 1-2 sentence description, 4-8 lowercase tags (one or two words each), and matching space names.",
            spacesBlock,
            `Note:\n${item.note.slice(0, MAX_CONTENT_CHARS)}`,
            INTENTS_PROMPT_BLOCK,
          ].join("\n\n"),
        });
        result = object;
      }

      // Map returned space names back to ids (case-insensitive, trimmed).
      const spaceIdByName = new Map(
        spaces.map((s) => [s.name.trim().toLowerCase(), s._id]),
      );
      const spaceIds: Id<"spaces">[] = [];
      for (const name of result.spaceNames) {
        const id = spaceIdByName.get(name.trim().toLowerCase());
        if (id !== undefined) {
          spaceIds.push(id);
        }
      }

      await ctx.runMutation(internal.items.finalizeItem, {
        itemId: args.itemId,
        title: result.title,
        description: result.description,
        tags: result.tags.map((t) => t.trim().toLowerCase()).filter(Boolean),
        content: item.type === "link" ? page?.content : undefined,
        siteName: item.type === "link" ? page?.siteName : undefined,
        heroImageUrl: item.type === "link" ? page?.heroImageUrl : undefined,
        // Links: the OG image's shape. Images/notes: preserve the ratio the
        // client captured on upload (patching undefined would drop the field).
        aspectRatio:
          item.type === "link" ? page?.heroAspectRatio : item.aspectRatio,
        intents: sanitizeIntents(result.intents),
        enrichment: unreadable ? "partial" : undefined,
        status: "ready",
      });
      if (spaceIds.length > 0) {
        await ctx.runMutation(internal.items.setSpacesForItem, {
          itemId: args.itemId,
          spaceIds,
        });
      }

      // If the user filed this item straight into spaces while it was still
      // processing, run the purpose-steering pass now that it's classified.
      const savedSpaceIds = await ctx.runQuery(
        internal.spaces.listSavedSpaceIdsForItemInternal,
        { itemId: args.itemId },
      );
      for (const spaceId of savedSpaceIds) {
        await ctx.scheduler.runAfter(0, internal.ai.steerItemForSpace, {
          itemId: args.itemId,
          spaceId,
        });
      }
    } catch (error) {
      // Sanitized error log. For fetch-policy failures (PageFetchError,
      // SafeFetchError) log only the stable policy code + item id — never the
      // error object, its cause, URLs, headers, response bodies, or resolved
      // addresses. For other errors log a generic category so a thrown Error's
      // message (which may include a URL) is not leaked either.
      console.error(
        `processItem failed for ${args.itemId}:`,
        summarizeExternalError(error),
      );
      await ctx.runMutation(internal.items.failItem, {
        itemId: args.itemId,
        reason: "error",
      });
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
      console.error(
        `recommendForSpace failed for ${args.spaceId}:`,
        summarizeExternalError(error),
      );
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
      const apiKey = process.env.SERPAPI_KEY;
      if (!apiKey) {
        console.error("findProductLinks: SERPAPI_KEY is not set");
        await fail();
        return null;
      }

      // Build the product query. Images go through the vision model; links
      // and notes already have classified text that describes the thing.
      let query: string;
      if (item.type === "image" && item.storageId) {
        const imageUrl = await ctx.storage.getUrl(item.storageId);
        if (imageUrl === null) {
          await fail();
          return null;
        }
        const { object } = await generateObject({
          model: MODEL,
          schema: productQuerySchema,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Identify the primary product shown in this image and produce a shopping search query for it. If nothing in the image is a purchasable product, return an empty query.",
                },
                { type: "image", image: new URL(imageUrl) },
              ],
            },
          ],
        });
        query = object.query.trim();
      } else {
        const { object } = await generateObject({
          model: MODEL,
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
        console.error(
          `findProductLinks: serpapi fetch blocked (${result.code}) for ${args.itemId}`,
        );
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
      // Sanitized error log: never the raw error object (which may carry the
      // request URL with the API key, or a response body). summarizeExternalError
      // reduces fetch-policy errors to a code and everything else to a category.
      console.error(
        `findProductLinks failed for ${args.itemId}:`,
        summarizeExternalError(error),
      );
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
      console.error(
        `steerItemForSpace failed for ${args.itemId} in ${args.spaceId}:`,
        summarizeExternalError(error),
      );
    }
    return null;
  },
});
