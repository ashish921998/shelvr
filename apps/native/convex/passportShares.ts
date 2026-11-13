import { type Infer, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  internalQuery,
  type MutationCtx,
  query,
  type QueryCtx,
} from "./_generated/server";
import { claimSave, recordFreeSave, settleFreeSave } from "./freeSaves";
import { readySavesNewestFirst } from "./items";
import { authedMutation, authedQuery, liveOwner } from "./model/auth";
import { firstNameOf } from "./model/firstName";
import { normalizeCities, normalizePlaceName } from "./model/itemFields";
import { placeKey } from "./model/plan";
import { rateLimiter } from "./model/rateLimiter";
import { buildSearchText } from "./model/searchText";
import { cityKey, distanceKm, SAME_PLACE_KM } from "./model/trip";
import { passportStamps } from "./placeVisits";

const DELETE_BATCH = 50;
const MAX_FRIEND_SAVES = 50;
const MAX_FRIEND_NOTE_CHARS = 200;
const DOT_STEP = 10;
const LOCATE_SPACING_MS = 2_000;

type Place = {
  key: string;
  name: string;
  city?: string;
  lat?: number;
  lng?: number;
  countryCode?: string;
};

const dotValidator = v.object({ lat: v.number(), lng: v.number() });

const publicPassportValidator = v.object({
  ownerName: v.optional(v.string()),
  places: v.number(),
  cities: v.number(),
  countries: v.union(v.number(), v.null()),
  stamps: v.array(
    v.object({
      name: v.string(),
      city: v.optional(v.string()),
      dot: v.optional(dotValidator),
    }),
  ),
});

type PublicPassport = Infer<typeof publicPassportValidator>;

const comparePlaceValidator = v.object({
  name: v.string(),
  city: v.optional(v.string()),
});

function newToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function shareOf(
  ctx: QueryCtx,
  userId: string,
): Promise<Doc<"passportShares"> | null> {
  return await ctx.db
    .query("passportShares")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
}

async function liveSharer(
  ctx: QueryCtx,
  token: string,
): Promise<Doc<"users"> | null> {
  if (token === "") return null;
  const share = await ctx.db
    .query("passportShares")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  return share === null ? null : await liveOwner(ctx, share.userId);
}

async function placesOf(ctx: QueryCtx, userId: string): Promise<Place[]> {
  const places = await passportStamps(ctx, userId, async () => null);
  return places.map((place) => {
    const name = normalizePlaceName(place.name, place.city ? [place.city] : []);
    return name === place.name
      ? place
      : { ...place, name, key: placeKey(name) };
  });
}

function roundDot(value: number): number {
  return Math.round(value * DOT_STEP) / DOT_STEP;
}

function cityDots(places: readonly Place[]) {
  const sums = new Map<string, { lat: number; lng: number; count: number }>();
  for (const place of places) {
    if (place.lat === undefined || place.lng === undefined) continue;
    const key = cityKey(place.city ?? "");
    if (key === "") continue;
    const sum = sums.get(key) ?? { lat: 0, lng: 0, count: 0 };
    sums.set(key, {
      lat: sum.lat + place.lat,
      lng: sum.lng + place.lng,
      count: sum.count + 1,
    });
  }
  return new Map(
    [...sums].map(([key, sum]) => [
      key,
      {
        lat: roundDot(sum.lat / sum.count),
        lng: roundDot(sum.lng / sum.count),
      },
    ]),
  );
}

function publicPassport(
  ownerName: string | undefined,
  places: readonly Place[],
): PublicPassport {
  const dots = cityDots(places);
  const cities = new Set(
    places.flatMap((place) => (place.city ? [cityKey(place.city)] : [])),
  );
  const countries = new Set(
    places.flatMap((place) => (place.countryCode ? [place.countryCode] : [])),
  );
  return {
    ...(ownerName !== undefined ? { ownerName } : {}),
    places: places.length,
    cities: cities.size,
    countries: countries.size > 0 ? countries.size : null,
    stamps: places.map((place) => {
      const dot = dots.get(cityKey(place.city ?? ""));
      return {
        name: place.name,
        ...(place.city ? { city: place.city } : {}),
        ...(dot ? { dot } : {}),
      };
    }),
  };
}

async function sharedPassport(ctx: QueryCtx, token: string) {
  const owner = await liveSharer(ctx, token);
  if (owner === null) return null;
  return {
    ownerId: owner._id,
    passport: publicPassport(
      firstNameOf(owner.name),
      await placesOf(ctx, owner._id),
    ),
  };
}

function samePlace(a: Place, b: Place): boolean {
  if (a.key !== b.key) return false;
  if (cityKey(a.city ?? "") !== cityKey(b.city ?? "")) return false;
  if (
    a.lat === undefined ||
    a.lng === undefined ||
    b.lat === undefined ||
    b.lng === undefined
  ) {
    return true;
  }
  return (
    distanceKm({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }) <=
    SAME_PLACE_KM
  );
}

function distinct(places: readonly Place[]) {
  const kept: Place[] = [];
  for (const place of places) {
    if (!kept.some((other) => samePlace(place, other))) kept.push(place);
  }
  return kept.map((place) => ({
    name: place.name,
    ...(place.city ? { city: place.city } : {}),
  }));
}

function comparePlaces(mine: readonly Place[], theirs: readonly Place[]) {
  const shared = (place: Place, others: readonly Place[]) =>
    others.some((other) => samePlace(place, other));
  return {
    both: mine.filter((place) => shared(place, theirs)),
    onlyThem: theirs.filter((place) => !shared(place, mine)),
    onlyYou: mine.filter((place) => !shared(place, theirs)),
  };
}

