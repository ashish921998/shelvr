import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getUserId, requireUserId } from "./model/auth";

const itemTypeValidator = v.union(
  v.literal("link"),
  v.literal("image"),
  v.literal("note"),
);

const itemStatusValidator = v.union(
  v.literal("processing"),
  v.literal("ready"),
  v.literal("failed"),
);

const itemValidator = v.object({
  _id: v.id("items"),
  _creationTime: v.number(),
  userId: v.string(),
  type: itemTypeValidator,
  status: itemStatusValidator,
  url: v.optional(v.string()),
  note: v.optional(v.string()),
  storageId: v.optional(v.id("_storage")),
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  extractedText: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  imageAspectRatio: v.optional(v.number()),
  error: v.optional(v.string()),
  searchText: v.optional(v.string()),
  /** Resolved storage URL for image items (never stored). */
  resolvedImageUrl: v.union(v.string(), v.null()),
  spaceIds: v.array(v.id("spaces")),
});

const readyItemPreviewValidator = v.object({
  _id: v.id("items"),
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  type: itemTypeValidator,
  url: v.optional(v.string()),
  note: v.optional(v.string()),
  extractedText: v.optional(v.string()),
});

async function enrichItem(
  ctx: QueryCtx | MutationCtx,
  item: Doc<"items">,
) {
  const spaceLinks = await ctx.db
    .query("spaceItems")
    .withIndex("by_item", (q) => q.eq("itemId", item._id))
    .take(100);

  const resolvedImageUrl = item.storageId
    ? await ctx.storage.getUrl(item.storageId)
    : (item.imageUrl ?? null);

  return {
    ...item,
    resolvedImageUrl,
    spaceIds: spaceLinks.map((link) => link.spaceId),
  };
}

function assertHttpUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Link items require a valid http(s) URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Link items require a valid http(s) URL");
  }
  return url.toString();
}

async function deleteAllLinksForItem(ctx: MutationCtx, itemId: Id<"items">) {
  for (;;) {
    const batch = await ctx.db
      .query("spaceItems")
      .withIndex("by_item", (q) => q.eq("itemId", itemId))
      .take(500);

    if (batch.length === 0) break;
    for (const link of batch) {
      await ctx.db.delete(link._id);
    }
    if (batch.length < 500) break;
  }
}

/** Generate a short-lived upload URL for image items. */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** List the current user's items, newest first. */
export const listItems = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(itemValidator),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (!userId) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const result = await ctx.db
      .query("items")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...result,
      page: await Promise.all(result.page.map((item) => enrichItem(ctx, item))),
    };
  },
});

/** Get a single item owned by the current user. */
export const getItem = query({
  args: {
    itemId: v.id("items"),
  },
  returns: v.union(itemValidator, v.null()),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (!userId) return null;

    const item = await ctx.db.get(args.itemId);
    if (!item || item.userId !== userId) return null;

    return await enrichItem(ctx, item);
  },
});

/** Full-text search over the current user's items. */
export const searchItems = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(itemValidator),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];

    const q = args.query.trim();
    if (!q) return [];

    const limit = Math.min(args.limit ?? 30, 50);
    const hits = await ctx.db
      .query("items")
      .withSearchIndex("search_text", (search) =>
        search.search("searchText", q).eq("userId", userId),
      )
      .take(limit);

    return await Promise.all(hits.map((item) => enrichItem(ctx, item)));
  },
});

/**
 * Create a captured item (link, image, or note). Inserts as `processing`
 * and schedules the AI classification pipeline.
 */
export const createItem = mutation({
  args: {
    type: itemTypeValidator,
    url: v.optional(v.string()),
    note: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
  },
  returns: v.id("items"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    let url: string | undefined;
    if (args.type === "link") {
      if (!args.url?.trim()) {
        throw new Error("Link items require a url");
      }
      url = assertHttpUrl(args.url.trim());
    } else if (args.url?.trim()) {
      url = args.url.trim();
    }

    if (args.type === "note" && !args.note?.trim()) {
      throw new Error("Note items require note text");
    }
    if (args.type === "image" && !args.storageId) {
      throw new Error("Image items require a storageId");
    }

    const itemId = await ctx.db.insert("items", {
      userId,
      type: args.type,
      status: "processing",
      url,
      note: args.note?.trim(),
      storageId: args.storageId,
      searchText: [url, args.note].filter(Boolean).join(" "),
    });

    await ctx.scheduler.runAfter(0, internal.ai.processItem, { itemId });
    return itemId;
  },
});

