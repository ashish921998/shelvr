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
import {
  CITY_ITEMS_MAX,
  citySaves,
  rawReadySavesNewestFirst,
  readySavesNewestFirst,
} from "./items";
import {
  appleMapsAccessToken,
  appleMapsConfig,
  appleMapsCountry,
} from "./model/appleMaps";
import { authedMutation, authedQuery, liveOwner } from "./model/auth";
import {
  cityCompletionValidator,
  completionByCity,
} from "./model/cityCompletion";
import { linkSource } from "./model/externalUrl";
import { memberOf, wentWithout } from "./model/sharedLists";
import { logEvent } from "./model/log";
import { normalizeCities, normalizePlaceName } from "./model/itemFields";
import { type PassportPlace, soleCity } from "./model/passport";
import { placeKinds } from "./model/placeKinds";
import { userRemovals, visibleCitySave } from "./model/placeRemovals";
import { approximateDocBytes } from "./model/readBudget";
import { MAX_PLACE_NAME_CHARS, placeKey } from "./model/plan";
import {
  barePlaceKey,
  closestUnidentifiedSpot,
  findVisit,
  MAX_BATCH_PLACES,
  MAX_VISIT_SPOTS,
  knowsSpot,
  matchesVisitSpot,
  namedVisitMarkValidator,
  rowSpots,
  spotsOnItem,
  withStampedSpots,
  userVisits,
  visitMatcher,
  visitRows,
  visitRowsWithNamePrefix,
  type VisitSpot,
  visitSpotValidator,
} from "./model/placeVisits";
import { rateLimiter } from "./model/rateLimiter";
import { MAX_APPLE_ID_CHARS, tidyText, validPoint } from "./model/tripPlace";
import {
  cityKey,
  distanceKm,
  pinsForCity,
  SAME_PLACE_KM,
  tidyCity,
  uniquePlacePins,
} from "./model/trip";
import { requireProEntitlement } from "./subscriptions";

type Visit = { name: string; itemId?: Id<"items">; visitedAt: number };

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
      ...(existing.itemId === undefined && visit.itemId !== undefined
        ? { itemId: visit.itemId }
        : {}),
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
      spotsOnItem(
        existing.itemId === undefined
          ? null
          : await ctx.db.get(existing.itemId),
        existing.name,
      ) === undefined
    ) {
      await ctx.db.delete(existing._id);
      await forgetStampsWent(ctx, userId, existing.stampPlaces ?? []);
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
      await forgetStampsWent(ctx, userId, row.stampPlaces ?? []);
    } else if (remaining !== original) {
      const kept =
        row.stampPlaces === undefined
          ? undefined
          : keptStampPlaces(row.stampPlaces, original ?? [], remaining ?? []);
      await ctx.db.patch(row._id, {
        spots: remaining,
        ...(kept === undefined ? {} : { stampPlaces: kept }),
      });
      await forgetStampsWent(
        ctx,
        userId,
        (row.stampPlaces ?? []).filter((entry) => !kept?.includes(entry)),
      );
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
    if (row === null) return null;
    const claim = await claimMarkedSpots(ctx, row, spots);
    await syncStampPlaces(ctx, claim.row, owned, { released: claim.released });
    return null;
  },
});

async function claimMarkedSpots(
  ctx: MutationCtx,
  row: Doc<"placeVisits">,
  marked: VisitSpot[] | undefined,
): Promise<{ row: Doc<"placeVisits">; released: StampPlace[] }> {
  const spots = marked ?? [];
  const claimed = (entry: StampPlace) =>
    entry.listPlaceId !== undefined &&
    knowsSpot(
      spots,
      row.spots?.find(
        (kept) => kept.lat === entry.lat && kept.lng === entry.lng,
      ) ?? entry,
    );
  if (!row.stampPlaces?.some(claimed)) return { row, released: [] };
  const released: StampPlace[] = [];
  const stampPlaces = row.stampPlaces.map((entry) => {
    if (!claimed(entry)) return entry;
    const {
      listPlaceId: _listPlaceId,
      alsoListPlaceIds: _alsoListPlaceIds,
      ...own
    } = entry;
    released.push(own);
    return own;
  });
  await ctx.db.patch(row._id, { stampPlaces });
  return { row: { ...row, stampPlaces }, released };
}

