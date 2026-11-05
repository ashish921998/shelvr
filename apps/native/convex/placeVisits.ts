import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  env,
  internalAction,
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { aiAllowed } from "./aiConsent";
import { readySavesNewestFirst } from "./items";
import {
  appleMapsAccessToken,
  appleMapsConfig,
  appleMapsCountry,
} from "./model/appleMaps";
import { authedMutation, authedQuery } from "./model/auth";
import { logEvent } from "./model/log";
import { linkSource } from "./model/externalUrl";
import { MAX_PLACE_NAME_CHARS, placeKey } from "./model/plan";
import { findVisit } from "./model/placeVisits";
import { rateLimiter } from "./model/rateLimiter";
import { uniquePlacePins } from "./model/trip";
import { requireProEntitlement } from "./subscriptions";

const MAX_BATCH_PLACES = 60;
const MAX_PASSPORT_STAMPS = 500;
const COUNTRY_SPACING_MS = 1_000;
const COUNTRY_RETRY_MS = 60_000;
const MAX_COUNTRY_ATTEMPTS = 3;

type VisitPin = { lat: number; lng: number; city?: string };

function pinCity(
  item: Doc<"items">,
  pin: { city?: string },
): string | undefined {
  const cities = item.cities ?? [];
  const city = pin.city || (cities.length === 1 ? cities[0] : undefined);
  return city || undefined;
}

function visitPin(item: Doc<"items">, name: string): VisitPin | null {
  const key = placeKey(name);
  const pins = (item.placePins ?? []).filter((p) => placeKey(p.name) === key);
  const pin = pins.find((p) => pinCity(item, p) !== undefined) ?? pins[0];
  if (pin === undefined) return null;
  const city = pinCity(item, pin);
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
  lookupDelayMs = 0,
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
  const countryCode = samePoint ? existing.countryCode : undefined;
  const location =
    pin === null
      ? {}
      : { lat: pin.lat, lng: pin.lng, city: pin.city, countryCode };
  const visit = {
    name: name.replace(/\s+/g, " ").trim().slice(0, MAX_PLACE_NAME_CHARS),
    itemId: item._id,
    visitedAt: Date.now(),
    ...location,
    backfilled: backfilled ? true : undefined,
  };
  let visitId = existing?._id;
  if (visitId === undefined) {
    visitId = await ctx.db.insert("placeVisits", { userId, key, ...visit });
  } else {
    await ctx.db.patch(visitId, visit);
  }
  if (pin !== null && countryCode === undefined) {
    await ctx.scheduler.runAfter(
      lookupDelayMs,
      internal.placeVisits.locateCountry,
      { visitId },
    );
  }
}

export const setVisited = authedMutation({
  args: { itemId: v.id("items"), name: v.string(), visited: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const item = args.visited
      ? await ownedItem(ctx, userId, args.itemId)
      : null;
    await requireProEntitlement(ctx, userId);
    if (placeKey(args.name) === "") {
      throw new Error("Place name is empty");
    }
    await rateLimiter.limit(ctx, "placeVisit", { key: userId, throws: true });
    if (item !== null) {
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
    const items = await Promise.all(
      places.map(({ itemId }) => ownedItem(ctx, userId, itemId)),
    );
    const unique = new Map<string, { name: string; item: Doc<"items"> }>();
    places.forEach(({ name }, i) => {
      if (!unique.has(placeKey(name))) {
        unique.set(placeKey(name), { name, item: items[i] });
      }
    });
    await rateLimiter.limit(ctx, "placeVisitBatch", {
      key: userId,
      count: unique.size,
      throws: true,
    });
    let order = 0;
    for (const { name, item } of unique.values()) {
      await markVisit(
        ctx,
        userId,
        item,
        name,
        true,
        order * COUNTRY_SPACING_MS,
      );
      order += 1;
    }
    return unique.size;
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
  source: v.optional(v.union(v.literal("instagram"), v.literal("tiktok"))),
  cover: v.union(v.string(), v.null()),
});

function reelSource(item: Doc<"items"> | null) {
  const source = linkSource(item?.url);
  return source === "instagram" || source === "tiktok" ? source : undefined;
}

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
    const itemIds = [...new Set(visits.map((visit) => visit.itemId))];
    const saves = new Map(
      await Promise.all(
        itemIds.map(async (itemId) => {
          const item = await ctx.db.get(itemId);
          const owned =
            item !== null && item.userId === ctx.userId ? item : null;
          return [itemId, { owned, cover: await coverOf(ctx, owned) }] as const;
        }),
      ),
    );
    const stamps = [];
    for (const visit of visits) {
      const { owned, cover } = saves.get(visit.itemId) ?? {
        owned: null,
        cover: null,
      };
      const pin =
        visit.lat !== undefined && visit.lng !== undefined
          ? { lat: visit.lat, lng: visit.lng, city: visit.city }
          : owned && visitPin(owned, visit.name);
      const source = reelSource(owned);
      stamps.push({
        key: visit.key,
        name: visit.name,
        itemId: visit.itemId,
        visitedAt: visit.visitedAt,
        ...(visit.backfilled ? { backfilled: true } : {}),
        ...(pin ? { lat: pin.lat, lng: pin.lng } : {}),
        ...(pin?.city ? { city: pin.city } : {}),
        ...(visit.countryCode ? { countryCode: visit.countryCode } : {}),
        ...(source ? { source } : {}),
        cover,
      });
    }
    return stamps;
  },
});

