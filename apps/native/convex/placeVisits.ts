import { type Infer, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
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
import { authedMutation, authedQuery, liveOwner } from "./model/auth";
import { linkSource } from "./model/externalUrl";
import { logEvent } from "./model/log";
import { approximateDocBytes } from "./model/readBudget";
import { MAX_PLACE_NAME_CHARS, placeKey } from "./model/plan";
import {
  barePlaceKey,
  closestUnidentifiedSpot,
  findVisit,
  MAX_VISIT_SPOTS,
  knowsSpot,
  matchesVisitSpot,
  namedVisitMarkValidator,
  rowSpots,
  spotsOnItem,
  userVisits,
  visitMatcher,
  visitRows,
  visitRowsWithNamePrefix,
  type VisitSpot,
  visitSpotValidator,
} from "./model/placeVisits";
import { rateLimiter } from "./model/rateLimiter";
import { MAX_APPLE_ID_CHARS, tidyText, validPoint } from "./model/tripPlace";
import { uniquePlacePins } from "./model/trip";
import { requireProEntitlement } from "./subscriptions";

type Visit = { name: string; itemId: Id<"items">; visitedAt: number };

function tidySpot(spot: VisitSpot): VisitSpot {
  if (!validPoint(spot.lat, spot.lng)) {
    throw new Error("Place position is invalid");
  }
  const appleId = tidyText(spot.appleId, MAX_APPLE_ID_CHARS);
  return {
    lat: spot.lat,
    lng: spot.lng,
    ...(appleId === undefined ? {} : { appleId }),
  };
}

async function markVisit(
  ctx: MutationCtx,
  mark: {
    userId: Id<"users">;
    key: string;
    existing: Doc<"placeVisits"> | null;
    visit: Visit;
    spots: VisitSpot[] | undefined;
    explicit: boolean;
  },
): Promise<void> {
  const { userId, key, existing, visit, spots, explicit } = mark;
  const oldSpots =
    existing === null ? undefined : await rowSpots(ctx, existing);
  const narrowing =
    explicit &&
    existing?.spots === undefined &&
    oldSpots !== undefined &&
    oldSpots.length > 1 &&
    spots?.[0] !== undefined &&
    knowsSpot(oldSpots, spots[0]);
  const next = narrowing ? [] : [...(oldSpots ?? [])];
  for (const spot of spots ?? []) {
    if (!knowsSpot(next, spot)) next.push(spot);
  }
  if (spots !== undefined && next.length > MAX_VISIT_SPOTS) {
    throw new Error("Place has too many visited spots");
  }
  if (existing === null) {
    await ctx.db.insert("placeVisits", {
      userId,
      key,
      ...visit,
      ...(spots === undefined ? {} : { spots: next }),
    });
    return;
  }
  if (spots === undefined) {
    await ctx.db.patch(existing._id, {
      name: visit.name,
      visitedAt: visit.visitedAt,
    });
    return;
  }
  await ctx.db.patch(existing._id, { ...visit, spots: next });
}

type ClearRow = {
  row: Doc<"placeVisits">;
  sameName: boolean;
  relatedName: boolean;
  original: VisitSpot[] | undefined;
  remaining: VisitSpot[] | undefined;
};

function clearSpot(rows: ClearRow[], spot: VisitSpot): void {
  let matched = false;
  for (const entry of rows) {
    const matches = (kept: VisitSpot) =>
      matchesVisitSpot(kept, spot, entry.relatedName);
    if (entry.original?.some(matches)) {
      entry.remaining = entry.remaining?.filter((kept) => !matches(kept));
      matched = true;
    }
  }
  if (matched) return;
  const named = rows.find((entry) => entry.sameName);
  if (named?.remaining === undefined) return;
  const nearest = closestUnidentifiedSpot(named.remaining, spot);
  if (nearest !== undefined) {
    named.remaining = named.remaining.filter((kept) => kept !== nearest);
  }
}

async function clearVisit(
  ctx: MutationCtx,
  clear: {
    userId: Id<"users">;
    name: string;
    key: string;
    existing: Doc<"placeVisits"> | null;
    spots: VisitSpot[] | undefined;
  },
): Promise<void> {
  const { userId, name, key, existing, spots } = clear;
  if (spots === undefined) {
    if (
      existing !== null &&
      existing.spots === undefined &&
      spotsOnItem(await ctx.db.get(existing.itemId), existing.name) ===
        undefined
    ) {
      await ctx.db.delete(existing._id);
    }
    return;
  }
  const bare = barePlaceKey(name);
  const byId = spots.some((spot) => spot.appleId !== undefined);
  const candidates = byId
    ? await visitRows(ctx, userId)
    : await visitRowsWithNamePrefix(ctx, userId, bare);
  if (
    existing !== null &&
    !candidates.some((row) => row._id === existing._id)
  ) {
    candidates.push(existing);
  }
  const rows = await Promise.all(
    candidates.map(async (row): Promise<ClearRow> => {
      const sameName = row.key === key;
      const relatedName =
        sameName || (bare !== "" && barePlaceKey(row.name) === bare);
      const original =
        byId || relatedName ? await rowSpots(ctx, row) : undefined;
      return { row, sameName, relatedName, original, remaining: original };
    }),
  );
  for (const spot of spots) clearSpot(rows, spot);
  for (const { row, sameName, original, remaining } of rows) {
    if (remaining?.length === 0 || (original === undefined && sameName)) {
      await ctx.db.delete(row._id);
    } else if (remaining !== original) {
      await ctx.db.patch(row._id, { spots: remaining });
    }
  }
}

export const setVisited = authedMutation({
  args: {
    itemId: v.id("items"),
    name: v.string(),
    visited: v.boolean(),
    spot: v.optional(visitSpotValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const found = await ctx.db.get(args.itemId);
    const owned = found !== null && found.userId === userId ? found : null;
    if (owned === null && args.visited) {
      throw new Error("Item not found");
    }
    const key = placeKey(args.name);
    if (key === "") {
      throw new Error("Place name is empty");
    }
    const spots =
      args.spot !== undefined
        ? [tidySpot(args.spot)]
        : owned === null
          ? undefined
          : spotsOnItem(owned, args.name);
    const existing = await findVisit(ctx, userId, args.name);
    if (!args.visited || owned === null) {
      await rateLimiter.limit(ctx, "placeVisitClear", {
        key: userId,
        throws: true,
      });
      await clearVisit(ctx, { userId, name: args.name, key, existing, spots });
      return null;
    }
    await requireProEntitlement(ctx, userId);
    await rateLimiter.limit(ctx, "placeVisit", { key: userId, throws: true });
    const visit = {
      name: args.name
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_PLACE_NAME_CHARS),
      itemId: args.itemId,
      visitedAt: Date.now(),
    };
    await markVisit(ctx, {
      userId,
      key,
      existing,
      visit,
      spots,
      explicit: args.spot !== undefined,
    });
    const row = await findVisit(ctx, userId, args.name);
    if (row !== null) await syncStampPlaces(ctx, row, owned);
    return null;
  },
});

export const listVisits = authedQuery({
  args: {},
  returns: v.array(namedVisitMarkValidator),
  handler: async (ctx) => await userVisits(ctx, ctx.userId),
});

const MAX_BATCH_PLACES = 60;
const MAX_PASSPORT_STAMPS = 500;
const PASSPORT_SAVE_BYTES = 4 * 1024 * 1024;
const MAX_UNSTAMPED_PLACES = 200;
const COUNTRY_SPACING_MS = 1_000;
const COUNTRY_RETRY_MS = 60_000;
const MAX_COUNTRY_ATTEMPTS = 3;
const BACKFILL_PAGE = 25;
const BACKFILL_SPACING_MS = 9_000;

type StampPlace = NonNullable<Doc<"placeVisits">["stampPlaces"]>[number];
type Point = { lat: number; lng: number };

function pinCity(
  item: Doc<"items">,
  pin: { city?: string },
): string | undefined {
  const cities = item.cities ?? [];
  const city = pin.city || (cities.length === 1 ? cities[0] : undefined);
  return city || undefined;
}

function cityAt(item: Doc<"items"> | null, point: Point): string | undefined {
  const pin = item?.placePins?.find(
    (p) => p.lat === point.lat && p.lng === point.lng,
  );
  return item && pin ? pinCity(item, pin) : undefined;
}

function placeAt(
  places: readonly StampPlace[] | undefined,
  point: Point,
): StampPlace | undefined {
  return places?.find((p) => p.lat === point.lat && p.lng === point.lng);
}

function markedSpots(
  row: Doc<"placeVisits">,
  item: Doc<"items"> | null,
): VisitSpot[] | undefined {
  if (row.spots !== undefined) return row.spots;
  const byName = spotsOnItem(item, row.name);
  if (byName !== undefined || item === null) return byName;
  const byKey = (item.placePins ?? []).find(
    (pin) => placeKey(pin.name) === row.key,
  );
  return byKey && spotsOnItem(item, byKey.name);
}

function stampSpots(
  row: Doc<"placeVisits">,
  item: Doc<"items"> | null,
): VisitSpot[] | undefined {
  const spots = markedSpots(row, item);
  if (spots !== undefined || !row.stampPlaces?.length) return spots;
  return row.stampPlaces.map(({ lat, lng }) => ({ lat, lng }));
}

async function ownedSave(
  ctx: QueryCtx,
  userId: string,
  itemId: Id<"items">,
): Promise<Doc<"items"> | null> {
  const item = await ctx.db.get(itemId);
  return item !== null && item.userId === userId ? item : null;
}

async function syncStampPlaces(
  ctx: MutationCtx,
  row: Doc<"placeVisits">,
  marked: Doc<"items"> | null,
  options: {
    delayMs?: number;
    spacingMs?: number;
    retryMissing?: boolean;
  } = {},
): Promise<number> {
  const saved =
    marked?._id === row.itemId
      ? marked
      : await ownedSave(ctx, row.userId, row.itemId);
  const spots = stampSpots(row, saved) ?? [];
  const fresh: StampPlace[] = [];
  const places = spots.map((spot): StampPlace => {
    const known = placeAt(row.stampPlaces, spot);
    if (known !== undefined) return known;
    const city = cityAt(marked, spot) ?? cityAt(saved, spot);
    const place = { lat: spot.lat, lng: spot.lng, ...(city ? { city } : {}) };
    fresh.push(place);
    return place;
  });
  if (fresh.length > 0 || places.length !== (row.stampPlaces?.length ?? 0)) {
    await ctx.db.patch(row._id, { stampPlaces: places });
  }
  const lookups = options.retryMissing
    ? places.filter((place) => place.countryCode === undefined)
    : fresh;
  for (const [index, { lat, lng }] of lookups.entries()) {
    await ctx.scheduler.runAfter(
      (options.delayMs ?? 0) +
        index * (options.spacingMs ?? COUNTRY_SPACING_MS),
      internal.placeVisits.locateCountry,
      { visitId: row._id, lat, lng },
    );
  }
  return lookups.length;
}

export const markVisitedBefore = authedMutation({
  args: {
    places: v.array(
      v.object({
        itemId: v.id("items"),
        name: v.string(),
        spot: v.optional(visitSpotValidator),
      }),
    ),
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
    const unique = new Map<
      string,
      { name: string; item: Doc<"items">; spot?: VisitSpot }
    >();
    for (const { itemId, name, spot } of places) {
      const item = await ownedSave(ctx, userId, itemId);
      if (item === null) throw new Error("Item not found");
      const picked = spot && tidySpot(spot);
      const id = `${itemId}:${placeKey(name)}:${picked ? `${picked.lat},${picked.lng}` : ""}`;
      if (!unique.has(id)) unique.set(id, { name, item, spot: picked });
    }
    await rateLimiter.limit(ctx, "placeVisitBatch", {
      key: userId,
      count: unique.size,
      throws: true,
    });
    let queued = 0;
    for (const { name, item, spot } of unique.values()) {
      const key = placeKey(name);
      const existing = await findVisit(ctx, userId, name);
      const visit =
        existing === null
          ? {
              name: name
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, MAX_PLACE_NAME_CHARS),
              itemId: item._id,
              visitedAt: Date.now(),
            }
          : {
              name: existing.name,
              itemId: existing.itemId,
              visitedAt: existing.visitedAt,
            };
      await markVisit(ctx, {
        userId,
        key,
        existing,
        visit,
        spots: spot ? [spot] : spotsOnItem(item, name),
        explicit: spot !== undefined,
      });
      const row = await findVisit(ctx, userId, name);
      if (row === null) continue;
      if (existing === null) await ctx.db.patch(row._id, { backfilled: true });
      queued += await syncStampPlaces(ctx, row, item, {
        delayMs: queued * COUNTRY_SPACING_MS,
      });
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
    const rows = (await visitRows(ctx, ctx.userId)).slice(
      0,
      MAX_PASSPORT_STAMPS,
    );
    const saves = new Map<
      Id<"items">,
      { owned: Doc<"items"> | null; cover: string | null }
    >();
    let bytes = 0;
    for (const { itemId } of rows) {
      if (saves.has(itemId)) continue;
      if (bytes >= PASSPORT_SAVE_BYTES) break;
      const owned = await ownedSave(ctx, ctx.userId, itemId);
      bytes += approximateDocBytes(owned);
      saves.set(itemId, { owned, cover: await coverOf(ctx, owned) });
    }
    const stamps: Infer<typeof stampValidator>[] = [];
    for (const row of rows) {
      const { owned, cover } = saves.get(row.itemId) ?? {
        owned: null,
        cover: null,
      };
      const source = reelSource(owned);
      const base = {
        key: row.key,
        name: row.name,
        itemId: row.itemId,
        visitedAt: row.visitedAt,
        ...(row.backfilled ? { backfilled: true } : {}),
        ...(source ? { source } : {}),
        cover,
      };
      const spots = stampSpots(row, owned);
      if (spots === undefined) {
        stamps.push(base);
        continue;
      }
      for (const spot of spots) {
        const place = placeAt(row.stampPlaces, spot);
        const city = place?.city ?? cityAt(owned, spot);
        stamps.push({
          ...base,
          lat: spot.lat,
          lng: spot.lng,
          ...(city ? { city } : {}),
          ...(place?.countryCode ? { countryCode: place.countryCode } : {}),
        });
      }
    }
    return stamps.slice(0, MAX_PASSPORT_STAMPS);
  },
});

async function unstampedPins(ctx: QueryCtx, userId: Id<"users">) {
  const saves = await readySavesNewestFirst(ctx, userId);
  const pins = saves.flatMap((item) =>
    (item.placePins ?? []).flatMap((pin) => {
      const city = pinCity(item, pin);
      return city === undefined ? [] : [{ ...pin, city, item }];
    }),
  );
  const visited = visitMatcher(await userVisits(ctx, userId, saves), pins);
  return pins.filter((pin) => !visited(pin));
}

export const listUnstampedPlaces = authedQuery({
  args: {},
  returns: v.array(
    v.object({
      itemId: v.id("items"),
      name: v.string(),
      city: v.string(),
      spot: visitSpotValidator,
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
      places.map(async ({ name, city, item, lat, lng, appleId }) => {
        let cover = covers.get(item._id);
        if (cover === undefined) {
          cover = coverOf(ctx, item);
          covers.set(item._id, cover);
        }
        return {
          itemId: item._id,
          name,
          city,
          spot: { lat, lng, ...(appleId === undefined ? {} : { appleId }) },
          ...(item.title ? { title: item.title } : {}),
          cover: await cover,
        };
      }),
    );
  },
});

const countryLookupArgs = {
  visitId: v.id("placeVisits"),
  lat: v.number(),
  lng: v.number(),
};

export const claimCountryLookup = internalMutation({
  args: countryLookupArgs,
  returns: v.union(
    v.null(),
    v.object({ busyMs: v.number() }),
    v.object({ ready: v.literal(true) }),
  ),
  handler: async (ctx, args) => {
    const visit = await ctx.db.get(args.visitId);
    const place = placeAt(visit?.stampPlaces, args);
    if (visit === null || place === undefined) return null;
    if (place.countryCode !== undefined) return null;
    if (!(await aiAllowed(ctx, visit.userId))) return null;
    const budget = await rateLimiter.limit(ctx, "visitCountryGlobal");
    return budget.ok ? { ready: true as const } : { busyMs: budget.retryAfter };
  },
});

export const storeCountry = internalMutation({
  args: { ...countryLookupArgs, countryCode: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const visit = await ctx.db.get(args.visitId);
    if (visit === null || placeAt(visit.stampPlaces, args) === undefined) {
      return null;
    }
    await ctx.db.patch(visit._id, {
      stampPlaces: visit.stampPlaces?.map((place) =>
        place.lat === args.lat && place.lng === args.lng
          ? { ...place, countryCode: args.countryCode }
          : place,
      ),
    });
    return null;
  },
});

export const locateCountry = internalAction({
  args: { ...countryLookupArgs, attempt: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const config = appleMapsConfig(env);
    if (config === null) return null;
    const { attempt: previous, ...point } = args;
    const claim = await ctx.runMutation(
      internal.placeVisits.claimCountryLookup,
      point,
    );
    if (claim === null) return null;
    if (!("ready" in claim)) {
      await ctx.scheduler.runAfter(
        claim.busyMs + Math.random() * COUNTRY_SPACING_MS * 60,
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
        ...point,
        countryCode,
      });
      return null;
    }
    const attempt = (previous ?? 0) + 1;
    logEvent("warn", "visit_country_failed", {
      token: token !== null,
      attempt,
    });
    if (attempt < MAX_COUNTRY_ATTEMPTS) {
      await ctx.scheduler.runAfter(
        COUNTRY_RETRY_MS * attempt,
        internal.placeVisits.locateCountry,
        { ...point, attempt },
      );
    }
    return null;
  },
});

export const backfillCountries = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { page, isDone, continueCursor } = await ctx.db
      .query("placeVisits")
      .paginate({ numItems: BACKFILL_PAGE, cursor: args.cursor });
    let queued = 0;
    for (const row of page) {
      if ((await liveOwner(ctx, row.userId)) === null) continue;
      queued += await syncStampPlaces(ctx, row, null, {
        delayMs: queued * BACKFILL_SPACING_MS,
        spacingMs: BACKFILL_SPACING_MS,
        retryMissing: true,
      });
    }
    if (!isDone) {
      await ctx.scheduler.runAfter(
        queued * BACKFILL_SPACING_MS,
        internal.placeVisits.backfillCountries,
        { cursor: continueCursor },
      );
    }
    return null;
  },
});