function listSpot(place: Doc<"sharedListPlaces">): VisitSpot {
  return tidySpot({
    lat: place.lat,
    lng: place.lng,
    ...(place.appleId === undefined ? {} : { appleId: place.appleId }),
  });
}

async function unstampListPlace(
  ctx: MutationCtx,
  row: Doc<"placeVisits">,
  place: Doc<"sharedListPlaces">,
): Promise<void> {
  if (await dropSharedClaim(ctx, row, place._id)) return;
  const fromList = (entry: StampPlace) => entry.listPlaceId === place._id;
  if (!row.stampPlaces?.some(fromList)) return;
  const spot = listSpot(place);
  const remaining = ((await rowSpots(ctx, row)) ?? []).filter(
    (kept) => !matchesVisitSpot(kept, spot, true),
  );
  if (remaining.length === 0 && row.itemId === undefined) {
    await ctx.db.delete(row._id);
    return;
  }
  await ctx.db.patch(row._id, {
    spots: remaining,
    stampPlaces: row.stampPlaces?.filter((entry) => !fromList(entry)),
  });
}

const MAX_SHARED_CLAIMS = 20;

async function liveClaims(
  ctx: MutationCtx,
  ids: readonly Id<"sharedListPlaces">[] | undefined,
): Promise<Id<"sharedListPlaces">[]> {
  const live: Id<"sharedListPlaces">[] = [];
  for (const id of ids ?? []) {
    if ((await ctx.db.get(id)) !== null) live.push(id);
  }
  return live;
}

async function withoutClaim(
  ctx: MutationCtx,
  entry: StampPlace,
  listPlaceId: Id<"sharedListPlaces">,
): Promise<StampPlace> {
  const others = (await liveClaims(ctx, entry.alsoListPlaceIds)).filter(
    (id) => id !== listPlaceId,
  );
  if (entry.listPlaceId !== listPlaceId) {
    return { ...entry, alsoListPlaceIds: others };
  }
  const [next, ...rest] = others;
  if (next === undefined) return { ...entry, alsoListPlaceIds: [] };
  return { ...entry, listPlaceId: next, alsoListPlaceIds: rest };
}

async function dropSharedClaim(
  ctx: MutationCtx,
  row: Doc<"placeVisits">,
  listPlaceId: Id<"sharedListPlaces">,
): Promise<boolean> {
  const shared = (entry: StampPlace) =>
    (entry.alsoListPlaceIds?.length ?? 0) > 0 &&
    (entry.listPlaceId === listPlaceId ||
      entry.alsoListPlaceIds?.includes(listPlaceId) === true);
  const entry = row.stampPlaces?.find(shared);
  if (entry === undefined) return false;
  const next = await withoutClaim(ctx, entry, listPlaceId);
  await ctx.db.patch(row._id, {
    stampPlaces: (row.stampPlaces ?? []).map((other) =>
      other === entry ? next : other,
    ),
  });
  if (next.listPlaceId !== entry.listPlaceId) {
    await locatePromotedStamp(ctx, row, next);
  }
  return next.listPlaceId !== listPlaceId;
}

async function locatePromotedStamp(
  ctx: MutationCtx,
  row: Doc<"placeVisits">,
  entry: StampPlace,
): Promise<void> {
  if (entry.countryCode !== undefined || entry.listPlaceId === undefined) {
    return;
  }
  const place = await ctx.db.get(entry.listPlaceId);
  if (place === null) return;
  if (place.addedBy !== row.userId && !(await aiAllowed(ctx, place.addedBy))) {
    return;
  }
  await ctx.scheduler.runAfter(0, internal.placeVisits.locateCountry, {
    visitId: row._id,
    lat: entry.lat,
    lng: entry.lng,
  });
}

async function shareClaim(
  ctx: MutationCtx,
  userId: Id<"users">,
  row: Doc<"placeVisits">,
  spots: VisitSpot[],
  place: Doc<"sharedListPlaces">,
): Promise<void> {
  const spot = listSpot(place);
  const kept = spots.find((other) => matchesVisitSpot(other, spot, true));
  const entry = kept && placeAt(row.stampPlaces, kept);
  if (
    entry?.listPlaceId === undefined ||
    entry.listPlaceId === place._id ||
    entry.alsoListPlaceIds?.includes(place._id) === true
  ) {
    return;
  }
  let live = await liveClaims(ctx, entry.alsoListPlaceIds);
  if (live.length >= MAX_SHARED_CLAIMS) {
    live = await joinedClaims(ctx, userId, live);
  }
  if (live.length >= MAX_SHARED_CLAIMS) {
    throw new Error("Place is on too many of your lists");
  }
  await ctx.db.patch(row._id, {
    stampPlaces: (row.stampPlaces ?? []).map((other) =>
      other === entry
        ? { ...other, alsoListPlaceIds: [...live, place._id] }
        : other,
    ),
  });
}

