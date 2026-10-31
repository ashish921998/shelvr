"use node";

import type { FunctionReturnType } from "convex/server";
import { v } from "convex/values";
import { action, env } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  appleMapsAccessToken,
  appleMapsConfig,
  appleMapsLookup,
  appleMapsSearchPlaces,
  type ApplePoi,
} from "./model/appleMaps";
import { logEvent } from "./model/log";
import {
  placeKey,
  splitSavedPlace,
  suggestSavedPlaces,
  type PlanPlace,
} from "./model/plan";
import {
  distanceKm,
  dropStrays,
  lookupQuery,
  middleOf,
  STOPS_PER_DAY,
  tripPaceValidator,
  tripPlaceCap,
  uniquePlacePins,
  type LatLng,
  type TripPace,
} from "./model/trip";
import {
  createTripPlanResultValidator,
  searchTripPlacesResultValidator,
  tripInterestValidator,
  type TripInterest,
  type TripPlace,
} from "./model/tripPlan";
import {
  balanceSuggestions,
  chainNames,
  keepSuggestion,
  layoutTripPlan,
  mergeSavedNamesakes,
  nextBatch,
  saveWhy,
  searchQueues,
  SUGGEST_RADIUS_KM,
  tasteQueries,
  type PlannedStop,
  type Suggestion,
} from "./model/tripSuggest";

/** Apple calls one trip may make, token included; the free quota is 25,000 a day per team. */
const MAX_APPLE_CALLS = 24;
/** Saved places without a pin that may be looked up; the rest of the budget suggests places. */
const MAX_SAVE_LOOKUPS = 6;
/** Suggestions past the days' room, left unplanned to swap in. */
const EXTRA_SUGGESTIONS = 5;

/** What claimTripPlanInternal returns, read off its validator so the two cannot drift. */
type Claim = FunctionReturnType<
  typeof internal.tripPlannerData.claimTripPlanInternal
>;
type SavedPin = Claim["pins"][number];

type Maps = { token: string; left: number; lang?: string };

export function appleLang(locale: string | undefined): string | undefined {
  const tag = locale?.trim();
  return tag && tag.length <= 20 && /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(tag)
    ? tag
    : undefined;
}

async function openMaps(lang: string | undefined): Promise<Maps | null> {
  const config = appleMapsConfig(env);
  if (config === null) {
    logEvent("info", "trip_plan_maps_unconfigured", {});
    return null;
  }
  const token = await appleMapsAccessToken(config);
  if (token === null) {
    logEvent("warn", "trip_plan_map_token_failed", {});
    return null;
  }
  return {
    token,
    left: MAX_APPLE_CALLS - 1,
    ...(lang !== undefined ? { lang } : {}),
  };
}

/** Charges `calls` requests to the trip's Apple budget, when there is room for all of them. */
function spend(maps: Maps | null, calls = 1): maps is Maps {
  if (maps === null || maps.left < calls) return false;
  maps.left -= calls;
  return true;
}

// appleMapsLookup's search retries as a point of interest when the first answer is only a city.
const SEARCH_LOOKUP_CALLS = 2;

export function pinFor(place: PlanPlace, pins: SavedPin[]): SavedPin | null {
  const key = placeKey(place.name);
  return (
    pins.find(
      (pin) =>
        pin.itemId === place.itemId &&
        (placeKey(pin.name) === key ||
          placeKey(splitSavedPlace(pin.name).name) === key),
    ) ?? null
  );
}

function saveStop(
  place: PlanPlace,
  at: LatLng & { appleId?: string; category?: string },
  why: string | undefined,
): PlannedStop {
  return {
    source: "save",
    itemId: place.itemId,
    name: place.name,
    ...(place.area ? { area: place.area } : {}),
    lat: at.lat,
    lng: at.lng,
    ...(at.appleId !== undefined ? { appleId: at.appleId } : {}),
    ...(at.category !== undefined ? { category: at.category } : {}),
    ...(why !== undefined ? { why } : {}),
  };
}

function listStops(claim: Claim, been: ReadonlySet<string>): PlannedStop[] {
  const stops: PlannedStop[] = claim.places
    .filter((place) => !been.has(placeKey(place.name)))
    .map(({ key: _key, addedAt: _addedAt, tags: _tags, ...place }) => ({
      source: "save",
      ...place,
    }));
  for (let i = stops.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [stops[i], stops[j]] = [stops[j], stops[i]];
  }
  return stops;
}

