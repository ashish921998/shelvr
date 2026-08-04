import { v } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getUserId, requireUserId } from "./model/auth";

const spaceValidator = v.object({
  _id: v.id("spaces"),
  _creationTime: v.number(),
  userId: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  color: v.optional(v.string()),
  itemCount: v.number(),
});

const itemPreviewValidator = v.object({
  _id: v.id("items"),
  _creationTime: v.number(),
  type: v.union(v.literal("link"), v.literal("image"), v.literal("note")),
  status: v.union(
    v.literal("processing"),
    v.literal("ready"),
    v.literal("failed"),
  ),
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  url: v.optional(v.string()),
  note: v.optional(v.string()),
  resolvedImageUrl: v.union(v.string(), v.null()),
  imageAspectRatio: v.optional(v.number()),
});

async function countSpaceItems(
  ctx: { db: QueryCtx["db"] },
  spaceId: Id<"spaces">,
) {
  // Soft cap for UI display; spaces with more still work, count may plateau.
  const links = await ctx.db
    .query("spaceItems")
    .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
    .take(500);
  return links.length;
}

async function deleteAllLinksForSpace(
  ctx: MutationCtx,
  spaceId: Id<"spaces">,
) {
  for (;;) {
    const batch = await ctx.db
      .query("spaceItems")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .take(500);
    if (batch.length === 0) break;
    for (const link of batch) {
      await ctx.db.delete(link._id);
    }
    if (batch.length < 500) break;
  }
}

/** List spaces for the current user. */
export const listSpaces = query({
  args: {},
  returns: v.array(spaceValidator),
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];

    const spaces = await ctx.db
      .query("spaces")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(200);

    return await Promise.all(
      spaces.map(async (space) => ({
        ...space,
        itemCount: await countSpaceItems(ctx, space._id),
      })),
    );
  },
});

/** Get a single space owned by the current user. */
export const getSpace = query({
  args: { spaceId: v.id("spaces") },
  returns: v.union(spaceValidator, v.null()),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (!userId) return null;

    const space = await ctx.db.get(args.spaceId);
    if (!space || space.userId !== userId) return null;

    return {
      ...space,
      itemCount: await countSpaceItems(ctx, space._id),
    };
  },
});

/** List items in a space (owned by current user). */
export const listSpaceItems = query({
  args: { spaceId: v.id("spaces") },
  returns: v.array(itemPreviewValidator),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];

    const space = await ctx.db.get(args.spaceId);
    if (!space || space.userId !== userId) return [];

    const links = await ctx.db
      .query("spaceItems")
      .withIndex("by_space", (q) => q.eq("spaceId", args.spaceId))
      .order("desc")
      .take(200);

    const items = [];
    for (const link of links) {
      const item = await ctx.db.get(link.itemId);
      if (!item || item.userId !== userId) continue;

      const resolvedImageUrl = item.storageId
        ? await ctx.storage.getUrl(item.storageId)
        : (item.imageUrl ?? null);

      items.push({
        _id: item._id,
        _creationTime: item._creationTime,
        type: item.type,
        status: item.status,
        title: item.title,
        description: item.description,
        tags: item.tags,
        url: item.url,
        note: item.note,
        resolvedImageUrl,
        imageAspectRatio: item.imageAspectRatio,
      });
    }

    return items;
  },
});

/**
 * Create a space. Schedules retroactive reclassification so existing items
 * that match the new space are pulled in.
 */
export const createSpace = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  returns: v.id("spaces"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const name = args.name.trim();
    if (!name) throw new Error("Space name is required");

    const existing = await ctx.db
      .query("spaces")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(200);

    if (existing.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`You already have a space named "${name}"`);
    }

    const spaceId = await ctx.db.insert("spaces", {
      userId,
      name,
      description: args.description?.trim(),
      color: args.color,
    });

    await ctx.scheduler.runAfter(0, internal.ai.reclassifyForNewSpace, {
      spaceId,
    });

    return spaceId;
  },
});

/** Update a space's name/description/color. */
export const updateSpace = mutation({
  args: {
    spaceId: v.id("spaces"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const space = await ctx.db.get(args.spaceId);

    if (!space) throw new Error(`Space '${args.spaceId}' could not be found`);
    if (space.userId !== userId) {
      throw new Error(`User '${userId}' cannot update space '${args.spaceId}'`);
    }

    const patch: {
      name?: string;
      description?: string;
      color?: string;
    } = {};

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Space name is required");

      const siblings = await ctx.db
        .query("spaces")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(200);

      if (
        siblings.some(
          (s) =>
            s._id !== args.spaceId &&
            s.name.toLowerCase() === name.toLowerCase(),
        )
      ) {
        throw new Error(`You already have a space named "${name}"`);
      }

      patch.name = name;
    }
    if (args.description !== undefined) {
      patch.description = args.description.trim();
    }
    if (args.color !== undefined) {
      patch.color = args.color;
    }

    await ctx.db.patch(args.spaceId, patch);
    return null;
  },
});

/** Delete a space and its membership rows (items are kept). */
export const deleteSpace = mutation({
  args: { spaceId: v.id("spaces") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const space = await ctx.db.get(args.spaceId);

    if (!space) throw new Error(`Space '${args.spaceId}' could not be found`);
    if (space.userId !== userId) {
      throw new Error(`User '${userId}' cannot delete space '${args.spaceId}'`);
    }

    await deleteAllLinksForSpace(ctx, args.spaceId);
    await ctx.db.delete(args.spaceId);
    return null;
  },
});

/** Manually add an item to a space. */
export const addItemToSpace = mutation({
  args: {
    spaceId: v.id("spaces"),
    itemId: v.id("items"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const space = await ctx.db.get(args.spaceId);
    if (!space || space.userId !== userId) {
      throw new Error("Space not found");
    }

    const item = await ctx.db.get(args.itemId);
    if (!item || item.userId !== userId) {
      throw new Error("Item not found");
    }

    const existing = await ctx.db
      .query("spaceItems")
      .withIndex("by_space_and_item", (q) =>
        q.eq("spaceId", args.spaceId).eq("itemId", args.itemId),
      )
      .unique();

    if (existing) return null;

    await ctx.db.insert("spaceItems", {
      userId,
      spaceId: args.spaceId,
      itemId: args.itemId,
    });
    return null;
  },
});

/** Remove an item from a space. */
export const removeItemFromSpace = mutation({
  args: {
    spaceId: v.id("spaces"),
    itemId: v.id("items"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const link = await ctx.db
      .query("spaceItems")
      .withIndex("by_space_and_item", (q) =>
        q.eq("spaceId", args.spaceId).eq("itemId", args.itemId),
      )
      .unique();

    if (!link) return null;
    if (link.userId !== userId) {
      throw new Error("Not authorized");
    }

    await ctx.db.delete(link._id);
    return null;
  },
});