/** Delete an item and its space memberships. */
export const deleteItem = mutation({
  args: {
    itemId: v.id("items"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const item = await ctx.db.get(args.itemId);

    if (!item) throw new Error(`Item '${args.itemId}' could not be found`);
    if (item.userId !== userId) {
      throw new Error(`User '${userId}' cannot delete item '${args.itemId}'`);
    }

    await deleteAllLinksForItem(ctx, args.itemId);

    if (item.storageId) {
      await ctx.storage.delete(item.storageId);
    }

    await ctx.db.delete(args.itemId);
    return null;
  },
});

// ── Internal helpers used by the AI pipeline ──────────────────────────────

export const getItemInternal = internalQuery({
  args: { itemId: v.id("items") },
  returns: v.union(
    v.object({
      _id: v.id("items"),
      _creationTime: v.number(),
      userId: v.string(),
      type: itemTypeValidator,
      status: itemStatusValidator,
      url: v.optional(v.string()),
      note: v.optional(v.string()),
      storageId: v.optional(v.id("_storage")),
      title: v.optional(v.string()),
      description: v.optional(v.string()),
      tags: v.optional(v.array(v.string())),
      extractedText: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
      imageAspectRatio: v.optional(v.number()),
      error: v.optional(v.string()),
      searchText: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.itemId);
  },
});

export const listUserSpacesInternal = internalQuery({
  args: { userId: v.string() },
  returns: v.array(
    v.object({
      _id: v.id("spaces"),
      name: v.string(),
      description: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const spaces = await ctx.db
      .query("spaces")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(200);

    return spaces.map((s) => ({
      _id: s._id,
      name: s.name,
      description: s.description,
    }));
  },
});

export const finalizeItem = internalMutation({
  args: {
    itemId: v.id("items"),
    title: v.string(),
    description: v.string(),
    tags: v.array(v.string()),
    extractedText: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    imageAspectRatio: v.optional(v.number()),
    spaceIds: v.array(v.id("spaces")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) return null;

    const searchText = [
      args.title,
      args.description,
      ...args.tags,
      args.extractedText,
      item.url,
      item.note,
    ]
      .filter(Boolean)
      .join(" ");

    await ctx.db.patch(args.itemId, {
      status: "ready",
      title: args.title,
      description: args.description,
      tags: args.tags,
      extractedText: args.extractedText,
      imageUrl: args.imageUrl,
      imageAspectRatio: args.imageAspectRatio,
      searchText,
      error: undefined,
    });

    // Union AI space suggestions with any memberships added while processing.
    // Never wipe manual links the user already created.
    const existing = await ctx.db
      .query("spaceItems")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .take(200);
    const existingIds = new Set(existing.map((link) => link.spaceId));

    const uniqueSpaceIds = [...new Set(args.spaceIds)];
    for (const spaceId of uniqueSpaceIds) {
      if (existingIds.has(spaceId)) continue;

      const space = await ctx.db.get(spaceId);
      if (!space || space.userId !== item.userId) continue;

      await ctx.db.insert("spaceItems", {
        userId: item.userId,
        spaceId,
        itemId: args.itemId,
      });
    }

    return null;
  },
});

export const markItemFailed = internalMutation({
  args: {
    itemId: v.id("items"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) return null;

    await ctx.db.patch(args.itemId, {
      status: "failed",
      error: args.error,
      title: item.title ?? fallbackTitle(item),
      description: item.description ?? "Processing failed.",
      tags: item.tags ?? [],
    });
    return null;
  },
});

/** Paginated ready-item catalog for new-space reclassification. */
export const listReadyItemsPage = internalQuery({
  args: {
    userId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(readyItemPreviewValidator),
  handler: async (ctx, args) => {
    // Paginate the user's items, then keep only ready ones. Callers loop until
    // isDone so older ready items are not dropped by a fixed take() window.
    const result = await ctx.db
      .query("items")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...result,
      page: result.page
        .filter((item) => item.status === "ready")
        .map((item) => ({
          _id: item._id,
          title: item.title,
          description: item.description,
          tags: item.tags,
          type: item.type,
          url: item.url,
          note: item.note,
          extractedText: item.extractedText,
        })),
    };
  },
});

export const linkItemToSpaceInternal = internalMutation({
  args: {
    userId: v.string(),
    spaceId: v.id("spaces"),
    itemId: v.id("items"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const space = await ctx.db.get(args.spaceId);
    if (!space || space.userId !== args.userId) return null;

    const item = await ctx.db.get(args.itemId);
    if (!item || item.userId !== args.userId) return null;

    const existing = await ctx.db
      .query("spaceItems")
      .withIndex("by_space_and_item", (q) =>
        q.eq("spaceId", args.spaceId).eq("itemId", args.itemId),
      )
      .unique();

    if (existing) return null;

    await ctx.db.insert("spaceItems", {
      userId: args.userId,
      spaceId: args.spaceId,
      itemId: args.itemId,
    });
    return null;
  },
});

function fallbackTitle(item: Doc<"items">): string {
  if (item.type === "link" && item.url) {
    try {
      return new URL(item.url).hostname;
    } catch {
      return item.url;
    }
  }
  if (item.type === "note" && item.note) {
    return item.note.slice(0, 60);
  }
  return "Untitled";
}

// Re-export Id type helper for consumers that only need the shape
export type ItemId = Id<"items">;