async function savedPlaceIds(
  ctx: QueryCtx,
  userId: string,
): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const item of await readySavesNewestFirst(ctx, userId)) {
    const cities = (item.cities ?? []).map(cityKey);
    const keyOf = (name: string) =>
      placeKey(normalizePlaceName(name, item.cities ?? []));
    const pinned = new Set(
      (item.placePins ?? []).map((pin) => keyOf(pin.name)),
    );
    for (const name of item.places ?? []) {
      if (pinned.has(keyOf(name))) continue;
      for (const city of cities) ids.add(`${keyOf(name)}|${city}`);
    }
    for (const pin of item.placePins ?? []) {
      for (const city of pin.city ? [cityKey(pin.city)] : cities) {
        ids.add(`${keyOf(pin.name)}|${city}`);
      }
    }
  }
  return ids;
}

async function saveFriendPlace(
  ctx: MutationCtx,
  userId: Id<"users">,
  place: { name: string; city: string },
  note: string,
): Promise<Id<"items">> {
  const free = await claimSave(ctx, userId);
  const cities = normalizeCities([place.city]);
  const name = normalizePlaceName(place.name, cities);
  const itemId = await ctx.db.insert("items", {
    userId,
    type: "note",
    status: "ready",
    title: name,
    note,
    tags: [],
    intents: [],
    cities,
    places: [name],
    placesEdited: true,
    titleSource: "user",
    searchText: buildSearchText({ title: name, tags: [], note, cities }),
  });
  if (free) {
    await recordFreeSave(ctx, userId, itemId);
    await settleFreeSave(ctx, itemId);
  }
  const item = await ctx.db.get(itemId);
  if (item !== null) {
    await ctx.scheduler.runAfter(0, internal.analytics.captureSave, {
      itemId,
      userId,
      itemType: item.type,
      savedAt: item._creationTime,
    });
  }
  return itemId;
}

export const sharePassport = authedMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const existing = await shareOf(ctx, ctx.userId);
    if (existing !== null) return existing.token;
    await rateLimiter.limit(ctx, "passportShare", {
      key: ctx.userId,
      throws: true,
    });
    const token = newToken();
    await ctx.db.insert("passportShares", { token, userId: ctx.userId });
    return token;
  },
});

export const myPassportShare = authedQuery({
  args: {},
  returns: v.union(v.string(), v.null()),
  handler: async (ctx) => (await shareOf(ctx, ctx.userId))?.token ?? null,
});

export const stopSharingPassport = authedMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await deletePassportSharesForUser(ctx, ctx.userId);
    return null;
  },
});

export const passportPreview = query({
  args: { token: v.string() },
  returns: v.union(v.null(), publicPassportValidator),
  handler: async (ctx, args) =>
    (await sharedPassport(ctx, args.token))?.passport ?? null,
});

export const getPublicPassport = internalQuery({
  args: { token: v.string() },
  returns: v.union(
    v.null(),
    v.object({ ownerId: v.id("users"), passport: publicPassportValidator }),
  ),
  handler: async (ctx, args) => await sharedPassport(ctx, args.token),
});

export const comparePassport = authedQuery({
  args: { token: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      ownerName: v.optional(v.string()),
      both: v.array(comparePlaceValidator),
      onlyThem: v.array(comparePlaceValidator),
      onlyYou: v.array(comparePlaceValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const owner = await liveSharer(ctx, args.token);
    if (owner === null) return null;
    const lists = comparePlaces(
      await placesOf(ctx, ctx.userId),
      await placesOf(ctx, owner._id),
    );
    const ownerName = firstNameOf(owner.name);
    return {
      ...(ownerName !== undefined ? { ownerName } : {}),
      both: distinct(lists.both),
      onlyThem: distinct(lists.onlyThem),
      onlyYou: distinct(lists.onlyYou),
    };
  },
});

export const saveFriendPlaces = authedMutation({
  args: { token: v.string(), note: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      saved: v.number(),
      skipped: v.number(),
      remaining: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const owner = await liveSharer(ctx, args.token);
    if (owner === null) return null;
    const { onlyThem } = comparePlaces(
      await placesOf(ctx, userId),
      await placesOf(ctx, owner._id),
    );
    const saved = await savedPlaceIds(ctx, userId);
    const candidates = distinct(onlyThem);
    const fresh = candidates.flatMap((place) => {
      const [city] = normalizeCities(place.city ? [place.city] : []);
      if (city === undefined) return [];
      const name = normalizePlaceName(place.name, [city]);
      const id = `${placeKey(name)}|${cityKey(city)}`;
      if (saved.has(id)) return [];
      saved.add(id);
      return [{ name, city }];
    });
    const picked = fresh.slice(0, MAX_FRIEND_SAVES);
    const skipped = candidates.length - fresh.length;
    const remaining = fresh.length - picked.length;
    if (picked.length === 0) return { saved: 0, skipped, remaining };
    await rateLimiter.limit(ctx, "friendPlaceSave", {
      key: userId,
      count: picked.length,
      throws: true,
    });
    const note = args.note
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_FRIEND_NOTE_CHARS);
    for (const [index, place] of picked.entries()) {
      const itemId = await saveFriendPlace(ctx, userId, place, note);
      await ctx.scheduler.runAfter(
        index * LOCATE_SPACING_MS,
        internal.placePins.locateItem,
        { itemId },
      );
    }
    return { saved: picked.length, skipped, remaining };
  },
});

export async function deletePassportSharesForUser(
  ctx: MutationCtx,
  userId: string,
): Promise<boolean> {
  const shares = await ctx.db
    .query("passportShares")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(DELETE_BATCH);
  for (const share of shares) await ctx.db.delete(share._id);
  return shares.length !== DELETE_BATCH;
}
