import { v } from "convex/values";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { requireUserId } from "./model/auth";
import { requireProEntitlement } from "./subscriptions";
import { rateLimiter } from "./model/rateLimiter";
import { effectiveStatus } from "./model/memberships";
import { normalizeExternalUrl } from "./model/externalUrl";
import { createItemWithOperation } from "./model/itemCreation";
import {
  attachImageUploadArgsValidator,
  attachImageUploadHandler,
  attachImageUploadResultValidator,
  beginImageImportArgsValidator,
  beginImageImportHandler,
  beginImageImportResultValidator,
  cleanupStaleImageImportsHandler,
  finalizeImageImportArgsValidator,
  finalizeImageImportHandler,
  getImportOperationArgsValidator,
  getImportOperationHandler,
  getImportOperationResultValidator,
  STALE_IMPORT_CUTOFF_MS as IMPORT_STALE_CUTOFF_MS,
} from "./model/itemImports";
import { safeDeleteStorage } from "./model/itemOperations";
import {
  failItemArgsValidator,
  failItemHandler,
  finalizeItemArgsValidator,
  finalizeItemHandler,
  getItemInternalArgsValidator,
  getItemInternalHandler,
  listImagesNeedingRatioInternalHandler,
  listReadyItemsInternalArgsValidator,
  listReadyItemsInternalHandler,
  setAspectRatioInternalArgsValidator,
  setAspectRatioInternalHandler,
  setProductsInternalArgsValidator,
  setProductsInternalHandler,
  setSpacesForItemArgsValidator,
  setSpacesForItemHandler,
  suggestItemsForSpaceArgsValidator,
  suggestItemsForSpaceHandler,
} from "./model/itemProcessing";
import {
  enrichmentValidator,
  failureReasonValidator,
  intentKindValidator,
  intentValidator,
  itemStatusValidator,
  itemTypeValidator,
  productValidator,
  productsStatusValidator,
} from "./model/itemFields";

export {
  intentKindValidator,
  intentValidator,
  productValidator,
  productsStatusValidator,
} from "./model/itemFields";

/** Practical per-query cap so a very large library can't blow the read limit. */
const LIST_CAP = 1000;

const itemFields = {
  _id: v.id("items"),
  _creationTime: v.number(),
  userId: v.string(),
  type: itemTypeValidator,
  status: itemStatusValidator,
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  url: v.optional(v.string()),
  storageId: v.optional(v.id("_storage")),
  aspectRatio: v.optional(v.number()),
  capturedAt: v.optional(v.number()),
  latitude: v.optional(v.number()),
  longitude: v.optional(v.number()),
  isSticker: v.optional(v.boolean()),
  tags: v.array(v.string()),
  content: v.optional(v.string()),
  siteName: v.optional(v.string()),
  heroImageUrl: v.optional(v.string()),
  note: v.optional(v.string()),
  intents: v.optional(v.array(intentValidator)),
  products: v.optional(v.array(productValidator)),
  productsStatus: v.optional(productsStatusValidator),
  failureReason: v.optional(failureReasonValidator),
  enrichment: v.optional(enrichmentValidator),
  searchText: v.string(),
};

// Exported so spaces.ts reuses the exact same shape — a second hand-written
// copy is how `capturedAt`/`intents` drifted out of getSpace's validator.
export const enrichedItemValidator = v.object({
  ...itemFields,
  imageUrl: v.union(v.string(), v.null()),
});

const enrichedItemWithSpacesValidator = v.object({
  ...itemFields,
  imageUrl: v.union(v.string(), v.null()),
  spaces: v.array(
    v.object({
      _id: v.id("spaces"),
      name: v.string(),
    }),
  ),
});

export async function enrichItem(ctx: QueryCtx, item: Doc<"items">) {
  const imageUrl = item.storageId
    ? await ctx.storage.getUrl(item.storageId)
    : null;
  return { ...item, imageUrl };
}

// ---------------------------------------------------------------------------
// Public queries
// ---------------------------------------------------------------------------

export const listItems = query({
  args: {},
  returns: v.array(enrichedItemValidator),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const items = await ctx.db
      .query("items")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(LIST_CAP);
    return await Promise.all(items.map((item) => enrichItem(ctx, item)));
  },
});

export const getItem = query({
  args: { id: v.id("items") },
  returns: v.union(enrichedItemWithSpacesValidator, v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const item = await ctx.db.get(args.id);
    if (item === null || item.userId !== userId) {
      return null;
    }
    const joins = await ctx.db
      .query("spaceItems")
      .withIndex("by_item", (q) => q.eq("itemId", item._id))
      .collect();
    const spaces: { _id: Id<"spaces">; name: string }[] = [];
    for (const join of joins) {
      // Only real memberships appear as chips — suggestions and dismissals
      // are space-screen concerns, not part of the item's identity.
      if (effectiveStatus(join) !== "saved") {
        continue;
      }
      const space = await ctx.db.get(join.spaceId);
      if (space !== null) {
        spaces.push({ _id: space._id, name: space.name });
      }
    }
    const enriched = await enrichItem(ctx, item);
    return { ...enriched, spaces };
  },
});

