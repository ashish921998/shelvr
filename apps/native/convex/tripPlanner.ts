"use node";

import { v } from "convex/values";
import { action, env } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  appleMapsAccessToken,
  appleMapsConfig,
  appleMapsLookup,
  appleMapsSearchPlaces,
} from "./model/appleMaps";
import { logEvent } from "./model/log";
import {
  placeKey,
  splitSavedPlace,
  suggestSavedPlaces,
  type PlanPlace,
  type PlanSource,
} from "./model/plan";
import {
  dropStrays,
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
  tripInterestValidator,
  type TripInterest,
} from "./model/tripPlan";
import {
  balanceSuggestions,
  chainNames,
  keepSuggestion,
  layoutTripPlan,
  nextBatch,
  saveWhy,
  searchQueues,
  tasteQueries,
  type FoundPoi,
  type PlannedStop,
  type SaveTaste,
  type Suggestion,
} from "./model/tripSuggest";

/** Apple calls one trip may make, token included; the free quota is 25,000 a day per team. */
const MAX_APPLE_CALLS = 24;
/** Saved places without a pin that may be looked up; the rest of the budget suggests places. */
const MAX_SAVE_LOOKUPS = 6;
/** Suggestions past the days' room, left unplanned to swap in. */
const EXTRA_SUGGESTIONS = 5;
const DEFAULT_INTERESTS: TripInterest[] = ["food", "sights", "culture"];

type SavedPin = {
  itemId: Id<"items">;
  name: string;
  lat: number;
  lng: number;
  appleId?: string;
  category?: string;
};

type Claim = {
  city: string;
  days: number;
  interests: TripInterest[];
  startDate?: string;
  stay?: string;
  sources: PlanSource[];
  been: string[];
  pins: SavedPin[];
  tastes: SaveTaste[];
  aiAllowed: boolean;
};

type Maps = { token: string; left: number; lang?: string };

function appleLang(locale: string | undefined): string | undefined {
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

function spend(maps: Maps | null): maps is Maps {
  if (maps === null || maps.left <= 0) return false;
  maps.left--;
  return true;
}

function pinFor(place: PlanPlace, pins: SavedPin[]): SavedPin | null {
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

function lookupQuery(place: PlanPlace, city: string): string {
  const area = place.area?.trim() ?? "";
  const parts = [place.name.trim(), area];
  if (!area.toLowerCase().includes(city.toLowerCase())) parts.push(city);
  return parts.filter(Boolean).join(", ");
}

/** The city's unvisited saved places with a pin: stored pins first, then a few looked up near the city. */
async function savedStops(
  claim: Claim,
  maps: Maps | null,
): Promise<{ stops: PlannedStop[]; centre: LatLng | null }> {
  const been = new Set(claim.been.map(placeKey));
  const places = suggestSavedPlaces(
    claim.sources,
    been,
    tripPlaceCap(claim.days),
  );
  // An older pin can be a stray from before storePins dropped them; that place is looked up again.
  const pinned = dropStrays(places.map((place) => pinFor(place, claim.pins)));
  const sources = new Map(
    claim.sources.map((source) => [source.itemId, source]),
  );
  const why = (place: PlanPlace) => saveWhy(place, sources.get(place.itemId));
  const stops: PlannedStop[] = [];
  const unpinned: PlanPlace[] = [];
  places.forEach((place, i) => {
    const pin = pinned[i];
    if (pin) stops.push(saveStop(place, pin, why(place)));
    else unpinned.push(place);
  });
  let centre = middleOf(stops);
  if (centre === null && spend(maps)) {
    centre = await appleMapsLookup(maps.token, "geocode", claim.city);
  }
  // Place names come from the model's reading of a save, so they reach Apple only while AI is allowed.
  if (centre !== null && claim.aiAllowed && maps !== null) {
    const asked = unpinned.slice(0, Math.min(MAX_SAVE_LOOKUPS, maps.left));
    maps.left -= asked.length;
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
  return { stops: uniquePlacePins(stops), centre };
}

function suggestedStop(found: Suggestion): PlannedStop {
  return {
    source: "suggested",
    name: found.name,
    ...(found.area !== undefined ? { area: found.area } : {}),
    lat: found.lat,
    lng: found.lng,
    ...(found.appleId !== undefined ? { appleId: found.appleId } : {}),
    ...(found.category !== undefined ? { category: found.category } : {}),
  };
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
  const seen: FoundPoi[] = [];
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
  if (centre === null || !spend(maps)) return { name: claim.stay };
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
    const claim: Claim = await ctx.runMutation(
      internal.tripPlannerData.claimTripPlanInternal,
      {
        city: args.city,
        days: args.days,
        interests: args.interests,
        ...(args.startDate !== undefined ? { startDate: args.startDate } : {}),
        ...(args.stay !== undefined ? { stay: args.stay } : {}),
      },
    );
    const interests =
      claim.interests.length > 0 ? claim.interests : DEFAULT_INTERESTS;
    const maps = await openMaps(appleLang(args.locale));
    const { stops: saves, centre } = await savedStops(claim, maps);
    const stay = await locateStay(claim, maps, centre);
    const wanted = suggestionRoom(args.pace, claim.days, saves.length);
    const suggested =
      maps !== null && centre !== null && wanted > 0
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
