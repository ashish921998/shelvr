import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { readySavesNewestFirst } from "./items";
import { authedMutation, authedQuery, liveOwner } from "./model/auth";
import { ipNetwork } from "./model/clientIp";
import { firstNameOf } from "./model/firstName";
import { logEvent } from "./model/log";
import { visitedPlaceKeys } from "./model/placeVisits";
import {
  isPublicMapToken,
  publicCityPreviews,
  publicMapCities,
} from "./model/publicMap";
import { MAX_PUBLIC_MAP_CITIES } from "./model/publicMapLimits";
import { rateLimiter } from "./model/rateLimiter";
import { inviteToken, uniqueCities } from "./model/sharedLists";
import { MAX_CITY_CHARS } from "./model/trip";
import { tidyText } from "./model/tripPlace";
import { requireProEntitlement } from "./subscriptions";

const OWNER_ROWS = 10;

const publicPlaceValidator = v.object({
  name: v.string(),
  lat: v.number(),
  lng: v.number(),
  emoji: v.optional(v.string()),
  went: v.boolean(),
  post: v.optional(
    v.object({
      site: v.union(
        v.literal("instagram"),
        v.literal("tiktok"),
        v.literal("youtube"),
      ),
      url: v.string(),
    }),
  ),
});

async function ownPage(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Doc<"publicMaps"> | null> {
  return await ctx.db
    .query("publicMaps")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

async function ownPages(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Doc<"publicMaps">[]> {
  return await ctx.db
    .query("publicMaps")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(OWNER_ROWS);
}

export async function servablePage(
  ctx: QueryCtx,
  token: string,
): Promise<Doc<"publicMaps"> | null> {
  if (!isPublicMapToken(token)) return null;
  const row = await ctx.db
    .query("publicMaps")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  return row === null || row.blockedAt !== undefined ? null : row;
}

export const getMyPublicMap = authedQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      token: v.string(),
      cities: v.array(v.string()),
      blocked: v.boolean(),
      saveAll: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const row = await ownPage(ctx, ctx.userId);
    return row === null
      ? null
      : {
          token: row.token,
          cities: row.cities,
          blocked: row.blockedAt !== undefined,
          saveAll: row.saveAll === true,
        };
  },
});

export const listPublicMapCities = authedQuery({
  args: {},
  returns: v.array(
    v.object({
      city: v.string(),
      places: v.array(v.object({ name: v.string(), went: v.boolean() })),
    }),
  ),
  handler: async (ctx) =>
    publicCityPreviews(
      await readySavesNewestFirst(ctx, ctx.userId),
      await visitedPlaceKeys(ctx, ctx.userId),
    ),
});

export const setPublicMapCities = authedMutation({
  args: { cities: v.array(v.string()) },
  returns: v.object({ token: v.string(), cities: v.array(v.string()) }),
  handler: async (ctx, args) => {
    const cities = uniqueCities(
      args.cities.flatMap((city) => tidyText(city, MAX_CITY_CHARS) ?? []),
    ).slice(0, MAX_PUBLIC_MAP_CITIES);
    if (cities.length === 0) throw new Error("City required");
    await rateLimiter.limit(ctx, "publicMapEdit", {
      key: ctx.userId,
      throws: true,
    });
    const existing = await ownPage(ctx, ctx.userId);
    if (existing?.blockedAt !== undefined) throw new Error("Map page blocked");
    if (existing !== null) {
      await ctx.db.patch(existing._id, { cities });
      return { token: existing.token, cities };
    }
    await requireProEntitlement(ctx, ctx.userId);
    const token = inviteToken();
    await ctx.db.insert("publicMaps", { userId: ctx.userId, token, cities });
    return { token, cities };
  },
});

export const rotatePublicMapLink = authedMutation({
  args: {},
  returns: v.union(v.string(), v.null()),
  handler: async (ctx) => {
    await rateLimiter.limit(ctx, "publicMapEdit", {
      key: ctx.userId,
      throws: true,
    });
    const row = await ownPage(ctx, ctx.userId);
    if (row === null || row.blockedAt !== undefined) return null;
    const token = inviteToken();
    await ctx.db.patch(row._id, { token });
    return token;
  },
});

export const setPublicMapSaveAll = authedMutation({
  args: { on: v.boolean() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "publicMapEdit", {
      key: ctx.userId,
      throws: true,
    });
    const row = await ownPage(ctx, ctx.userId);
    if (row === null) throw new Error("Map page required");
    if (row.blockedAt !== undefined) throw new Error("Map page blocked");
    if (args.on) await requireProEntitlement(ctx, ctx.userId);
    await ctx.db.patch(row._id, { saveAll: args.on ? true : undefined });
    return args.on;
  },
});

export const turnOffPublicMap = authedMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    for (const row of await ownPages(ctx, ctx.userId)) {
      if (row.blockedAt === undefined) await ctx.db.delete(row._id);
    }
    return null;
  },
});

export const getPublicMap = internalQuery({
  args: { token: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      ownerName: v.optional(v.string()),
      cities: v.array(
        v.object({ city: v.string(), places: v.array(publicPlaceValidator) }),
      ),
      saveAll: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const row = await servablePage(ctx, args.token);
    if (row === null) return null;
    const owner = await liveOwner(ctx, row.userId);
    if (owner === null) return null;
    const saves = await readySavesNewestFirst(ctx, row.userId);
    const visited = await visitedPlaceKeys(ctx, row.userId);
    const ownerName = firstNameOf(owner.name);
    return {
      ...(ownerName !== undefined ? { ownerName } : {}),
      cities: publicMapCities(saves, row.cities, visited),
      saveAll: row.saveAll === true,
    };
  },
});

export const claimPublicMapView = internalMutation({
  args: { token: v.string(), ip: v.optional(v.string()) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "publicMapView", {
      key: ipNetwork(args.ip),
      throws: true,
    });
    const row = await servablePage(ctx, args.token);
    if (row === null) return false;
    await rateLimiter.limit(ctx, "publicMapPage", {
      key: row.userId,
      throws: true,
    });
    return true;
  },
});

export const setPublicMapBlocked = internalMutation({
  args: { token: v.string(), blocked: v.boolean() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("publicMaps")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (row === null) return false;
    await ctx.db.patch(row._id, {
      blockedAt: args.blocked ? Date.now() : undefined,
    });
    logEvent("info", "public_map_blocked", { blocked: args.blocked });
    return true;
  },
});

export async function deletePublicMapsForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<boolean> {
  const rows = await ownPages(ctx, userId);
  for (const row of rows) await ctx.db.delete(row._id);
  return rows.length < OWNER_ROWS;
}
