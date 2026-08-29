import { v, type Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { effectiveStatus } from "./memberships";

/** Validates classifier-selected spaces for one processed item. */
export const setSpacesForItemArgsValidator = v.object({
  itemId: v.id("items"),
  spaceIds: v.array(v.id("spaces")),
});

/** Validates recommended item IDs for one space. */
export const suggestItemsForSpaceArgsValidator = v.object({
  spaceId: v.id("spaces"),
  itemIds: v.array(v.id("items")),
});

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
  const existingItemIds = new Set(
    existing.map((membership) => membership.itemId),
  );
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
