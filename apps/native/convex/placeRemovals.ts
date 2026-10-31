import { v } from "convex/values";
import { authedMutation } from "./model/auth";
import { cityKey } from "./model/trip";
import { removalArea, visibleSave } from "./model/placeRemovals";
import { rateLimiter } from "./model/rateLimiter";
import { requireProEntitlement } from "./subscriptions";

export const removePlace = authedMutation({
  args: {
    itemId: v.id("items"),
    name: v.string(),
    lat: v.number(),
    lng: v.number(),
    appleId: v.optional(v.string()),
  },
  returns: v.id("placeRemovals"),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item || item.userId !== ctx.userId) throw new Error("Item not found");
    await requireProEntitlement(ctx, ctx.userId);
    const projected = await visibleSave(ctx, item);
    const selected = projected.placePins?.find(
      (pin) =>
        pin.name === args.name &&
        pin.lat === args.lat &&
        pin.lng === args.lng &&
        (!pin.appleId || !args.appleId || pin.appleId === args.appleId),
    );
    if (!selected) throw new Error("Place not found");
    const city =
      selected.city ?? (item.cities?.length === 1 ? item.cities[0] : undefined);
    if (!city) throw new Error("Place city required");
    await rateLimiter.limit(ctx, "placeVisit", {
      key: ctx.userId,
      throws: true,
    });
    return await ctx.db.insert("placeRemovals", {
      userId: ctx.userId,
      name: selected.name,
      area: removalArea(item, selected.name, city),
      city: cityKey(city),
      lat: selected.lat,
      lng: selected.lng,
      ...(args.appleId
        ? { appleId: args.appleId }
        : selected.appleId
          ? { appleId: selected.appleId }
          : {}),
    });
  },
});

export const undoRemovePlace = authedMutation({
  args: { removalId: v.id("placeRemovals") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.removalId);
    if (row?.userId === ctx.userId) await ctx.db.delete(row._id);
    return null;
  },
});
