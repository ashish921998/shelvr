import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { authedMutation, authedQuery } from "./model/auth";
import {
  CITY_STAMP_CITIES,
  type CityStampId,
  isCityStampId,
  MAX_ONBOARDING_CITY_STAMPS,
} from "./model/cityStamps";
import { logEvent } from "./model/log";
import { rateLimiter } from "./model/rateLimiter";
import { hasProEntitlement, requireProEntitlement } from "./subscriptions";

const MAX_CITY_STAMP_ROWS = 100;

async function findCityStamp(
  ctx: QueryCtx,
  userId: Id<"users">,
  city: string,
): Promise<Doc<"cityStamps"> | null> {
  return await ctx.db
    .query("cityStamps")
    .withIndex("by_user_and_city", (q) =>
      q.eq("userId", userId).eq("city", city),
    )
    .first();
}

async function insertCityStamp(
  ctx: MutationCtx,
  userId: Id<"users">,
  city: CityStampId,
): Promise<void> {
  await ctx.db.insert("cityStamps", {
    userId,
    city,
    country: CITY_STAMP_CITIES[city].country,
    stampedAt: Date.now(),
  });
}

async function editAllowed(ctx: MutationCtx, userId: Id<"users">) {
  await rateLimiter.limit(ctx, "cityStampEdit", { key: userId, throws: true });
}

export const listCityStamps = authedQuery({
  args: {},
  returns: v.array(
    v.object({
      city: v.string(),
      country: v.string(),
      stampedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("cityStamps")
      .withIndex("by_user_and_city", (q) => q.eq("userId", ctx.userId))
      .take(MAX_CITY_STAMP_ROWS);
    return rows
      .filter((row) => isCityStampId(row.city))
      .map(({ city, country, stampedAt }) => ({ city, country, stampedAt }));
  },
});

export const addCityStamp = authedMutation({
  args: { city: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { city }) => {
    if (!isCityStampId(city)) throw new Error("Unknown city");
    await requireProEntitlement(ctx, ctx.userId);
    await editAllowed(ctx, ctx.userId);
    if ((await findCityStamp(ctx, ctx.userId, city)) !== null) return false;
    await insertCityStamp(ctx, ctx.userId, city);
    return true;
  },
});

export const removeCityStamp = authedMutation({
  args: { city: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { city }) => {
    await editAllowed(ctx, ctx.userId);
    const row = await findCityStamp(ctx, ctx.userId, city);
    if (row === null) return false;
    await ctx.db.delete(row._id);
    return true;
  },
});

export const claimOnboardingCityStamps = authedMutation({
  args: { cities: v.array(v.string()) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const { userId } = ctx;
    if (args.cities.length > MAX_ONBOARDING_CITY_STAMPS) {
      throw new Error("Too many cities");
    }
    await editAllowed(ctx, userId);
    const cities = [...new Set(args.cities.filter(isCityStampId))];
    if (cities.length < args.cities.length) {
      logEvent("warn", "city_stamp_unknown", {
        count: args.cities.length - cities.length,
      });
    }
    if (cities.length === 0) return 0;
    const user = await ctx.db.get(userId);
    const held = await ctx.db
      .query("cityStamps")
      .withIndex("by_user_and_city", (q) => q.eq("userId", userId))
      .first();
    const pro = await hasProEntitlement(ctx, userId);
    if (!pro && (user?.cityStampsClaimedAt !== undefined || held !== null)) {
      logEvent("info", "city_stamps_claim_refused", {
        claimed: user?.cityStampsClaimedAt !== undefined,
        held: held !== null,
      });
      return 0;
    }
    let stamped = 0;
    for (const city of cities) {
      if ((await findCityStamp(ctx, userId, city)) !== null) continue;
      await insertCityStamp(ctx, userId, city);
      stamped += 1;
    }
    if (user?.cityStampsClaimedAt === undefined) {
      await ctx.db.patch(userId, { cityStampsClaimedAt: Date.now() });
    }
    return stamped;
  },
});
