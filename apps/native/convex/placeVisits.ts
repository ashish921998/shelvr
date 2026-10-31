import { v } from "convex/values";
import { authedMutation } from "./model/auth";
import { MAX_PLACE_NAME_CHARS, placeKey } from "./model/plan";
import { findVisit } from "./model/placeVisits";
import { rateLimiter } from "./model/rateLimiter";
import { requireProEntitlement } from "./subscriptions";

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
