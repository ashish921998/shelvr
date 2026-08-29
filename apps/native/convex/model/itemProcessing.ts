import { v, type Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  enrichmentValidator,
  failureReasonValidator,
  intentValidator,
  itemStatusValidator,
  productValidator,
  productsStatusValidator,
} from "./itemFields";
import { effectiveStatus } from "./memberships";

const LIST_CAP = 1000;

export const getItemInternalArgsValidator = v.object({
  itemId: v.id("items"),
});

export const listReadyItemsInternalArgsValidator = v.object({
  userId: v.string(),
  limit: v.number(),
});

export const finalizeItemArgsValidator = v.object({
  itemId: v.id("items"),
  title: v.string(),
  description: v.string(),
  tags: v.array(v.string()),
  content: v.optional(v.string()),
  siteName: v.optional(v.string()),
  heroImageUrl: v.optional(v.string()),
  aspectRatio: v.optional(v.number()),
  intents: v.optional(v.array(intentValidator)),
  status: itemStatusValidator,
  enrichment: v.optional(enrichmentValidator),
});

export const setAspectRatioInternalArgsValidator = v.object({
  itemId: v.id("items"),
  aspectRatio: v.number(),
});

export const setProductsInternalArgsValidator = v.object({
  itemId: v.id("items"),
  products: v.optional(v.array(productValidator)),
  productsStatus: productsStatusValidator,
});

export const failItemArgsValidator = v.object({
  itemId: v.id("items"),
  reason: failureReasonValidator,
});

export const setSpacesForItemArgsValidator = v.object({
  itemId: v.id("items"),
  spaceIds: v.array(v.id("spaces")),
});

export const suggestItemsForSpaceArgsValidator = v.object({
  spaceId: v.id("spaces"),
  itemIds: v.array(v.id("items")),
});

function buildSearchText(parts: {
  title?: string;
  description?: string;
  tags: string[];
  siteName?: string;
}): string {
  return [parts.title, parts.description, ...parts.tags, parts.siteName]
    .filter((part): part is string =>
      typeof part === "string" && part.length > 0
    )
    .join(" ")
    .toLowerCase();
}

export async function getItemInternalHandler(
  ctx: QueryCtx,
  args: Infer<typeof getItemInternalArgsValidator>,
) {
  return await ctx.db.get(args.itemId);
}

export async function listReadyItemsInternalHandler(
  ctx: QueryCtx,
  args: Infer<typeof listReadyItemsInternalArgsValidator>,
) {
  const limit = Math.min(Math.max(1, Math.floor(args.limit)), 200);
  const items = await ctx.db
    .query("items")
    .withIndex("by_user", (query) => query.eq("userId", args.userId))
    .order("desc")
    .take(limit * 2);
  return items.filter((item) => item.status === "ready").slice(0, limit);
}

export async function finalizeItemHandler(
  ctx: MutationCtx,
  args: Infer<typeof finalizeItemArgsValidator>,
): Promise<null> {
  const item = await ctx.db.get(args.itemId);
  if (item === null) return null;

  const searchText = buildSearchText({
    title: args.title,
    description: args.description,
    tags: args.tags,
    siteName: args.siteName,
  });
  await ctx.db.patch(args.itemId, {
    title: args.title,
    description: args.description,
    tags: args.tags,
    content: args.content,
    siteName: args.siteName,
    heroImageUrl: args.heroImageUrl,
    aspectRatio: args.aspectRatio,
    intents: args.intents,
    status: args.status,
    enrichment: args.enrichment,
    failureReason: undefined,
    searchText,
  });
  return null;
}

export async function listImagesNeedingRatioInternalHandler(
  ctx: QueryCtx,
): Promise<{ _id: Id<"items">; storageId: Id<"_storage"> }[]> {
  const items = await ctx.db.query("items").take(LIST_CAP);
  const targets: { _id: Id<"items">; storageId: Id<"_storage"> }[] = [];
  for (const item of items) {
    if (
      item.type === "image" &&
      item.storageId !== undefined &&
      item.aspectRatio === undefined
    ) {
      targets.push({ _id: item._id, storageId: item.storageId });
    }
  }
  return targets;
}

export async function setAspectRatioInternalHandler(
  ctx: MutationCtx,
  args: Infer<typeof setAspectRatioInternalArgsValidator>,
): Promise<null> {
  const item = await ctx.db.get(args.itemId);
  if (item === null) return null;
  await ctx.db.patch(args.itemId, { aspectRatio: args.aspectRatio });
  return null;
}

export async function setProductsInternalHandler(
  ctx: MutationCtx,
  args: Infer<typeof setProductsInternalArgsValidator>,
): Promise<null> {
  const item = await ctx.db.get(args.itemId);
  if (item === null) return null;
  await ctx.db.patch(args.itemId, {
    ...(args.products !== undefined ? { products: args.products } : {}),
    productsStatus: args.productsStatus,
  });
  return null;
}

export async function failItemHandler(
  ctx: MutationCtx,
  args: Infer<typeof failItemArgsValidator>,
): Promise<null> {
  const item = await ctx.db.get(args.itemId);
  if (item === null) return null;
  await ctx.db.patch(args.itemId, {
    status: "failed",
    failureReason: args.reason,
  });
  return null;
}

/** Apply classifier suggestions without overwriting user-owned memberships. */
export async function setSpacesForItemHandler(
  ctx: MutationCtx,
  args: Infer<typeof setSpacesForItemArgsValidator>,
): Promise<null> {
  const item = await ctx.db.get(args.itemId);
  if (item === null) return null;

  const wanted = new Set(args.spaceIds);
  const existing = await ctx.db
    .query("spaceItems")
    .withIndex("by_item", (query) => query.eq("itemId", args.itemId))
    .collect();
  const touched = new Set<Id<"spaces">>();
  for (const membership of existing) {
    touched.add(membership.spaceId);
    if (
      effectiveStatus(membership) === "suggested" &&
      !wanted.has(membership.spaceId)
    ) {
      await ctx.db.delete(membership._id);
    }
  }

  for (const spaceId of wanted) {
    if (touched.has(spaceId)) continue;
    const space = await ctx.db.get(spaceId);
    if (
      space !== null &&
      space.userId === item.userId &&
      space.dynamic === true
    ) {
      await ctx.db.insert("spaceItems", {
        userId: item.userId,
        spaceId,
        itemId: args.itemId,
        status: "suggested",
      });
    }
  }
  return null;
}

/** Add recommendations for one space without reviving user decisions. */
export async function suggestItemsForSpaceHandler(
  ctx: MutationCtx,
  args: Infer<typeof suggestItemsForSpaceArgsValidator>,
): Promise<null> {
  const space = await ctx.db.get(args.spaceId);
  if (space === null) return null;

  const existing = await ctx.db
    .query("spaceItems")
    .withIndex("by_space", (query) => query.eq("spaceId", args.spaceId))
    .collect();
  const existingItemIds = new Set(existing.map((membership) => membership.itemId));
  const uniqueItemIds = [...new Set(args.itemIds)];
  for (const itemId of uniqueItemIds) {
    if (existingItemIds.has(itemId)) continue;
    const item = await ctx.db.get(itemId);
    if (item !== null && item.userId === space.userId) {
      await ctx.db.insert("spaceItems", {
        userId: space.userId,
        spaceId: args.spaceId,
        itemId,
        status: "suggested",
      });
    }
  }
  return null;
}
