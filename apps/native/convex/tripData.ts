import { ConvexError, v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireUserId, authedMutation, authedQuery } from "./model/auth";
import {
  MAX_PLAN_ITEMS,
  PLAN_CONTENT_CHARS,
  planSourceValidator,
  placeKey,
  splitSavedPlace,
  type PlanSource,
} from "./model/plan";
import { findVisit } from "./model/placeVisits";
import { rateLimiter } from "./model/rateLimiter";
import {
  cityKey,
  countCities,
  dayOf,
  swapStop,
  tidyCity,
  tripDayValidator,
  tripPaceValidator,
  tripSlotValidator,
  tripStopValidator,
  type TripStop,
} from "./model/trip";
import { requireProEntitlement } from "./subscriptions";
import { effectiveStatus, getMembership } from "./model/memberships";
import { readyCitySaves } from "./items";

const MAX_CITY_CHARS = 80;

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

type PlanSave = { item: Doc<"items">; join?: Doc<"spaceItems"> };

/** A plan's saves: the city's as its page lists them, newest first; without a city, the space's. */
export async function planSaves(
  ctx: QueryCtx,
  spaceId: Id<"spaces">,
  userId: string,
  city: string | undefined,
): Promise<PlanSave[]> {
  if (city === undefined || cityKey(city) === "") {
    return await loadReadySaves(ctx, spaceId, userId);
  }
  const items = await readyCitySaves(ctx, userId, city, MAX_PLAN_ITEMS);
  const saves: PlanSave[] = [];
  for (const item of items) {
    const join = await getMembership(ctx, item._id, spaceId);
    if (join !== null && effectiveStatus(join) !== "saved") continue;
    saves.push({ item, ...(join === null ? {} : { join }) });
  }
  return saves;
}

export async function claimSpaceForPlanning(
  ctx: MutationCtx,
  spaceId: Id<"spaces">,
): Promise<{ userId: Id<"users">; space: Doc<"spaces"> }> {
  const userId = await requireUserId(ctx);
  const space = await ctx.db.get(spaceId);
  if (space === null || space.userId !== userId) {
    throw new Error("Space not found");
  }
  await requireProEntitlement(ctx, userId);
  return { userId, space };
}

/** Check each candidate by index, including visits older than the former 100-row window. */
export async function beenPlaces(
  ctx: QueryCtx,
  userId: Id<"users">,
  sources: PlanSource[],
): Promise<string[]> {
  const visited = new Set<string>();
  const checked = new Set<string>();
  for (const raw of sources.flatMap((source) => source.places)) {
    const { name } = splitSavedPlace(raw);
    if (checked.has(placeKey(raw))) continue;
    checked.add(placeKey(raw));
    if (
      (await findVisit(ctx, userId, name)) ||
      (await findVisit(ctx, userId, raw))
    )
      visited.add(name);
  }
  return [...visited];
}

export function toPlanSource(
  item: Doc<"items">,
  join?: Doc<"spaceItems">,
  city?: string,
): PlanSource {
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
    pins: item.placePins,
    places: [
      ...[...(item.intents ?? []), ...(join?.intents ?? [])]
        .filter((intent) => intent.kind === "open_maps")
        .map((intent) => intent.value),
      ...(item.places ?? []),
      ...(item.placePins ?? []).map((pin) => pin.name),
    ].filter((name) => {
      const cities = item.cities ?? [];
      if (!city || cities.length <= 1) return true;
      // A multi-city save must explicitly identify this place's city; do not guess.
      return name
        .split(",")
        .slice(1)
        .some((part) => placeKey(part) === placeKey(city));
    }),
  };
}

