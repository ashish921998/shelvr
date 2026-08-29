import { v, type Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

const LIST_CAP = 1000;

/** Validates the item ID used by internal item lookup. */
export const getItemInternalArgsValidator = v.object({
  itemId: v.id("items"),
});

/** Validates the owner and bounded result limit for internal ready-item listing. */
export const listReadyItemsInternalArgsValidator = v.object({
  userId: v.string(),
  limit: v.number(),
});

/** Read one item without applying owner filtering for internal processing only. */
export async function getItemInternalHandler(
  ctx: QueryCtx,
  args: Infer<typeof getItemInternalArgsValidator>,
) {
  return await ctx.db.get(args.itemId);
}

/** List an owner's newest ready items for internal recommendation work. */
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

/** List at most 1,000 stored images whose aspect ratio still needs backfilling. */
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
