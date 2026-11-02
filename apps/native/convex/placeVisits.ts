import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  env,
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { aiAllowed } from "./aiConsent";
import {
  appleMapsAccessToken,
  appleMapsConfig,
  appleMapsCountry,
} from "./model/appleMaps";
import { authedMutation, authedQuery } from "./model/auth";
import { logEvent } from "./model/log";
import { MAX_PLACE_NAME_CHARS, placeKey } from "./model/plan";
import { findVisit } from "./model/placeVisits";
import { rateLimiter } from "./model/rateLimiter";
import { requireProEntitlement } from "./subscriptions";

const MAX_BATCH_PLACES = 60;
const MAX_PASSPORT_STAMPS = 500;

type VisitPin = { lat: number; lng: number; city?: string };

function visitPin(item: Doc<"items">, name: string): VisitPin | null {
  const key = placeKey(name);
  const pin = (item.placePins ?? []).find((p) => placeKey(p.name) === key);
  if (pin === undefined) return null;
  const cities = item.cities ?? [];
  const city = pin.city ?? (cities.length === 1 ? cities[0] : undefined);
  return { lat: pin.lat, lng: pin.lng, ...(city ? { city } : {}) };
}

async function ownedItem(
  ctx: QueryCtx,
  userId: string,
  itemId: Id<"items">,
): Promise<Doc<"items">> {
  const item = await ctx.db.get(itemId);
  if (item === null || item.userId !== userId) {
    throw new Error("Item not found");
  }
  return item;
}

async function markVisit(
  ctx: MutationCtx,
  userId: Id<"users">,
  item: Doc<"items">,
  name: string,
  backfilled: boolean,
): Promise<void> {
  const key = placeKey(name);
  const existing = await findVisit(ctx, userId, name);
  if (backfilled && existing !== null) return;
  const pin = visitPin(item, name);
  const samePoint =
    existing !== null &&
    pin !== null &&
    existing.lat === pin.lat &&
    existing.lng === pin.lng;
  const visit = {
    name: name.replace(/\s+/g, " ").trim().slice(0, MAX_PLACE_NAME_CHARS),
    itemId: item._id,
    visitedAt: Date.now(),
    lat: pin?.lat,
    lng: pin?.lng,
    city: pin?.city,
    countryCode: samePoint ? existing.countryCode : undefined,
    backfilled: backfilled ? true : undefined,
  };
  let visitId = existing?._id;
  if (visitId === undefined) {
    visitId = await ctx.db.insert("placeVisits", { userId, key, ...visit });
  } else {
    await ctx.db.patch(visitId, visit);
  }
  if (pin !== null && visit.countryCode === undefined) {
    await ctx.scheduler.runAfter(0, internal.placeVisits.locateCountry, {
      visitId,
    });
  }
}

export const setVisited = authedMutation({
  args: { itemId: v.id("items"), name: v.string(), visited: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const item = await ownedItem(ctx, userId, args.itemId);
    await requireProEntitlement(ctx, userId);
    if (placeKey(args.name) === "") {
      throw new Error("Place name is empty");
    }
    await rateLimiter.limit(ctx, "placeVisit", { key: userId, throws: true });
    if (args.visited) {
      await markVisit(ctx, userId, item, args.name, false);
    } else {
      const existing = await findVisit(ctx, userId, args.name);
      if (existing !== null) await ctx.db.delete(existing._id);
    }
    return null;
  },
});

export const markVisitedBefore = authedMutation({
  args: {
    places: v.array(v.object({ itemId: v.id("items"), name: v.string() })),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const { userId } = ctx;
    if (args.places.length > MAX_BATCH_PLACES) {
      throw new Error("Too many places");
    }
    const places = args.places.filter(({ name }) => placeKey(name) !== "");
    if (places.length === 0) return 0;
    await requireProEntitlement(ctx, userId);
    await rateLimiter.limit(ctx, "placeVisitBatch", {
      key: userId,
      throws: true,
    });
    const keys = new Set<string>();
    for (const { itemId, name } of places) {
      if (keys.has(placeKey(name))) continue;
      keys.add(placeKey(name));
      await markVisit(
        ctx,
        userId,
        await ownedItem(ctx, userId, itemId),
        name,
        true,
      );
    }
    return keys.size;
  },
});

const stampValidator = v.object({
  key: v.string(),
  name: v.string(),
  itemId: v.id("items"),
  visitedAt: v.number(),
  backfilled: v.optional(v.boolean()),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
  city: v.optional(v.string()),
  countryCode: v.optional(v.string()),
  cover: v.union(v.string(), v.null()),
});

async function coverOf(
  ctx: QueryCtx,
  item: Doc<"items"> | null,
): Promise<string | null> {
  if (item === null) return null;
  if (item.storageId !== undefined) {
    return await ctx.storage.getUrl(item.storageId);
  }
  return item.heroImageUrl ?? null;
}

export const getPassport = authedQuery({
  args: {},
  returns: v.array(stampValidator),
  handler: async (ctx) => {
    const visits = await ctx.db
      .query("placeVisits")
      .withIndex("by_user_and_visited", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .take(MAX_PASSPORT_STAMPS);
    const stamps = [];
    for (const visit of visits) {
      const item = await ctx.db.get(visit.itemId);
      const owned = item !== null && item.userId === ctx.userId ? item : null;
      const pin =
        visit.lat !== undefined && visit.lng !== undefined
          ? { lat: visit.lat, lng: visit.lng, city: visit.city }
          : owned && visitPin(owned, visit.name);
      stamps.push({
        key: visit.key,
        name: visit.name,
        itemId: visit.itemId,
        visitedAt: visit.visitedAt,
        ...(visit.backfilled ? { backfilled: true } : {}),
        ...(pin ? { lat: pin.lat, lng: pin.lng } : {}),
        ...(pin?.city ? { city: pin.city } : {}),
        ...(visit.countryCode ? { countryCode: visit.countryCode } : {}),
        cover: await coverOf(ctx, owned),
      });
    }
    return stamps;
  },
});

export const countryTarget = internalQuery({
  args: { visitId: v.id("placeVisits") },
  returns: v.union(v.null(), v.object({ lat: v.number(), lng: v.number() })),
  handler: async (ctx, args) => {
    const visit = await ctx.db.get(args.visitId);
    if (visit?.lat === undefined || visit.lng === undefined) return null;
    if (visit.countryCode !== undefined) return null;
    if (!(await aiAllowed(ctx, visit.userId))) return null;
    return { lat: visit.lat, lng: visit.lng };
  },
});

export const storeCountry = internalMutation({
  args: {
    visitId: v.id("placeVisits"),
    lat: v.number(),
    lng: v.number(),
    countryCode: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const visit = await ctx.db.get(args.visitId);
    if (visit === null || visit.lat !== args.lat || visit.lng !== args.lng) {
      return null;
    }
    await ctx.db.patch(visit._id, { countryCode: args.countryCode });
    return null;
  },
});

export const locateCountry = internalAction({
  args: { visitId: v.id("placeVisits") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const point = await ctx.runQuery(internal.placeVisits.countryTarget, args);
    if (point === null) return null;
    const config = appleMapsConfig(env);
    if (config === null) return null;
    const token = await appleMapsAccessToken(config);
    const countryCode =
      token === null ? null : await appleMapsCountry(token, point);
    if (countryCode === null) {
      logEvent("warn", "visit_country_failed", { token: token !== null });
      return null;
    }
    await ctx.runMutation(internal.placeVisits.storeCountry, {
      ...args,
      ...point,
      countryCode,
    });
    return null;
  },
});