async function joinedClaims(
  ctx: MutationCtx,
  userId: Id<"users">,
  ids: readonly Id<"sharedListPlaces">[],
): Promise<Id<"sharedListPlaces">[]> {
  const joined: Id<"sharedListPlaces">[] = [];
  for (const id of ids) {
    const claim = await ctx.db.get(id);
    if (
      claim !== null &&
      (await memberOf(ctx, claim.listId, userId)) !== null
    ) {
      joined.push(id);
    }
  }
  return joined;
}

async function addListSpot(
  ctx: MutationCtx,
  userId: Id<"users">,
  existing: Doc<"placeVisits"> | null,
  place: Doc<"sharedListPlaces">,
): Promise<Id<"placeVisits"> | null> {
  const spot = listSpot(place);
  const entry = {
    lat: spot.lat,
    lng: spot.lng,
    city: place.city,
    listPlaceId: place._id,
  };
  const spots =
    existing === null ? [] : ((await rowSpots(ctx, existing)) ?? []);
  if (existing !== null && knowsSpot(spots, spot)) {
    await shareClaim(ctx, userId, existing, spots, place);
    return null;
  }
  if (spots.length >= MAX_VISIT_SPOTS) {
    throw new Error("Place has too many visited spots");
  }
  await rateLimiter.limit(ctx, "placeVisit", { key: userId, throws: true });
  if (existing !== null) {
    await ctx.db.patch(existing._id, {
      spots: [...spots, spot],
      stampPlaces: [...(existing.stampPlaces ?? []), entry],
    });
    return existing._id;
  }
  return await ctx.db.insert("placeVisits", {
    userId,
    key: placeKey(place.name),
    name: place.name.replace(/\s+/g, " ").trim().slice(0, MAX_PLACE_NAME_CHARS),
    listPlaceId: place._id,
    visitedAt: Date.now(),
    spots: [spot],
    stampPlaces: [entry],
  });
}

export async function stampListPlace(
  ctx: MutationCtx,
  userId: Id<"users">,
  place: Doc<"sharedListPlaces">,
  visited: boolean,
): Promise<void> {
  if (placeKey(place.name) === "") return;
  const existing = await findVisit(ctx, userId, place.name);
  if (!visited) {
    if (existing !== null) await unstampListPlace(ctx, existing, place);
    return;
  }
  const visitId = await addListSpot(ctx, userId, existing, place);
  if (visitId === null) return;
  if (place.addedBy === userId || (await aiAllowed(ctx, place.addedBy))) {
    const spot = listSpot(place);
    await ctx.scheduler.runAfter(0, internal.placeVisits.locateCountry, {
      visitId,
      lat: spot.lat,
      lng: spot.lng,
    });
  }
}

async function removeListSpot(
  ctx: MutationCtx,
  row: Doc<"placeVisits">,
  spot: Point,
): Promise<void> {
  const remaining = ((await rowSpots(ctx, row)) ?? []).filter(
    (kept) => !matchesVisitSpot(kept, spot, true),
  );
  if (remaining.length === 0) {
    await ctx.db.delete(row._id);
    return;
  }
  await ctx.db.patch(row._id, {
    spots: remaining,
    stampPlaces: row.stampPlaces?.filter(
      (entry) => entry.lat !== spot.lat || entry.lng !== spot.lng,
    ),
  });
}

async function forgetListWent(
  ctx: MutationCtx,
  row: Doc<"placeVisits">,
  spot: Point | undefined,
): Promise<void> {
  await forgetStampsWent(
    ctx,
    row.userId,
    (row.stampPlaces ?? []).filter(
      (entry) =>
        spot === undefined ||
        (entry.lat === spot.lat && entry.lng === spot.lng),
    ),
  );
}

