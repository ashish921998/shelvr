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
  placeKey,
  planSourceValidator,
  type PlanSource,
} from "./model/plan";
import { rateLimiter } from "./model/rateLimiter";
import {
  dayOf,
  swapStop,
  tripDayValidator,
  tripPaceValidator,
  tripSlotValidator,
  tripStopValidator,
  type TripStop,
} from "./model/trip";
import { requireProEntitlement } from "./subscriptions";
import { effectiveStatus, getMembership } from "./model/memberships";

// The database half of "Plan my trip" (trips.ts is the action): what the
// trip may read, the stored trip, and the reads the trip screen makes.

/** A city name the client sends: it goes into the prompt and to Apple. */
const MAX_CITY_CHARS = 80;

function tidyCity(city: string): string {
  return city.replace(/\s+/g, " ").trim();
}

function cityKey(city: string): string {
  return tidyCity(city).toLowerCase();
}

/** The space's ready saves, newest filed first: saved rows plus legacy rows
 * (no status reads as saved), bounded. Shared with "Make a plan". */
export async function loadReadySaves(
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
        .take(MAX_PLAN_ITEMS),
    ),
  );
  const joins = [...saved, ...legacy]
    .sort((a, b) => b._creationTime - a._creationTime)
    .slice(0, MAX_PLAN_ITEMS);
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
      const spelling = tidyCity(city);
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

/** What the model reads of one save. */
export function toPlanSource(
  item: Doc<"items">,
  join: Doc<"spaceItems">,
): PlanSource {
  return {
    itemId: item._id,
    title: item.title,
    description: item.description,
    // A note's words live in `note`; a link can carry the user's note too,
    // and either may be what names the place.
    content:
      [item.note, item.content]
        .filter(Boolean)
        .join("\n")
        .slice(0, PLAN_CONTENT_CHARS) || undefined,
    url: item.url,
    siteName: item.siteName,
    author: item.author,
    // The save's own Maps actions plus any steered for this space.
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
    const asked =
      args.city !== undefined
        ? tidyCity(args.city).slice(0, MAX_CITY_CHARS)
        : undefined;
    const wanted = asked !== undefined ? cityKey(asked) : "";
    const saves = (await loadReadySaves(ctx, args.spaceId, userId)).filter(
      ({ item }) =>
        wanted === "" ||
        (item.cities ?? []).length === 0 ||
        (item.cities ?? []).some((city) => cityKey(city) === wanted),
    );
    const city =
      wanted !== ""
        ? asked
        : countCities(saves.map(({ item }) => item))[0]?.city;
    const sources = saves.map(({ item, join }) => toPlanSource(item, join));
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

/** A stop's save, while the caller still owns it and it is still saved in
 * the trip's space; null once it was deleted or removed from the space. */
async function liveSave(
  ctx: QueryCtx,
  stop: TripStop,
  userId: string,
  spaceId: Id<"spaces">,
): Promise<Doc<"items"> | null> {
  const item = await ctx.db.get(stop.itemId);
  if (item === null || item.userId !== userId) return null;
  const membership = await getMembership(ctx, stop.itemId, spaceId);
  return membership !== null && effectiveStatus(membership) === "saved"
    ? item
    : null;
}

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
  // The stop by its save and name, not by position: the client sees the trip
  // without stops whose save was deleted, so its indexes can differ. Returns
  // the stop that took its place, the same way, since the day is put back in
  // time order and the newcomer can land at another position.
  args: { tripId: v.id("trips"), itemId: v.id("items"), name: v.string() },
  returns: v.object({ itemId: v.id("items"), name: v.string() }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const trip = await ctx.db.get(args.tripId);
    if (trip === null || trip.userId !== userId) {
      throw new Error("Trip not found");
    }
    await requireProEntitlement(ctx, userId);
    let dayIndex = -1;
    let stopIndex = -1;
    for (const [d, day] of trip.days.entries()) {
      stopIndex = day.stops.findIndex(
        (stop) => stop.itemId === args.itemId && stop.name === args.name,
      );
      if (stopIndex !== -1) {
        dayIndex = d;
        break;
      }
    }
    // Only places whose save is still in the space may take the stop's spot.
    const live: TripStop[] = [];
    for (const stop of trip.wishlist) {
      if (await liveSave(ctx, stop, userId, trip.spaceId)) live.push(stop);
    }
    const swapped = swapStop(
      { days: trip.days, wishlist: live },
      dayIndex,
      stopIndex,
    );
    if (swapped === null) {
      throw new ConvexError({
        code: "nothing_to_swap",
        message: "No other saved place to swap in",
      });
    }
    const { replacement, ...patch } = swapped;
    await ctx.db.patch(trip._id, patch);
    return { itemId: replacement.itemId, name: replacement.name };
  },
});

const tripStopViewValidator = v.object({
  ...tripStopValidator.fields,
  // The user marked this place "We went".
  been: v.optional(v.boolean()),
  // The save's cover and its creator ("@handle" or the site), for the stop
  // sheet.
  cover: v.optional(v.string()),
  creator: v.optional(v.string()),
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
});

/**
 * The space's trip, or null when there is none. A stop whose save was
 * deleted or taken out of the space since drops out, and its day's areas
 * and meal gaps are worked out again from the stops left. `been` is read
 * from the user's "We went" marks now, not from when the trip was made.
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
    if (trip === null) return null;

    const view = async (stop: TripStop) => {
      const item = await liveSave(ctx, stop, userId, args.spaceId);
      if (item === null) return null;
      const visit = await ctx.db
        .query("placeVisits")
        .withIndex("by_user_and_key", (q) =>
          q.eq("userId", userId).eq("key", placeKey(stop.name)),
        )
        .unique();
      // An image save's stored file, else a link's page image.
      const cover = item.storageId
        ? await ctx.storage.getUrl(item.storageId)
        : (item.heroImageUrl ?? null);
      const creator = item.author ?? item.siteName;
      return {
        ...stop,
        ...(visit !== null ? { been: true } : {}),
        ...(cover !== null ? { cover } : {}),
        ...(creator !== undefined ? { creator } : {}),
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
        trip.days.map(async (day) => dayOf(await viewAll(day.stops))),
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
    const saves = await loadReadySaves(ctx, args.spaceId, userId);
    return countCities(saves.map(({ item }) => item));
  },
});