export const searchItems = query({
  args: { query: v.string() },
  returns: v.array(enrichedItemValidator),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const trimmed = args.query.trim();
    if (trimmed === "") {
      return [];
    }
    const items = await ctx.db
      .query("items")
      .withSearchIndex("search_text", (q) =>
        q.search("searchText", trimmed.toLowerCase()).eq("userId", userId),
      )
      .take(50);
    return await Promise.all(items.map((item) => enrichItem(ctx, item)));
  },
});

// Similar-items v0: lexical overlap, no new infra. Tags carry most of the
// signal (they're the classifier's own summary), searchText tokens catch the
// rest. A vector index over real embeddings replaces this in v1.
const SIMILAR_CANDIDATES = 300;
const SIMILAR_LIMIT = 10;
const SIMILAR_MIN_SCORE = 3;

function searchTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 3),
  );
}

export const similarItems = query({
  args: { id: v.id("items") },
  returns: v.array(enrichedItemValidator),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const item = await ctx.db.get(args.id);
    if (item === null || item.userId !== userId || item.status !== "ready") {
      return [];
    }
    const tags = new Set(item.tags);
    const tokens = searchTokens(item.searchText);
    if (tags.size === 0 && tokens.size === 0) {
      return [];
    }

    const candidates = await ctx.db
      .query("items")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(SIMILAR_CANDIDATES);

    const scored: { item: Doc<"items">; score: number }[] = [];
    for (const candidate of candidates) {
      if (candidate._id === item._id || candidate.status !== "ready") {
        continue;
      }
      let score = 0;
      for (const tag of candidate.tags) {
        if (tags.has(tag)) {
          score += 3;
        }
      }
      for (const token of searchTokens(candidate.searchText)) {
        if (tokens.has(token)) {
          score += 1;
        }
      }
      if (score >= SIMILAR_MIN_SCORE) {
        scored.push({ item: candidate, score });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return await Promise.all(
      scored
        .slice(0, SIMILAR_LIMIT)
        .map(({ item: match }) => enrichItem(ctx, match)),
    );
  },
});

// ---------------------------------------------------------------------------
// Public mutations
// ---------------------------------------------------------------------------

// The registered functions stay in this module so every existing
// api.items.* and internal.items.* route remains stable. Implementations live
// behind focused modules that own the import and operation state machines.

export const beginImageImport = mutation({
  args: beginImageImportArgsValidator.fields,
  returns: beginImageImportResultValidator,
  handler: beginImageImportHandler,
});

export const attachImageUpload = mutation({
  args: attachImageUploadArgsValidator.fields,
  returns: attachImageUploadResultValidator,
  handler: attachImageUploadHandler,
});

export const finalizeImageImport = mutation({
  args: finalizeImageImportArgsValidator.fields,
  returns: v.id("items"),
  handler: finalizeImageImportHandler,
});

export const getImportOperation = query({
  args: getImportOperationArgsValidator.fields,
  returns: getImportOperationResultValidator,
  handler: getImportOperationHandler,
});

export const STALE_IMPORT_CUTOFF_MS = IMPORT_STALE_CUTOFF_MS;

export const cleanupStaleImageImports = internalMutation({
  args: {},
  returns: v.null(),
  handler: cleanupStaleImageImportsHandler,
});

export const createLinkItem = mutation({
  args: {
    url: v.string(),
    spaceId: v.optional(v.id("spaces")),
    operationId: v.optional(v.string()),
  },
  returns: v.id("items"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireProEntitlement(ctx, userId);
    // Rate limiting is charged inside createItemWithOperation, after the
    // idempotent completed-operation return, so a retry of a finished share
    // isn't billed a token.
    // Centralized syntactic URL policy: rejects non-http(s) schemes, embedded
    // credentials, non-default ports, missing hosts, and oversized URLs before
    // the item is ever inserted or scheduled. Network-destination safety (private
    // IP ranges, DNS answers) is enforced later, bound to the actual connection,
    // by the safe fetcher in convex/model/safeFetch.ts.
    const url = normalizeExternalUrl(args.url);
    return await createItemWithOperation(
      ctx,
      userId,
      "link",
      { url },
      { operationId: args.operationId, spaceId: args.spaceId },
    );
  },
});

export const createNoteItem = mutation({
  args: {
    text: v.string(),
    spaceId: v.optional(v.id("spaces")),
    operationId: v.optional(v.string()),
  },
  returns: v.id("items"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireProEntitlement(ctx, userId);
    // Rate limiting is charged inside createItemWithOperation, after the
    // idempotent completed-operation return (see createLinkItem).
    return await createItemWithOperation(
      ctx,
      userId,
      "note",
      { note: args.text },
      { operationId: args.operationId, spaceId: args.spaceId },
    );
  },
});

/**
 * User-triggered product search ("Find links"). Explicit button = bounded
 * cost: one vision/text query + one SerpAPI call per press, never automatic.
 */
export const findLinks = mutation({
  args: { id: v.id("items") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireProEntitlement(ctx, userId);
    const item = await ctx.db.get(args.id);
    if (item === null || item.userId !== userId) {
      throw new Error("Item not found");
    }
    if (item.status !== "ready" || item.productsStatus === "searching") {
      return null;
    }
    await rateLimiter.limit(ctx, "findLinks", { key: userId, throws: true });
    await ctx.db.patch(item._id, { productsStatus: "searching" });
    await ctx.scheduler.runAfter(0, internal.ai.findProductLinks, {
      itemId: item._id,
    });
    return null;
  },
});

/**
 * User-triggered retry for a save whose page fetch or classification did not
 * fully succeed: a `failed` item or a `ready` one flagged `enrichment: "partial"`
 * (classified from its URL because the page body was unreadable). Re-runs the
 * same pipeline, so it is rate-limited like a create.
 *
 * A `not_found` failure is NOT retryable — the page is gone (404/410) and a
 * retry would burn a classification to reach the same conclusion.
 */
export const reprocessItem = mutation({
  args: { id: v.id("items") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireProEntitlement(ctx, userId);
    const item = await ctx.db.get(args.id);
    if (item === null || item.userId !== userId) {
      throw new Error("Item not found");
    }
    const retryable =
      (item.status === "failed" && item.failureReason !== "not_found") ||
      (item.status === "ready" && item.enrichment === "partial");
    if (!retryable) {
      return null;
    }
    await rateLimiter.limit(ctx, "reprocessItem", { key: userId, throws: true });
    await ctx.db.patch(args.id, {
      status: "processing",
      failureReason: undefined,
      // Dropped up front so an in-flight retry — and a retry that fails again —
      // never carries the previous run's "partial" marker.
      enrichment: undefined,
    });
    await ctx.scheduler.runAfter(0, internal.ai.processItem, {
      itemId: args.id,
    });
    return null;
  },
});

export const deleteItem = mutation({
  args: { id: v.id("items") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const item = await ctx.db.get(args.id);
    if (item === null || item.userId !== userId) {
      throw new Error("Item not found");
    }
    const joins = await ctx.db
      .query("spaceItems")
      .withIndex("by_item", (q) => q.eq("itemId", item._id))
      .collect();
    for (const join of joins) {
      await ctx.db.delete(join._id);
    }
    // Release the import operation(s) that produced this item so a durable
    // operationId can be re-performed after an explicit delete (Tidy undo).
    // Pending rows have no itemId and are excluded by the index; this only
    // touches completed operations whose result was this item. AI processing
    // failures do NOT release the operation — the item still exists.
    const operations = await ctx.db
      .query("itemOperations")
      .withIndex("by_item", (q) => q.eq("itemId", item._id))
      .collect();
    for (const op of operations) {
      await ctx.db.delete(op._id);
    }
    if (item.storageId) {
      // Existence-checked: if the blob is somehow already gone, the delete must
      // still remove the item rather than throw and leave it undeletable.
      await safeDeleteStorage(ctx, item.storageId);
    }
    await ctx.db.delete(item._id);
    return null;
  },
});

// ---------------------------------------------------------------------------
// Internal AI collaborators — stable routes, focused implementations
// ---------------------------------------------------------------------------

export const getItemInternal = internalQuery({
  args: getItemInternalArgsValidator.fields,
  returns: v.union(v.object(itemFields), v.null()),
  handler: getItemInternalHandler,
});

export const listReadyItemsInternal = internalQuery({
  args: listReadyItemsInternalArgsValidator.fields,
  returns: v.array(v.object(itemFields)),
  handler: listReadyItemsInternalHandler,
});

export const finalizeItem = internalMutation({
  args: finalizeItemArgsValidator.fields,
  returns: v.null(),
  handler: finalizeItemHandler,
});

export const listImagesNeedingRatioInternal = internalQuery({
  args: {},
  returns: v.array(v.object({ _id: v.id("items"), storageId: v.id("_storage") })),
  handler: listImagesNeedingRatioInternalHandler,
});

export const setAspectRatioInternal = internalMutation({
  args: setAspectRatioInternalArgsValidator.fields,
  returns: v.null(),
  handler: setAspectRatioInternalHandler,
});

export const setProductsInternal = internalMutation({
  args: setProductsInternalArgsValidator.fields,
  returns: v.null(),
  handler: setProductsInternalHandler,
});

export const failItem = internalMutation({
  args: failItemArgsValidator.fields,
  returns: v.null(),
  handler: failItemHandler,
});

export const setSpacesForItem = internalMutation({
  args: setSpacesForItemArgsValidator.fields,
  returns: v.null(),
  handler: setSpacesForItemHandler,
});

export const suggestItemsForSpace = internalMutation({
  args: suggestItemsForSpaceArgsValidator.fields,
  returns: v.null(),
  handler: suggestItemsForSpaceHandler,
});