async function forgetStampsWent(
  ctx: MutationCtx,
  userId: string,
  removed: readonly StampPlace[],
): Promise<void> {
  const ids = new Set(
    removed.flatMap((entry) => [
      ...(entry.listPlaceId === undefined ? [] : [entry.listPlaceId]),
      ...(entry.alsoListPlaceIds ?? []),
    ]),
  );
  for (const id of ids) {
    const place = await ctx.db.get(id);
    if (place === null) continue;
    const went = wentWithout(place, userId);
    if (went === place.went) continue;
    await ctx.db.patch(place._id, {
      went,
      ...((went ?? []).length === 0 ? { visitedAt: undefined } : {}),
    });
  }
}

export const removeListStamp = authedMutation({
  args: {
    name: v.string(),
    spot: v.optional(v.object({ lat: v.number(), lng: v.number() })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await findVisit(ctx, ctx.userId, args.name);
    if (row === null || row.itemId !== undefined) return null;
    await rateLimiter.limit(ctx, "placeVisitClear", {
      key: ctx.userId,
      throws: true,
    });
    if (args.spot === undefined) await ctx.db.delete(row._id);
    else await removeListSpot(ctx, row, args.spot);
    await forgetListWent(ctx, row, args.spot);
    return null;
  },
});

export const listVisits = authedQuery({
  args: {},
  returns: v.array(namedVisitMarkValidator),
  handler: async (ctx) => await userVisits(ctx, ctx.userId),
});

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
  return pin.city || soleCity(item.cities);
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

function stampPlacesFor(
  places: readonly StampPlace[] | undefined,
  spots: readonly Point[],
): (StampPlace | undefined)[] {
  const matched = spots.map((spot) => placeAt(places, spot));
  const claimed = new Set(matched);
  return spots.map((spot, index) => {
    const exact = matched[index];
    if (exact !== undefined) return exact;
    let nearest: StampPlace | undefined;
    for (const place of places ?? []) {
      const km = distanceKm(place, spot);
      if (
        !claimed.has(place) &&
        km <= SAME_PLACE_KM &&
        (nearest === undefined || km < distanceKm(nearest, spot))
      ) {
        nearest = place;
      }
    }
    claimed.add(nearest);
    return nearest;
  });
}

function keptStampPlaces(
  places: readonly StampPlace[],
  original: readonly VisitSpot[],
  remaining: readonly VisitSpot[],
): StampPlace[] {
  const before = stampPlacesFor(places, original);
  const own = remaining.map((spot) => before[original.indexOf(spot)]);
  const leftover = places.filter((place) => !own.includes(place));
  const unplaced = remaining.filter((_, index) => own[index] === undefined);
  const borrowed = stampPlacesFor(leftover, unplaced);
  return [...own, ...borrowed].filter((place) => place !== undefined);
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
  if (row.spots !== undefined) return row.spots;
  return withStampedSpots(row, markedSpots(row, item) ?? []);
}

async function ownedSave(
  ctx: QueryCtx,
  userId: string,
  itemId: Id<"items">,
): Promise<Doc<"items"> | null> {
  const item = await ctx.db.get(itemId);
  return item !== null && item.userId === userId ? item : null;
}

function unlocated(
  places: StampPlace[],
  released: StampPlace[] | undefined,
): StampPlace[] {
  return places.filter(
    (place) =>
      place.countryCode === undefined &&
      released?.some(
        (entry) => entry.lat === place.lat && entry.lng === place.lng,
      ) === true,
  );
}

async function syncStampPlaces(
  ctx: MutationCtx,
  row: Doc<"placeVisits">,
  marked: Doc<"items"> | null,
  options: {
    delayMs?: number;
    spacingMs?: number;
    retryMissing?: boolean;
    released?: StampPlace[];
  } = {},
): Promise<number> {
  const saved =
    row.itemId === undefined
      ? null
      : marked?._id === row.itemId
        ? marked
        : await ownedSave(ctx, row.userId, row.itemId);
  const spots = stampSpots(row, saved) ?? [];
  const fresh: StampPlace[] = [];
  const stored = stampPlacesFor(row.stampPlaces, spots);
  const places = spots.map((spot, index): StampPlace => {
    const known = stored[index];
    if (known !== undefined) {
      if (known.lat === spot.lat && known.lng === spot.lng) return known;
      const moved = { ...known, lat: spot.lat, lng: spot.lng };
      if (moved.countryCode === undefined) fresh.push(moved);
      return moved;
    }
    const city = cityAt(marked, spot) ?? cityAt(saved, spot);
    const place = { lat: spot.lat, lng: spot.lng, ...(city ? { city } : {}) };
    fresh.push(place);
    return place;
  });
  if (
    places.length !== (row.stampPlaces?.length ?? 0) ||
    places.some((place) => !row.stampPlaces?.includes(place))
  ) {
    await ctx.db.patch(row._id, { stampPlaces: places });
  }
  const lookups = options.retryMissing
    ? places.filter((place) => place.countryCode === undefined)
    : [...fresh, ...unlocated(places, options.released)];
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
              itemId: existing.itemId ?? item._id,
              visitedAt: existing.visitedAt,
            };
      const spots = spot ? [spot] : spotsOnItem(item, name);
      await markVisit(ctx, {
        userId,
        key,
        existing,
        visit,
        spots,
        explicit: spot !== undefined,
      });
      const found = await findVisit(ctx, userId, name);
      if (found === null) continue;
      if (existing === null)
        await ctx.db.patch(found._id, { backfilled: true });
      const claim = await claimMarkedSpots(ctx, found, spots);
      queued += await syncStampPlaces(ctx, claim.row, item, {
        released: claim.released,
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

type PassportStamp = Infer<typeof stampValidator>;
type StampRow = Omit<PassportStamp, "cover" | "itemId"> & {
  itemId?: Id<"items">;
  listPlaceId?: Id<"sharedListPlaces">;
  appleId?: string;
};

async function stampRows(
  ctx: QueryCtx,
  userId: string,
  readSaves: readonly Doc<"items">[] = [],
): Promise<{
  stamps: StampRow[];
  saves: Map<Id<"items">, Doc<"items"> | null>;
}> {
  const rows = (await visitRows(ctx, userId)).slice(0, MAX_PASSPORT_STAMPS);
  const known = new Map(readSaves.map((save) => [save._id, save]));
  const saves = new Map<Id<"items">, Doc<"items"> | null>();
  let bytes = 0;
  for (const { itemId } of rows) {
    if (itemId === undefined || saves.has(itemId)) continue;
    if (bytes >= PASSPORT_SAVE_BYTES) break;
    const owned = known.get(itemId) ?? (await ownedSave(ctx, userId, itemId));
    bytes += approximateDocBytes(owned);
    saves.set(itemId, owned);
  }
  const stamps: StampRow[] = [];
  for (const row of rows) {
    const owned =
      row.itemId === undefined ? null : (saves.get(row.itemId) ?? null);
    const source = reelSource(owned);
    const base = {
      key: row.key,
      name: row.name,
      ...(row.itemId === undefined ? {} : { itemId: row.itemId }),
      visitedAt: row.visitedAt,
      ...(row.backfilled ? { backfilled: true } : {}),
      ...(source ? { source } : {}),
    };
    const spots = stampSpots(row, owned);
    if (spots === undefined) {
      stamps.push(
        row.listPlaceId === undefined
          ? base
          : { ...base, listPlaceId: row.listPlaceId },
      );
      continue;
    }
    const stored = stampPlacesFor(row.stampPlaces, spots);
    for (const [index, spot] of spots.entries()) {
      const place = stored[index];
      const city = place?.city ?? cityAt(owned, spot);
      stamps.push({
        ...base,
        lat: spot.lat,
        lng: spot.lng,
        ...(spot.appleId === undefined ? {} : { appleId: spot.appleId }),
        ...(city ? { city } : {}),
        ...(place?.countryCode ? { countryCode: place.countryCode } : {}),
        ...(place?.listPlaceId ? { listPlaceId: place.listPlaceId } : {}),
      });
    }
  }
  return { stamps: stamps.slice(0, MAX_PASSPORT_STAMPS), saves };
}

export async function passportPlaces(
  ctx: QueryCtx,
  userId: string,
): Promise<PassportPlace[]> {
  const { stamps } = await stampRows(ctx, userId);
  return stamps.map(({ name, city: raw, lat, lng, countryCode }) => {
    const cities = normalizeCities(raw ? [raw] : []);
    const city = cities.at(0);
    return {
      name: normalizePlaceName(name, cities),
      ...(city ? { city } : {}),
      ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
      ...(countryCode ? { countryCode } : {}),
    };
  });
}

async function stampsWithCovers(ctx: QueryCtx, userId: string) {
  const { stamps, saves } = await stampRows(ctx, userId);
  const covers = new Map<Id<"items">, string | null>();
  for (const [itemId, owned] of saves) {
    covers.set(itemId, await coverOf(ctx, owned));
  }
  return stamps.map(({ appleId: _appleId, ...stamp }) => ({
    ...stamp,
    cover:
      stamp.itemId === undefined ? null : (covers.get(stamp.itemId) ?? null),
  }));
}

const listedStampValidator = v.object({
  ...stampValidator.fields,
  itemId: v.optional(v.id("items")),
  listPlaceId: v.optional(v.id("sharedListPlaces")),
});

export const listPassportStamps = authedQuery({
  args: {},
  returns: v.array(listedStampValidator),
  handler: async (ctx) => await stampsWithCovers(ctx, ctx.userId),
});

export const getPassport = authedQuery({
  args: {},
  returns: v.array(stampValidator),
  handler: async (ctx) => {
    const stamps = await stampsWithCovers(ctx, ctx.userId);
    return stamps.flatMap(({ itemId, listPlaceId: _listPlaceId, ...stamp }) =>
      itemId === undefined ? [] : [{ ...stamp, itemId }],
    );
  },
});

function stampListPlaceIds(
  row: Doc<"placeVisits">,
): Id<"sharedListPlaces">[][] {
  const groups = (row.stampPlaces ?? []).map((place) => [
    ...(place.listPlaceId === undefined ? [] : [place.listPlaceId]),
    ...(place.alsoListPlaceIds ?? []),
  ]);
  if (groups.length > 0) return groups;
  return row.listPlaceId === undefined ? [] : [[row.listPlaceId]];
}

async function wentWithFriend(
  ctx: QueryCtx,
  userId: Id<"users">,
  place: Doc<"sharedListPlaces">,
  members: Map<string, boolean>,
): Promise<boolean> {
  const isMember = async (memberId: Id<"users">) => {
    const key = `${place.listId}:${memberId}`;
    let known = members.get(key);
    if (known === undefined) {
      known = (await memberOf(ctx, place.listId, memberId)) !== null;
      members.set(key, known);
    }
    return known;
  };
  if (!(await isMember(userId))) return false;
  for (const entry of place.went ?? []) {
    if (entry.userId !== userId && (await isMember(entry.userId))) return true;
  }
  return false;
}

export const passportTogether = authedQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const rows = (await visitRows(ctx, ctx.userId)).slice(
      0,
      MAX_PASSPORT_STAMPS,
    );
    const places = new Map<
      Id<"sharedListPlaces">,
      Doc<"sharedListPlaces"> | null
    >();
    const members = new Map<string, boolean>();
    let together = 0;
    for (const ids of rows.flatMap(stampListPlaceIds)) {
      for (const id of ids) {
        if (!places.has(id)) places.set(id, await ctx.db.get(id));
        const place = places.get(id);
        if (place && (await wentWithFriend(ctx, ctx.userId, place, members))) {
          together += 1;
          break;
        }
      }
    }
    return together;
  },
});