/** The city's unvisited saved places with a pin: stored pins first, then a few looked up near the city. */
async function savedStops(
  claim: Claim,
  maps: Maps | null,
): Promise<{ stops: PlannedStop[]; centre: LatLng | null }> {
  const been = new Set(claim.been.map(placeKey));
  const cap = tripPlaceCap(claim.days);
  // Every candidate first, so the cap keeps pinned places over ones that would need a lookup.
  const places = suggestSavedPlaces(
    claim.sources,
    been,
    Number.MAX_SAFE_INTEGER,
  );
  // An older pin can be a stray from before storePins dropped them; that place is looked up again.
  const pinned = dropStrays(places.map((place) => pinFor(place, claim.pins)));
  const sources = new Map(
    claim.sources.map((source) => [source.itemId, source]),
  );
  const why = (place: PlanPlace) => saveWhy(place, sources.get(place.itemId));
  const stops: PlannedStop[] = listStops(claim, been).slice(0, cap);
  const unpinned: PlanPlace[] = [];
  places.forEach((place, i) => {
    const pin = pinned[i];
    if (pin && stops.length < cap) stops.push(saveStop(place, pin, why(place)));
    else if (!pin) unpinned.push(place);
  });
  let centre = middleOf(stops);
  if (centre === null && spend(maps)) {
    centre = await appleMapsLookup(maps.token, "geocode", claim.city);
  }
  // Place names come from the model's reading of a save, so they reach Apple only while AI is allowed.
  if (centre !== null && claim.aiAllowed && maps !== null) {
    const room = Math.min(
      MAX_SAVE_LOOKUPS,
      cap - stops.length,
      Math.floor(maps.left / SEARCH_LOOKUP_CALLS),
    );
    const asked = unpinned.slice(0, Math.max(0, room));
    maps.left -= asked.length * SEARCH_LOOKUP_CALLS;
    const found = await Promise.all(
      asked.map((place) =>
        appleMapsLookup(
          maps.token,
          "search",
          lookupQuery(place, claim.city),
          centre!,
        ),
      ),
    );
    asked.forEach((place, i) => {
      const at = found[i];
      if (at) stops.push(saveStop(place, at, why(place)));
    });
  }
  return { stops: mergeSavedNamesakes(uniquePlacePins(stops)), centre };
}

function suggestedStop(found: Suggestion): PlannedStop {
  const { interest: _interest, ...poi } = found;
  return { source: "suggested", ...poi };
}

/** Apple Maps places for the chosen interests, searched from the saves' taste first, balanced across interests. */
async function suggestStops(
  claim: Claim,
  maps: Maps,
  centre: LatLng,
  taken: PlannedStop[],
  wanted: number,
  interests: TripInterest[],
): Promise<{ stops: PlannedStop[]; searches: number }> {
  const taste = claim.aiAllowed
    ? tasteQueries(claim.tastes, interests, claim.city)
    : {};
  const queues = searchQueues(interests, taste, centre);
  const need = Math.ceil(wanted / interests.length) + 1;
  const lists = new Map<TripInterest, Suggestion[]>(
    interests.map((interest) => [interest, []]),
  );
  const been = new Set(claim.been.map(placeKey));
  const seen: ApplePoi[] = [];
  const kept: { name: string; lat: number; lng: number; appleId?: string }[] = [
    ...taken,
  ];
  const total = () => [...lists.values()].reduce((n, l) => n + l.length, 0);
  const more = (interest: TripInterest) =>
    (lists.get(interest)?.length ?? 0) < need || total() < wanted;
  let searches = 0;
  for (;;) {
    const batch = nextBatch(
      queues,
      more,
      Math.min(interests.length, maps.left),
    );
    if (batch.length === 0) break;
    maps.left -= batch.length;
    searches += batch.length;
    const replies = await Promise.all(
      batch.map((search) =>
        appleMapsSearchPlaces(maps.token, search.query, {
          near: search.at,
          categories: search.categories,
          ...(maps.lang !== undefined ? { lang: maps.lang } : {}),
        }),
      ),
    );
    batch.forEach((search, i) => {
      for (const found of replies[i]) {
        seen.push(found);
        const suggestion = { ...found, interest: search.interest };
        if (!keepSuggestion(suggestion, { centre, been, taken: kept }))
          continue;
        lists.get(search.interest)?.push(suggestion);
        kept.push(suggestion);
      }
    });
  }
  return {
    stops: balanceSuggestions(lists, interests, wanted, chainNames(seen)).map(
      suggestedStop,
    ),
    searches,
  };
}

async function locateStay(
  claim: Claim,
  maps: Maps | null,
  centre: LatLng | null,
): Promise<{ name: string; lat?: number; lng?: number } | undefined> {
  if (claim.stay === undefined) return undefined;
  if (centre === null || !spend(maps, SEARCH_LOOKUP_CALLS))
    return { name: claim.stay };
  const found = await appleMapsLookup(maps.token, "search", claim.stay, centre);
  return found
    ? { name: claim.stay, lat: found.lat, lng: found.lng }
    : { name: claim.stay };
}

function suggestionRoom(pace: TripPace, days: number, saves: number): number {
  const missing = STOPS_PER_DAY[pace] * days - saves;
  return missing > 0 ? missing + EXTRA_SUGGESTIONS : 0;
}

