import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireUserId } from "./model/auth";
import { aiAllowed } from "./aiConsent";
import { aiConsentRequiredError } from "./model/aiConsent";
import {
  MAX_BEEN_PLACES,
  MAX_PLAN_ITEMS,
  PLAN_CONTENT_CHARS,
  planSourceValidator,
  type PlanSource,
} from "./model/plan";
import { rateLimiter } from "./model/rateLimiter";
import {
  swapStop,
  tripDayValidator,
  tripPaceValidator,
  tripSlotValidator,
  tripStopValidator,
  type TripStop,
} from "./model/trip";
import { requireProEntitlement } from "./subscriptions";

// The database half of "Plan my trip" (trips.ts is the action): what the
// trip may read, the stored trip, and the reads the trip screen makes.

/** A trip reads the same saves a plan does: the space's newest filed. */
const MAX_TRIP_ITEMS = MAX_PLAN_ITEMS;

function cityKey(city: string): string {
  return city.replace(/\s+/g, " ").trim().toLowerCase();
}

/** The space's ready saves, newest filed first: saved rows plus legacy rows
 * (no status reads as saved), bounded. */
async function loadTripSaves(
  ctx: QueryCtx,
  spaceId: Id<"spaces">,
  userId: string,
): Promise<{ item: Doc<"items">; join: Doc<"spaceItems"> }[]> {
  const [saved, legacy] = await Promise.all(
    (["saved", undefined] as const).map((status) =>
      ctx.db
        .query("spaceItems")
        .withIndex("by_space_and_status", (q) =>
          q.eq("spaceId", spaceId).eq("status", status),
        )
        .order("desc")
        .take(MAX_TRIP_ITEMS),
    ),
  );
  const joins = [...saved, ...legacy]
    .sort((a, b) => b._creationTime - a._creationTime)
    .slice(0, MAX_TRIP_ITEMS);
  const saves: { item: Doc<"items">; join: Doc<"spaceItems"> }[] = [];
  for (const join of joins) {
    const item = await ctx.db.get(join.itemId);
    if (item === null || item.userId !== userId) continue;
    if (item.status !== "ready") continue;
    saves.push({ item, join });
  }
  return saves;
}

/** Cities the saves name, most saves first, each in the spelling most of
 * them use. */
function countCities(items: Doc<"items">[]): { city: string; count: number }[] {
  const counts = new Map<
    string,
    { count: number; spellings: Map<string, number> }
  >();
  for (const item of items) {
    const seen = new Set<string>();
    for (const city of item.cities ?? []) {
      const key = cityKey(city);
      if (key === "" || seen.has(key)) continue;
      seen.add(key);
      const entry = counts.get(key) ?? { count: 0, spellings: new Map() };
      const spelling = city.replace(/\s+/g, " ").trim();
      entry.count++;
      entry.spellings.set(spelling, (entry.spellings.get(spelling) ?? 0) + 1);
      counts.set(key, entry);
    }
  }
  return [...counts.values()]
    .map(({ count, spellings }) => ({
      city: [...spellings].sort((a, b) => b[1] - a[1])[0][0],
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

function toSource(item: Doc<"items">, join: Doc<"spaceItems">): PlanSource {
  return {
    itemId: item._id,
    title: item.title,
    description: item.description,
    content:
      [item.note, item.content]
        .filter(Boolean)
        .join("\n")
        .slice(0, PLAN_CONTENT_CHARS) || undefined,
    url: item.url,
    siteName: item.siteName,
    author: item.author,
    places: [...(item.intents ?? []), ...(join.intents ?? [])]
      .filter((intent) => intent.kind === "open_maps")
      .map((intent) => intent.value),
  };
}

/**
 * Claims one trip: the space is the caller's, they are Pro and allow AI, and
 * the makeTrip limit has room. Returns the saves to read. With `city`, a
 * save that names only other cities is left out; a save that names no city
 * stays, since a reel often shows a place without saying where. The trip's
 * city is `city`, else the one most saves name.
 */
export const claimTripInternal = internalMutation({
  args: { spaceId: v.id("spaces"), city: v.optional(v.string()) },
  returns: v.object({
    spaceName: v.string(),
    city: v.optional(v.string()),
    sources: v.array(planSourceValidator),
    been: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    // Convex forwards the action caller's identity, so authorization and the
    // claim are one transaction.
    const userId = await requireUserId(ctx);
    const space = await ctx.db.get(args.spaceId);
    if (space === null || space.userId !== userId) {
      throw new Error("Space not found");
    }
    await requireProEntitlement(ctx, userId);
    if (!(await aiAllowed(ctx, userId))) {
      throw aiConsentRequiredError();
    }
    const wanted = args.city !== undefined ? cityKey(args.city) : "";
    const saves = (await loadTripSaves(ctx, args.spaceId, userId)).filter(
      ({ item }) =>
        wanted === "" ||
        (item.cities ?? []).length === 0 ||
        (item.cities ?? []).some((city) => cityKey(city) === wanted),
    );
    const city =
      wanted !== ""
        ? args.city?.trim()
        : countCities(saves.map(({ item }) => item))[0]?.city;
    const sources = saves.map(({ item, join }) => toSource(item, join));
    if (sources.length === 0) {
      return { spaceName: space.name, city, sources, been: [] };
    }
    await rateLimiter.limit(ctx, "makeTrip", { key: userId, throws: true });
    const visits = await ctx.db
      .query("placeVisits")
      .withIndex("by_user_and_visited", (q) => q.eq("userId", userId))
      .order("desc")
      .take(MAX_BEEN_PLACES);
    return {
      spaceName: space.name,
      city,
      sources,
      been: visits.map((visit) => visit.name),
    };
  },
});

/**
 * Claims `count` Apple Maps calls from the deployment-wide daily bucket,
 * which sits under Apple's free 25,000 a day. False when it is spent: the
 * trip is then made without a map, never refused.
 */
export const claimMapLookupsInternal = internalMutation({
  args: { count: v.number() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.count) || args.count < 1) return false;
    const { ok } = await rateLimiter.limit(ctx, "appleMapsGlobal", {
      count: args.count,
    });
    return ok;
  },
});

/** Removes a space's trips. A space holds at most one, so one read covers
 * it; the bound only guards against a race that left two. */
export async function deleteTripsForSpace(
  ctx: MutationCtx,
  spaceId: Id<"spaces">,
): Promise<void> {
  const trips = await ctx.db
    .query("trips")
    .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
    .take(10);
  for (const trip of trips) {
    await ctx.db.delete(trip._id);
  }
}

/** Stores a finished trip in place of the space's last one. */
export const saveTripInternal = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    city: v.optional(v.string()),
    pace: tripPaceValidator,
    startDate: v.optional(v.string()),
    days: v.array(tripDayValidator),
    wishlist: v.array(tripStopValidator),
    considered: v.number(),
    locatedAt: v.optional(v.number()),
  },
  returns: v.id("trips"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const space = await ctx.db.get(args.spaceId);
    // The space may have been deleted while the trip was being made.
    if (space === null || space.userId !== userId) {
      throw new Error("Space not found");
    }
    await deleteTripsForSpace(ctx, args.spaceId);
    return await ctx.db.insert("trips", { userId, ...args });
  },
});

