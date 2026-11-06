import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { authedMutation, authedQuery } from "./model/auth";
import { isBeenCityId } from "./model/beenCities";
import { logEvent } from "./model/log";
import { rateLimiter } from "./model/rateLimiter";

const MAX_BEEN_ROWS = 100;

const MAX_CHANGES = 50;

async function findBeenCity(
  ctx: QueryCtx,
  userId: Id<"users">,
  cityId: string,
): Promise<Doc<"beenCities"> | null> {
  return await ctx.db
    .query("beenCities")
    .withIndex("by_user_and_city", (q) =>
      q.eq("userId", userId).eq("cityId", cityId),
    )
    .first();
}

export const listBeenCities = authedQuery({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx): Promise<string[]> => {
    const rows = await ctx.db
      .query("beenCities")
      .withIndex("by_user_and_city", (q) => q.eq("userId", ctx.userId))
      .take(MAX_BEEN_ROWS);
    return rows.map((row) => row.cityId).filter(isBeenCityId);
  },
});

export const updateBeenCities = authedMutation({
  args: {
    add: v.optional(v.array(v.string())),
    remove: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const add = args.add ?? [];
    const remove = args.remove ?? [];
    if (add.length + remove.length > MAX_CHANGES) {
      throw new Error("Too many cities");
    }
    await rateLimiter.limit(ctx, "beenCityEdit", {
      key: ctx.userId,
      throws: true,
    });
    const unknown = [...add, ...remove].filter((id) => !isBeenCityId(id));
    if (unknown.length > 0) {
      logEvent("warn", "been_city_unknown", { count: unknown.length });
    }
    const removing = new Set(remove.filter(isBeenCityId));
    for (const cityId of removing) {
      const row = await findBeenCity(ctx, ctx.userId, cityId);
      if (row !== null) await ctx.db.delete(row._id);
    }
    for (const cityId of new Set(add.filter(isBeenCityId))) {
      if (removing.has(cityId)) continue;
      if ((await findBeenCity(ctx, ctx.userId, cityId)) === null) {
        await ctx.db.insert("beenCities", { userId: ctx.userId, cityId });
      }
    }
    return null;
  },
});
