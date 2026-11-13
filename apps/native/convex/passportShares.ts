import { v } from "convex/values";
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
import {
  comparePassports,
  groupByCity,
  passportCounts,
  type PassportPlace,
} from "./model/passport";
import { rateLimiter } from "./model/rateLimiter";
import { buildSearchText } from "./model/searchText";
import { inviteToken } from "./model/sharedLists";
import { cityKey } from "./model/trip";
import { passportPlaces } from "./placeVisits";

const DELETE_BATCH = 50;
const MAX_FRIEND_SAVES = 50;
const MAX_FRIEND_NOTE_CHARS = 200;
const DOT_STEP = 10;
const LOCATE_SPACING_MS = 2_000;

const dotValidator = v.object({ lat: v.number(), lng: v.number() });

const publicPassportValidator = v.object({
  ownerName: v.optional(v.string()),
  places: v.number(),
  cities: v.number(),
  countries: v.union(v.number(), v.null()),
  byCity: v.array(
    v.object({
      city: v.optional(v.string()),
      dot: v.optional(dotValidator),
      names: v.array(v.string()),
    }),
  ),
});

const comparePlaceValidator = v.object({
  name: v.string(),
  city: v.optional(v.string()),
});

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

function roundDot(value: number): number {
  return Math.round(value * DOT_STEP) / DOT_STEP;
}

function cityDot(places: readonly PassportPlace[]) {
  const spots = places.flatMap(({ lat, lng }) =>
    lat !== undefined && lng !== undefined ? [{ lat, lng }] : [],
  );
  if (spots.length === 0) return undefined;
  const mean = (pick: (spot: { lat: number; lng: number }) => number) =>
    roundDot(spots.reduce((sum, spot) => sum + pick(spot), 0) / spots.length);
  return { lat: mean((spot) => spot.lat), lng: mean((spot) => spot.lng) };
}

function publicPassport(
  ownerName: string | undefined,
  places: readonly PassportPlace[],
) {
  return {
    ...(ownerName !== undefined ? { ownerName } : {}),
    ...passportCounts(places),
    byCity: groupByCity(places).map(({ city, items }) => {
      const dot = city === null ? undefined : cityDot(items);
      return {
        ...(city !== null ? { city } : {}),
        ...(dot ? { dot } : {}),
        names: items.map((place) => place.name),
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
      await passportPlaces(ctx, owner._id),
    ),
  };
}

function placesOnSave(item: Doc<"items">): PassportPlace[] {
  const cities = item.cities ?? [];
  const only = cities.length === 1 ? cities[0] : undefined;
  const pins = (item.placePins ?? []).flatMap((pin) => {
    const city = pin.city || only;
    return city
      ? [
          {
            name: normalizePlaceName(pin.name, [city]),
            city,
            lat: pin.lat,
            lng: pin.lng,
          },
        ]
      : [];
  });
  const names =
    only === undefined
      ? []
      : (item.places ?? []).map((name) => ({
          name: normalizePlaceName(name, [only]),
          city: only,
        }));
  return [...pins, ...names];
}

async function compareWith(
  ctx: QueryCtx,
  userId: Id<"users">,
  ownerId: Id<"users">,
) {
  const saves = await readySavesNewestFirst(ctx, userId);
  return comparePassports(
    await passportPlaces(ctx, userId),
    await passportPlaces(ctx, ownerId),
    saves.flatMap(placesOnSave),
  );
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
    const token = inviteToken();
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
      toSave: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const owner = await liveSharer(ctx, args.token);
    if (owner === null) return null;
    const { toSave, ...lists } = await compareWith(ctx, ctx.userId, owner._id);
    const ownerName = firstNameOf(owner.name);
    return {
      ...(ownerName !== undefined ? { ownerName } : {}),
      ...lists,
      toSave: toSave.length,
    };
  },
});

export const saveFriendPlaces = authedMutation({
  args: { token: v.string(), note: v.string() },
  returns: v.union(
    v.null(),
    v.object({ saved: v.number(), remaining: v.number() }),
  ),
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const owner = await liveSharer(ctx, args.token);
    if (owner === null) return null;
    const { toSave } = await compareWith(ctx, userId, owner._id);
    const picked = toSave.slice(0, MAX_FRIEND_SAVES);
    const remaining = toSave.length - picked.length;
    if (picked.length === 0) return { saved: 0, remaining };
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
    return { saved: picked.length, remaining };
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
