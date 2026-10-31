"use node";

import { v } from "convex/values";
import { action, env } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  appleMapsAccessToken,
  appleMapsConfig,
  appleMapsLookup,
} from "./model/appleMaps";
import { logEvent } from "./model/log";
import {
  placeKey,
  suggestSavedPlaces,
  uniqueUnvisitedPlaces,
  type PlanSource,
} from "./model/plan";
import {
  buildTrip,
  dropStrays,
  keepNearby,
  MAX_TRIP_DAYS,
  middleOf,
  MIN_TRIP_DAYS,
  tripPaceValidator,
  tripPlaceCap,
  lookupQuery,
  savedPinFor,
  type LatLng,
  type SavedPin,
  type TripCandidate,
} from "./model/trip";

async function locate(
  candidates: TripCandidate[],
  city: string | undefined,
  pins: SavedPin[],
): Promise<(LatLng | null)[]> {
  // An older pin can still be a stray from before storePins dropped them; that stop is looked up again.
  const saved = dropStrays(
    candidates.map((candidate) => savedPinFor(candidate, pins)),
  );
  if (saved.every((place) => place !== null)) return saved;
  const config = appleMapsConfig(env);
  if (config === null) return saved;
  const token = await appleMapsAccessToken(config);
  if (token === null) {
    logEvent("warn", "trip_map_token_failed", {});
    return saved;
  }
  // The save's own pins say where the city is; a bare city name can resolve to a namesake elsewhere.
  const centre: LatLng | null =
    middleOf(saved.filter((place): place is LatLng => place !== null)) ??
    (city ? await appleMapsLookup(token, "geocode", city) : null);
  const found = await Promise.all(
    candidates.map((candidate, i) =>
      saved[i] !== null
        ? null
        : appleMapsLookup(
            token,
            "search",
            lookupQuery(candidate, city),
            centre ?? undefined,
          ),
    ),
  );
  const near = keepNearby(found, centre);
  return saved.map((place, i) => place ?? near[i]);
}

/** A null `tripId` leaves the old trip intact; `considered` tells an empty space from saves that named no places. */
export const makeTrip = action({
  args: {
    spaceId: v.id("spaces"),
    city: v.optional(v.string()),
    days: v.number(),
    pace: tripPaceValidator,
    startDate: v.optional(v.string()),
    locale: v.optional(v.string()),
  },
  returns: v.object({
    tripId: v.union(v.id("trips"), v.null()),
    considered: v.number(),
  }),
  // Annotated: inferring through `internal` is circular for an action.
  handler: async (
    ctx,
    args,
  ): Promise<{ tripId: Id<"trips"> | null; considered: number }> => {
    const days = Math.min(
      MAX_TRIP_DAYS,
      Math.max(MIN_TRIP_DAYS, Math.round(args.days)),
    );
    const claim: {
      spaceName: string;
      city?: string;
      sources: PlanSource[];
      been: string[];
      pins: SavedPin[];
    } = await ctx.runMutation(internal.tripData.claimTripInternal, {
      spaceId: args.spaceId,
      ...(args.city !== undefined ? { city: args.city } : {}),
    });
    const { city, sources, been, pins } = claim;
    if (sources.length === 0) {
      return { tripId: null, considered: 0 };
    }

    const candidates: TripCandidate[] = suggestSavedPlaces(
      sources,
      new Set(been.map(placeKey)),
      tripPlaceCap(days),
    ).map((place) => ({ ...place, slot: "any" }));
    if (candidates.length === 0) {
      logEvent("info", "make_trip_empty", {
        space_id: args.spaceId,
        considered: sources.length,
      });
      return { tripId: null, considered: sources.length };
    }

    const found = await locate(candidates, city, pins);
    const located = candidates.map((candidate, i) => {
      const location = found[i];
      return location ? { ...candidate, location } : candidate;
    });
    const locatedSources = sources.map((source) => ({
      ...source,
      pins: located
        .filter((place) => place.itemId === source.itemId)
        .flatMap((place) =>
          place.location ? [{ name: place.name, ...place.location }] : [],
        ),
    }));
    const unique = uniqueUnvisitedPlaces(
      located,
      locatedSources,
      new Set(been.map(placeKey)),
    );
    const trip = buildTrip(unique, { days, pace: args.pace });
    const tripId: Id<"trips"> = await ctx.runMutation(
      internal.tripData.saveTripInternal,
      {
        spaceId: args.spaceId,
        ...(city !== undefined ? { city } : {}),
        pace: args.pace,
        ...(args.startDate !== undefined ? { startDate: args.startDate } : {}),
        days: trip.days,
        wishlist: trip.wishlist,
      },
    );
    logEvent("info", "make_trip_succeeded", {
      space_id: args.spaceId,
      considered: sources.length,
      places: unique.length,
      located: found.filter((place) => place !== null).length,
      days,
    });
    return { tripId, considered: sources.length };
  },
});