export const claimTripInternal = internalMutation({
  args: { spaceId: v.id("spaces"), city: v.optional(v.string()) },
  returns: v.object({
    spaceName: v.string(),
    city: v.optional(v.string()),
    sources: v.array(planSourceValidator),
    been: v.array(v.string()),
    pins: v.array(
      v.object({
        itemId: v.id("items"),
        name: v.string(),
        lat: v.number(),
        lng: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const { userId, space } = await claimSpaceForPlanning(ctx, args.spaceId);
    const asked =
      args.city !== undefined
        ? tidyCity(args.city).slice(0, MAX_CITY_CHARS)
        : undefined;
    const wanted = asked !== undefined ? cityKey(asked) : "";
    const initial = await planSaves(ctx, args.spaceId, userId, asked);
    const city =
      wanted !== ""
        ? asked
        : countCities(initial.map(({ item }) => item))[0]?.city;
    const saves = city
      ? initial.filter(({ item }) =>
          (item.cities ?? []).some((value) => cityKey(value) === cityKey(city)),
        )
      : initial;
    const sources = saves.map(({ item, join }) =>
      toPlanSource(item, join, city),
    );
    if (sources.length === 0) {
      return { spaceName: space.name, city, sources, been: [], pins: [] };
    }
    await rateLimiter.limit(ctx, "makeTrip", { key: userId, throws: true });
    return {
      spaceName: space.name,
      city,
      sources,
      been: await beenPlaces(ctx, userId, sources),
      pins: saves.flatMap(({ item }) =>
        (item.placePins ?? []).map((pin) => ({ itemId: item._id, ...pin })),
      ),
    };
  },
});

async function liveSave(
  ctx: QueryCtx,
  stop: TripStop,
  userId: string,
  spaceId: Id<"spaces">,
  city?: string,
): Promise<Doc<"items"> | null> {
  const item = await ctx.db.get(stop.itemId);
  if (item === null || item.userId !== userId) return null;
  const membership = await getMembership(ctx, stop.itemId, spaceId);
  if (membership !== null && effectiveStatus(membership) !== "saved")
    return null;
  if (city !== undefined && (item.cities ?? []).length > 0) {
    return item.status === "ready" &&
      (item.cities ?? []).some((value) => cityKey(value) === cityKey(city))
      ? item
      : null;
  }
  return membership !== null && effectiveStatus(membership) === "saved"
    ? item
    : null;
}

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

// ponytail: the newest 10 trips, up to 105 day stops and one membership read each; older trips' stops stay on the shelf.
const TRIP_STOP_SCAN = 10;

/** Saves the trip page shows on a day of one of the user's trips. A place that didn't fit (`wishlist`) is not planned. */
export async function tripStopItemIds(
  ctx: QueryCtx,
  userId: string,
): Promise<Set<string>> {
  const trips = await ctx.db
    .query("trips")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .take(TRIP_STOP_SCAN);
  const stops = trips.flatMap((trip) =>
    trip.days.flatMap((day) =>
      day.stops.map((stop) => ({ itemId: stop.itemId, spaceId: trip.spaceId })),
    ),
  );
  const planned = new Set<string>();
  for (const { itemId, spaceId } of stops) {
    if (planned.has(itemId)) continue;
    const membership = await getMembership(ctx, itemId, spaceId);
    if (membership !== null && effectiveStatus(membership) === "saved")
      planned.add(itemId);
  }
  return planned;
}

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
    if (space === null || space.userId !== userId) {
      throw new Error("Space not found");
    }
    await deleteTripsForSpace(ctx, args.spaceId);
    return await ctx.db.insert("trips", { userId, ...args });
  },
});

export const swapTripStop = authedMutation({
  args: { tripId: v.id("trips"), itemId: v.id("items"), name: v.string() },
  returns: v.object({ itemId: v.id("items"), name: v.string() }),
  handler: async (ctx, args) => {
    const { userId } = ctx;
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
    const live: TripStop[] = [];
    for (const stop of trip.wishlist) {
      if (
        (await liveSave(ctx, stop, userId, trip.spaceId, trip.city)) &&
        !(await findVisit(ctx, userId, stop.name))
      )
        live.push(stop);
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
  been: v.optional(v.boolean()),
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

export const getSpaceTrip = authedQuery({
  args: { spaceId: v.id("spaces") },
  returns: v.union(tripViewValidator, v.null()),
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const space = await ctx.db.get(args.spaceId);
    if (space === null || space.userId !== userId) return null;
    const trip = await ctx.db
      .query("trips")
      .withIndex("by_space", (q) => q.eq("spaceId", args.spaceId))
      .order("desc")
      .first();
    if (trip === null) return null;

    const view = async (stop: TripStop) => {
      const item = await liveSave(ctx, stop, userId, args.spaceId, trip.city);
      if (item === null) return null;
      const visit = await findVisit(ctx, userId, stop.name);
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

export const tripCities = authedQuery({
  args: { spaceId: v.id("spaces") },
  returns: v.array(v.object({ city: v.string(), count: v.number() })),
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const space = await ctx.db.get(args.spaceId);
    if (space === null || space.userId !== userId) return [];
    const saves = await loadReadySaves(ctx, args.spaceId, userId);
    return countCities(saves.map(({ item }) => item));
  },
});
