import { v } from "convex/values";
import { authedMutation } from "./model/auth";
import { MAX_PLACE_NAME_CHARS, placeKey, splitSavedPlace } from "./model/plan";
import { findVisit } from "./model/placeVisits";
import { rateLimiter } from "./model/rateLimiter";
import { requireProEntitlement } from "./subscriptions";
import { readySavesNewestFirst } from "./items";
import { uniquePlacePins } from "./model/trip";

/** Remove all currently visible copies of the selected venue without deleting its saves. */
export const removePlace = authedMutation({
  args: {
    itemId: v.id("items"),
    name: v.string(),
    lat: v.number(),
    lng: v.number(),
    appleId: v.optional(v.string()),
    operationId: v.string(),
  },
  returns: v.array(v.id("items")),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item || item.userId !== ctx.userId) throw new Error("Item not found");
    await requireProEntitlement(ctx, ctx.userId);
    if (!args.operationId || args.operationId.length > 100)
      throw new Error("Invalid operation");
    const selected = item.placePins?.find(
      (pin) =>
        pin.name === args.name &&
        pin.lat === args.lat &&
        pin.lng === args.lng &&
        (!args.appleId || !pin.appleId || args.appleId === pin.appleId),
    );
    if (!selected) throw new Error("Place not found");
    await rateLimiter.limit(ctx, "placeVisit", {
      key: ctx.userId,
      throws: true,
    });
    const affected = [];
    for (const save of await readySavesNewestFirst(ctx, ctx.userId)) {
      const matches =
        save.placePins?.filter(
          (pin) => uniquePlacePins([selected, pin]).length === 1,
        ) ?? [];
      if (!matches.length) continue;
      if ((save.removedPlaces?.length ?? 0) + matches.length > 300)
        throw new Error("Too many removed places in this save");
      await ctx.db.patch(save._id, {
        removedPlaces: [
          ...(save.removedPlaces ?? []),
          ...matches.map((pin) => ({
            name: pin.name,
            lat: pin.lat,
            lng: pin.lng,
            ...(pin.appleId ? { appleId: pin.appleId } : {}),
            key: placeKey(splitSavedPlace(pin.name).name),
            operationId: args.operationId,
          })),
        ],
      });
      affected.push(save._id);
    }
    return affected;
  },
});

export const undoRemovePlace = authedMutation({
  args: { itemIds: v.array(v.id("items")), operationId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.itemIds.length > 3000) throw new Error("Too many saves");
    for (const itemId of args.itemIds) {
      const item = await ctx.db.get(itemId);
      if (!item || item.userId !== ctx.userId) continue;
      await ctx.db.patch(itemId, {
        removedPlaces: item.removedPlaces?.filter(
          (entry) => entry.operationId !== args.operationId,
        ),
      });
    }
    return null;
  },
});

export const setVisited = authedMutation({
  args: { itemId: v.id("items"), name: v.string(), visited: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const item = await ctx.db.get(args.itemId);
    if (item === null || item.userId !== userId) {
      throw new Error("Item not found");
    }
    await requireProEntitlement(ctx, userId);
    const key = placeKey(args.name);
    if (key === "") {
      throw new Error("Place name is empty");
    }
    await rateLimiter.limit(ctx, "placeVisit", { key: userId, throws: true });
    const existing = await findVisit(ctx, userId, args.name);
    if (!args.visited) {
      if (existing !== null) await ctx.db.delete(existing._id);
      return null;
    }
    const visit = {
      name: args.name
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_PLACE_NAME_CHARS),
      itemId: args.itemId,
      visitedAt: Date.now(),
    };
    if (existing === null) {
      await ctx.db.insert("placeVisits", { userId, key, ...visit });
    } else {
      await ctx.db.patch(existing._id, visit);
    }
    return null;
  },
});