const badgeStampValidator = v.object({
  city: v.optional(v.string()),
  countryCode: v.optional(v.string()),
  kinds: v.array(v.string()),
});

function stampKinds(save: Doc<"items"> | null, stamp: StampRow) {
  if (save === null) return [];
  const pins = save.placePins ?? [];
  const pin =
    pins.find(
      (candidate) =>
        stamp.appleId !== undefined && candidate.appleId === stamp.appleId,
    ) ??
    pins.find(
      (candidate) =>
        candidate.lat === stamp.lat &&
        candidate.lng === stamp.lng &&
        (stamp.appleId === undefined ||
          candidate.appleId === undefined ||
          candidate.appleId === stamp.appleId),
    );
  return placeKinds(pin?.category, save.tags, pin?.cuisine);
}

export const listBadgeStamps = authedQuery({
  args: {},
  returns: v.array(badgeStampValidator),
  handler: async (ctx) => {
    const { stamps, saves } = await stampRows(ctx, ctx.userId);
    const listPlaces = new Map<
      Id<"sharedListPlaces">,
      Doc<"sharedListPlaces"> | null
    >();
    const listKinds = async (id: Id<"sharedListPlaces">) => {
      if (!listPlaces.has(id)) listPlaces.set(id, await ctx.db.get(id));
      const place = listPlaces.get(id);
      return place ? placeKinds(place.category, place.tags ?? []) : [];
    };
    const badges = [];
    for (const stamp of stamps) {
      const fromSave = stampKinds(
        stamp.itemId === undefined ? null : (saves.get(stamp.itemId) ?? null),
        stamp,
      );
      badges.push({
        ...(stamp.city ? { city: stamp.city } : {}),
        ...(stamp.countryCode ? { countryCode: stamp.countryCode } : {}),
        kinds:
          fromSave.length > 0 || stamp.listPlaceId === undefined
            ? fromSave
            : await listKinds(stamp.listPlaceId),
      });
    }
    return badges;
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

const unstampedPlaceValidator = v.object({
  itemId: v.id("items"),
  name: v.string(),
  city: v.string(),
  spot: visitSpotValidator,
  title: v.optional(v.string()),
  cover: v.union(v.string(), v.null()),
});

type UnstampedPin = Point & {
  name: string;
  appleId?: string;
  city: string;
  item: Doc<"items">;
};

async function unstampedRows(ctx: QueryCtx, places: readonly UnstampedPin[]) {
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
  handler: async (ctx) =>
    await unstampedRows(
      ctx,
      uniquePlacePins(await unstampedPins(ctx, ctx.userId)).slice(
        0,
        MAX_UNSTAMPED_PLACES,
      ),
    ),
});

async function unstampedPinsInCity(
  ctx: QueryCtx,
  userId: Id<"users">,
  city: string,
): Promise<UnstampedPin[]> {
  if (cityKey(city) === "") return [];
  const saves = await rawReadySavesNewestFirst(ctx, userId);
  const removals = await userRemovals(ctx, userId);
  const visible = saves.map((item) => visibleCitySave(item, removals));
  const pins = uniquePlacePins(
    citySaves(visible, city).flatMap((item) =>
      pinsForCity(item, city).map((pin) => ({
        ...pin,
        city: pinCity(item, pin) ?? tidyCity(city),
        item,
      })),
    ),
  );
  const visited = visitMatcher(await userVisits(ctx, userId, saves), pins);
  return pins.filter((pin) => !visited(pin));
}

export const listUnstampedPlacesInCity = authedQuery({
  args: { city: v.string() },
  returns: v.array(unstampedPlaceValidator),
  handler: async (ctx, { city }) =>
    await unstampedRows(
      ctx,
      (await unstampedPinsInCity(ctx, ctx.userId, city)).slice(
        0,
        MAX_UNSTAMPED_PLACES,
      ),
    ),
});

export const cityCompletion = authedQuery({
  args: {},
  returns: v.array(cityCompletionValidator),
  handler: async (ctx) => {
    const { userId } = ctx;
    const saves = await rawReadySavesNewestFirst(ctx, userId);
    const removals = await userRemovals(ctx, userId);
    const { stamps } = await stampRows(ctx, userId, saves);
    return completionByCity({
      saves: saves.map((item) => visibleCitySave(item, removals)),
      stamps,
      visits: await userVisits(ctx, userId, saves),
      savesPerCity: CITY_ITEMS_MAX,
    });
  },
});

const countryLookupArgs = {
  visitId: v.id("placeVisits"),
  lat: v.number(),
  lng: v.number(),
};

async function listAdderAllows(
  ctx: QueryCtx,
  visit: Doc<"placeVisits">,
  stamped: StampPlace,
): Promise<boolean> {
  const listPlaceId = stamped.listPlaceId;
  if (listPlaceId === undefined) return true;
  const place = await ctx.db.get(listPlaceId);
  if (place === null) return false;
  return (
    place.addedBy === visit.userId || (await aiAllowed(ctx, place.addedBy))
  );
}

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
    if (!(await listAdderAllows(ctx, visit, place))) return null;
    const budget = await rateLimiter.limit(ctx, "visitCountryGlobal");
    return budget.ok ? { ready: true as const } : { busyMs: budget.retryAfter };
  },
});

export const storeCountry = internalMutation({
  args: { ...countryLookupArgs, countryCode: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const visit = await ctx.db.get(args.visitId);
    if (
      visit === null ||
      placeAt(visit.stampPlaces, args) === undefined ||
      (await liveOwner(ctx, visit.userId)) === null
    ) {
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
