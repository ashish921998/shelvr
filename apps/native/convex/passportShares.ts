import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalQuery,
  type MutationCtx,
  query,
  type QueryCtx,
} from "./_generated/server";
import { createReadyPlaceSave, readySavesNewestFirst } from "./items";
import { authedMutation, authedQuery, liveOwner } from "./model/auth";
import { firstNameOf } from "./model/firstName";
import {
  comparePassports,
  groupByCity,
  passportCounts,
  type PassportPlace,
  placesOnSave,
} from "./model/passport";
import { rateLimiter } from "./model/rateLimiter";
import { inviteToken } from "./model/sharedLists";
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
  return publicPassport(
    firstNameOf(owner.name),
    await passportPlaces(ctx, owner._id),
  );
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
  handler: async (ctx, args) => await sharedPassport(ctx, args.token),
});

export const getPublicPassport = internalQuery({
  args: { token: v.string() },
  returns: v.union(v.null(), publicPassportValidator),
  handler: async (ctx, args) => await sharedPassport(ctx, args.token),
});

export const passportSharer = internalQuery({
  args: { token: v.string() },
  returns: v.union(v.id("users"), v.null()),
  handler: async (ctx, args) =>
    (await liveSharer(ctx, args.token))?._id ?? null,
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
      await createReadyPlaceSave(
        ctx,
        userId,
        place,
        note,
        index * LOCATE_SPACING_MS,
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