export const createTripPlan = action({
  args: {
    city: v.string(),
    days: v.number(),
    startDate: v.optional(v.string()),
    pace: tripPaceValidator,
    interests: v.array(tripInterestValidator),
    stay: v.optional(v.string()),
    locale: v.optional(v.string()),
    listId: v.optional(v.id("sharedLists")),
  },
  returns: createTripPlanResultValidator,
  // Annotated: inferring through `internal` is circular for an action.
  handler: async (
    ctx,
    args,
  ): Promise<{
    tripId: Id<"tripPlans"> | null;
    saves: number;
    suggested: number;
  }> => {
    const claim = await ctx.runMutation(
      internal.tripPlannerData.claimTripPlanInternal,
      {
        city: args.city,
        days: args.days,
        interests: args.interests,
        ...(args.startDate !== undefined ? { startDate: args.startDate } : {}),
        ...(args.stay !== undefined ? { stay: args.stay } : {}),
        ...(args.listId !== undefined ? { listId: args.listId } : {}),
      },
    );
    // No interests means no suggestions: the trip is planned from the saves alone.
    const interests = claim.interests;
    // The city, the stay and points from the saves would all reach Apple, so a declined
    // account plans from its stored pins alone, as pin lookup does.
    const maps = claim.aiAllowed
      ? await openMaps(appleLang(args.locale))
      : null;
    const { stops: saves, centre } = await savedStops(claim, maps);
    const stay = await locateStay(claim, maps, centre);
    const wanted = suggestionRoom(args.pace, claim.days, saves.length);
    const suggested =
      maps !== null && centre !== null && wanted > 0 && interests.length > 0
        ? await suggestStops(claim, maps, centre, saves, wanted, interests)
        : { stops: [], searches: 0 };
    const fields = {
      days: claim.days,
      saves: saves.length,
      suggested: suggested.stops.length,
      searches: suggested.searches,
      apple_calls: maps === null ? 0 : MAX_APPLE_CALLS - maps.left,
      ai_allowed: claim.aiAllowed,
    };
    if (saves.length + suggested.stops.length === 0) {
      logEvent("info", "trip_plan_empty", fields);
      return { tripId: null, saves: 0, suggested: 0 };
    }
    const layout = layoutTripPlan([...saves, ...suggested.stops], {
      days: claim.days,
      pace: args.pace,
    });
    const tripId: Id<"tripPlans"> = await ctx.runMutation(
      internal.tripPlannerData.saveTripPlanInternal,
      {
        city: claim.city,
        ...(args.listId !== undefined ? { listId: args.listId } : {}),
        dayCount: claim.days,
        pace: args.pace,
        interests,
        ...(claim.startDate !== undefined
          ? { startDate: claim.startDate }
          : {}),
        ...(stay !== undefined ? { stay } : {}),
        days: layout.days,
        unplanned: layout.unplanned,
      },
    );
    logEvent("info", "trip_plan_created", fields);
    return {
      tripId,
      saves: saves.length,
      suggested: suggested.stops.length,
    };
  },
});

const MIN_SEARCH_CHARS = 2;
const MAX_SEARCH_CHARS = 100;
const MAX_SEARCH_RESULTS = 15;
/** Add a place looks a little wider than suggestions do: a day trip out of town is fine. */
const SEARCH_RADIUS_KM = SUGGEST_RADIUS_KM * 2;

export type SearchClaim = {
  city?: string;
  centre: LatLng | null;
  aiAllowed: boolean;
};

export type SearchResult = { available: boolean; places: TripPlace[] };

export function tidyQuery(query: string): string {
  return query.replace(/\s+/g, " ").trim().slice(0, MAX_SEARCH_CHARS);
}

export function shortQuery(query: string): boolean {
  return query.length < MIN_SEARCH_CHARS;
}

export async function searchPlacesNear(
  claim: SearchClaim,
  query: string,
  locale: string | undefined,
): Promise<SearchResult> {
  // The trip's centre comes from the saves' pins, so a declined account sends Apple nothing,
  // as createTripPlan does.
  const maps = claim.aiAllowed ? await openMaps(appleLang(locale)) : null;
  if (maps === null) return { available: false, places: [] };
  const centre =
    claim.centre ??
    (claim.city === undefined
      ? null
      : await appleMapsLookup(maps.token, "geocode", claim.city));
  if (centre === null) {
    logEvent("info", "trip_search_no_centre", {});
    return { available: true, places: [] };
  }
  const found = await appleMapsSearchPlaces(maps.token, query, {
    near: centre,
    ...(maps.lang !== undefined ? { lang: maps.lang } : {}),
  });
  const places = found
    .filter((place) => distanceKm(place, centre) <= SEARCH_RADIUS_KM)
    .slice(0, MAX_SEARCH_RESULTS);
  logEvent("info", "trip_search_done", {
    found: found.length,
    kept: places.length,
  });
  return { available: true, places };
}

/** Add a place: an Apple Maps search for what the person typed, near the trip. */
export const searchTripPlaces = action({
  args: {
    tripId: v.id("tripPlans"),
    query: v.string(),
    locale: v.optional(v.string()),
  },
  returns: searchTripPlacesResultValidator,
  handler: async (ctx, args): Promise<SearchResult> => {
    const query = tidyQuery(args.query);
    if (shortQuery(query)) return { available: true, places: [] };
    const claim = await ctx.runMutation(
      internal.tripPlannerData.claimTripSearchInternal,
      { tripId: args.tripId },
    );
    return await searchPlacesNear(claim, query, args.locale);
  },
});