/**
 * "Swap": trades one stop for the wishlist place that best takes its spot
 * (same time of day, then nearest). The stop moves to the wishlist, so a
 * second swap can bring it back. No model call.
 */
export const swapTripStop = mutation({
  args: { tripId: v.id("trips"), day: v.number(), stop: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const trip = await ctx.db.get(args.tripId);
    if (trip === null || trip.userId !== userId) {
      throw new Error("Trip not found");
    }
    await requireProEntitlement(ctx, userId);
    const swapped = swapStop(trip, args.day, args.stop);
    if (swapped === null) {
      throw new ConvexError({
        code: "nothing_to_swap",
        message: "No other saved place to swap in",
      });
    }
    await ctx.db.patch(trip._id, swapped);
    return null;
  },
});

const tripStopViewValidator = v.object({
  ...tripStopValidator.fields,
  // The save's cover, its creator ("@handle" or the site), and its link, for
  // the stop sheet.
  cover: v.optional(v.string()),
  creator: v.optional(v.string()),
  url: v.optional(v.string()),
});

const tripViewValidator = v.object({
  _id: v.id("trips"),
  _creationTime: v.number(),
  city: v.optional(v.string()),
  pace: tripPaceValidator,
  startDate: v.optional(v.string()),
  days: v.array(
    v.object({
      areas: v.array(v.string()),
      stops: v.array(tripStopViewValidator),
      gaps: v.array(tripSlotValidator),
    }),
  ),
  wishlist: v.array(tripStopViewValidator),
  considered: v.number(),
  locatedAt: v.optional(v.number()),
});

/**
 * The space's trip, or null when there is none. A stop whose save was
 * deleted since drops out; the rest of its day stays as it was.
 */
export const getSpaceTrip = query({
  args: { spaceId: v.id("spaces") },
  returns: v.union(tripViewValidator, v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const space = await ctx.db.get(args.spaceId);
    if (space === null || space.userId !== userId) return null;
    const trip = await ctx.db
      .query("trips")
      .withIndex("by_space", (q) => q.eq("spaceId", args.spaceId))
      .order("desc")
      .first();
    if (trip === null || trip.userId !== userId) return null;

    const view = async (stop: TripStop) => {
      const item = await ctx.db.get(stop.itemId);
      if (item === null || item.userId !== userId) return null;
      const cover = item.storageId
        ? await ctx.storage.getUrl(item.storageId)
        : null;
      const creator = item.author ?? item.siteName;
      return {
        ...stop,
        ...(cover !== null ? { cover } : {}),
        ...(creator !== undefined ? { creator } : {}),
        ...(item.url !== undefined ? { url: item.url } : {}),
      };
    };
    const viewAll = async (stops: TripStop[]) =>
      (await Promise.all(stops.map(view))).filter(
        (stop): stop is NonNullable<typeof stop> => stop !== null,
      );

    const { userId: _userId, spaceId: _spaceId, ...rest } = trip;
    return {
      ...rest,
      days: await Promise.all(
        trip.days.map(async (day) => ({
          ...day,
          stops: await viewAll(day.stops),
        })),
      ),
      wishlist: await viewAll(trip.wishlist),
    };
  },
});

/** Cities the space's saves name, most saves first, for the plan sheet's
 * city question. Empty when the space is not the caller's. */
export const tripCities = query({
  args: { spaceId: v.id("spaces") },
  returns: v.array(v.object({ city: v.string(), count: v.number() })),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const space = await ctx.db.get(args.spaceId);
    if (space === null || space.userId !== userId) return [];
    const saves = await loadTripSaves(ctx, args.spaceId, userId);
    return countCities(saves.map(({ item }) => item));
  },
});