const MAX_UNSTAMPED_PLACES = 200;
const MAX_VISIT_CHECKS = 1_000;

async function unstampedPins(ctx: QueryCtx, userId: Id<"users">) {
  const checked = new Set<string>();
  const pins = [];
  for (const item of await readySavesNewestFirst(ctx, userId)) {
    for (const pin of item.placePins ?? []) {
      const city = pinCity(item, pin);
      const key = placeKey(pin.name);
      if (city === undefined || checked.has(key)) continue;
      if (checked.size >= MAX_VISIT_CHECKS) return pins;
      checked.add(key);
      if ((await findVisit(ctx, userId, pin.name)) !== null) continue;
      pins.push({ ...pin, city, item });
    }
  }
  return pins;
}

export const listUnstampedPlaces = authedQuery({
  args: {},
  returns: v.array(
    v.object({
      itemId: v.id("items"),
      name: v.string(),
      city: v.string(),
      title: v.optional(v.string()),
      cover: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const places = uniquePlacePins(await unstampedPins(ctx, ctx.userId)).slice(
      0,
      MAX_UNSTAMPED_PLACES,
    );
    const covers = new Map<Id<"items">, Promise<string | null>>();
    return await Promise.all(
      places.map(async ({ name, city, item }) => {
        let cover = covers.get(item._id);
        if (cover === undefined) {
          cover = coverOf(ctx, item);
          covers.set(item._id, cover);
        }
        return {
          itemId: item._id,
          name,
          city,
          ...(item.title ? { title: item.title } : {}),
          cover: await cover,
        };
      }),
    );
  },
});

export const claimCountryLookup = internalMutation({
  args: { visitId: v.id("placeVisits") },
  returns: v.union(
    v.null(),
    v.object({ busyMs: v.number() }),
    v.object({ lat: v.number(), lng: v.number() }),
  ),
  handler: async (ctx, args) => {
    const visit = await ctx.db.get(args.visitId);
    if (visit?.lat === undefined || visit.lng === undefined) return null;
    if (visit.countryCode !== undefined) return null;
    if (!(await aiAllowed(ctx, visit.userId))) return null;
    const budget = await rateLimiter.limit(ctx, "visitCountryGlobal");
    if (!budget.ok) return { busyMs: budget.retryAfter };
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
  args: { visitId: v.id("placeVisits"), attempt: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const config = appleMapsConfig(env);
    if (config === null) return null;
    const point = await ctx.runMutation(
      internal.placeVisits.claimCountryLookup,
      { visitId: args.visitId },
    );
    if (point === null) return null;
    if (point.busyMs !== undefined) {
      await ctx.scheduler.runAfter(
        point.busyMs + Math.random() * COUNTRY_SPACING_MS * 60,
        internal.placeVisits.locateCountry,
        args,
      );
      return null;
    }
    const token = await appleMapsAccessToken(config);
    const countryCode =
      token === null ? null : await appleMapsCountry(token, point);
    if (countryCode !== null) {
      await ctx.runMutation(internal.placeVisits.storeCountry, {
        visitId: args.visitId,
        lat: point.lat,
        lng: point.lng,
        countryCode,
      });
      return null;
    }
    const attempt = (args.attempt ?? 0) + 1;
    logEvent("warn", "visit_country_failed", {
      token: token !== null,
      attempt,
    });
    if (attempt < MAX_COUNTRY_ATTEMPTS) {
      await ctx.scheduler.runAfter(
        COUNTRY_RETRY_MS * attempt,
        internal.placeVisits.locateCountry,
        { visitId: args.visitId, attempt },
      );
    }
    return null;
  },
});

const BACKFILL_PAGE = 100;

export const backfillCountries = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { page, isDone, continueCursor } = await ctx.db
      .query("placeVisits")
      .paginate({ numItems: BACKFILL_PAGE, cursor: args.cursor });
    let queued = 0;
    for (const visit of page) {
      if (visit.countryCode !== undefined) continue;
      if (visit.lat === undefined) {
        const item = await ctx.db.get(visit.itemId);
        const pin =
          item !== null && item.userId === visit.userId
            ? visitPin(item, visit.name)
            : null;
        if (pin === null) continue;
        await ctx.db.patch(visit._id, pin);
      }
      await ctx.scheduler.runAfter(
        queued++ * COUNTRY_SPACING_MS,
        internal.placeVisits.locateCountry,
        { visitId: visit._id },
      );
    }
    if (!isDone) {
      await ctx.scheduler.runAfter(
        queued * COUNTRY_SPACING_MS,
        internal.placeVisits.backfillCountries,
        { cursor: continueCursor },
      );
    }
    return null;
  },
});
