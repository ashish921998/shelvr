import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  env,
  internalAction,
  internalMutation,
  internalQuery,
  type QueryCtx,
} from "./_generated/server";
import { aiAllowed } from "./aiConsent";
import {
  appleMapsAccessToken,
  appleMapsConfig,
  appleMapsLookup,
} from "./model/appleMaps";
import {
  MAX_ITEM_PLACES,
  normalizePlaceName,
  savedPlaceKey,
  normalizePlaces,
  normalizePlaceLocations,
  placeLocationsValidator,
  placePinsValidator,
  withoutCitySuffix,
} from "./model/itemFields";
import { logEvent } from "./model/log";
import { buildSearchText } from "./model/searchText";
import { effectiveStatus } from "./model/memberships";
import { placeKey } from "./model/plan";
import { SAME_SPOT_KM } from "./model/placeList";
import {
  cityKey,
  distanceKm,
  dropStrays,
  keepNearby,
  middleOf,
  type LatLng,
} from "./model/trip";

const MAX_PINS = MAX_ITEM_PLACES;
const BACKFILL_PAGE = 100;
const BACKFILL_STAGGER_MS = 250;

type Pin = {
  name: string;
  lat: number;
  lng: number;
  city?: string;
  appleId?: string;
  category?: string;
};

/** Source cities establish the scope; lookup results cannot bypass outlier rejection. */
function lookupCity(cities: string[]): string | undefined {
  return cities.length === 1 ? cities[0] : undefined;
}

/** In a single-city save, a pin far from most of the others is a wrong match for a same-named place elsewhere. */
function nearEachOther(pins: Pin[], city: string | undefined): Pin[] {
  if (city === undefined) return pins;
  return dropStrays(pins).filter((pin) => pin !== null);
}

/** Keep the source's city scope: a suburb cannot create a new city or disable later outlier checks. */
function inSourceCity(pin: Pin, cities: string[]): Pin {
  const city =
    cities.length === 1
      ? cities[0]
      : cities.find((source) => cityKey(source) === cityKey(pin.city ?? ""));
  return {
    name: normalizePlaceName(pin.name, cities),
    lat: pin.lat,
    lng: pin.lng,
    ...(city ? { city } : {}),
    ...(pin.appleId ? { appleId: pin.appleId } : {}),
    ...(pin.category ? { category: pin.category } : {}),
  };
}

function lookupCentre(points: LatLng[]): LatLng | null {
  if (points.length < 2) return null;
  const centre = middleOf(points);
  const nearby = keepNearby(points, centre).filter((point) => point !== null);
  return nearby.length > points.length / 2 ? middleOf(nearby) : null;
}

function mapsNames(intents: Doc<"items">["intents"]): string[] {
  return (intents ?? [])
    .filter((intent) => intent.kind === "open_maps")
    .map((intent) => intent.value.trim());
}

/** Distinct place names by key: the places read off the save, its Maps intents, then every space's. */
async function wantedPlaces(
  ctx: QueryCtx,
  item: Doc<"items">,
): Promise<Map<string, string>> {
  const joins = await ctx.db
    .query("spaceItems")
    .withIndex("by_item", (q) => q.eq("itemId", item._id))
    .collect();
  const names = [
    ...(item.places ?? []),
    ...mapsNames(item.intents),
    ...joins
      .filter((join) => effectiveStatus(join) !== "dismissed")
      .flatMap((join) => mapsNames(join.intents)),
  ];
  const wanted = new Map<string, string>();
  for (const raw of names) {
    const name = normalizePlaceName(raw, item.cities);
    const key = placeKey(name);
    if (key !== "" && !wanted.has(key)) wanted.set(key, name);
  }
  return wanted;
}

/** Mirrors trips.ts: the city narrows a bare name, unless the name already says it. */
function lookupQuery(name: string, city: string | undefined): string {
  if (
    city &&
    withoutCitySuffix(name, city) === null &&
    !name
      .split(",")
      .some((part) => part.trim().toLowerCase() === city.trim().toLowerCase())
  ) {
    return `${name}, ${city.trim()}`;
  }
  return name;
}

export const toLocate = internalQuery({
  args: { itemId: v.id("items"), refresh: v.optional(v.boolean()) },
  returns: v.union(
    v.null(),
    v.object({
      names: v.array(v.string()),
      locations: placeLocationsValidator,
      city: v.optional(v.string()),
      singleCity: v.boolean(),
      centre: v.union(v.null(), v.object({ lat: v.number(), lng: v.number() })),
    }),
  ),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (item === null || item.status !== "ready") return null;
    if (!(await aiAllowed(ctx, item.userId))) return null;
    const pinned = new Set(
      (item.placePins ?? []).map((p) => savedPlaceKey(p.name, item.cities)),
    );
    const wanted = [...(await wantedPlaces(ctx, item))];
    const kept = wanted.filter(([key]) => pinned.has(key)).length;
    const names = wanted
      .filter(([key]) => args.refresh || !pinned.has(key))
      .map(([, name]) => name)
      // Look past the free slots: a stray match storePins drops must not keep the next place from a pin.
      .slice(0, !args.refresh && kept >= MAX_PINS ? 0 : MAX_PINS);
    const city = lookupCity(item.cities ?? []);
    const singleCity = city !== undefined;
    const pins = nearEachOther(item.placePins ?? [], city);
    return {
      names,
      locations: normalizePlaceLocations(
        item.placeLocations,
        names,
        item.cities,
      ),
      city,
      singleCity,
      centre: singleCity ? lookupCentre(pins) : null,
    };
  },
});

/** A lookup that finds the same spot without an id or category keeps the stored one; a moved pin does not. */
function keepAppleId(stored: Pin | undefined, found: Pin): Pin {
  if (
    stored === undefined ||
    stored.lat !== found.lat ||
    stored.lng !== found.lng
  )
    return found;
  return {
    ...found,
    ...(found.appleId === undefined && stored.appleId !== undefined
      ? { appleId: stored.appleId }
      : {}),
    ...(found.category === undefined && stored.category !== undefined
      ? { category: stored.category }
      : {}),
  };
}

function cluesByPlace(
  locations: { name: string; location: string }[],
  cities: string[] | undefined,
): Map<string, string> {
  return new Map(
    locations.map(({ name, location }) => [
      savedPlaceKey(name, cities),
      location,
    ]),
  );
}

function dropPinsFoundUnderOldClues<P extends { name: string }>(
  found: P[],
  cluesSearched: { name: string; location: string }[] | undefined,
  item: Doc<"items">,
): P[] {
  if (cluesSearched === undefined) return found;
  const now = cluesByPlace(item.placeLocations ?? [], item.cities);
  const then = cluesByPlace(cluesSearched, item.cities);
  return found.filter((pin) => {
    const key = savedPlaceKey(pin.name, item.cities);
    return now.get(key) === then.get(key);
  });
}

export const storePins = internalMutation({
  args: {
    itemId: v.id("items"),
    found: placePinsValidator,
    cluesSearched: v.optional(placeLocationsValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (item === null || !(await aiAllowed(ctx, item.userId))) return null;
    const wanted = await wantedPlaces(ctx, item);
    const found = dropPinsFoundUnderOldClues(
      args.found,
      args.cluesSearched,
      item,
    );
    const next = new Map<string, Pin>();
    for (const pin of [...(item.placePins ?? []), ...found]) {
      const key = savedPlaceKey(pin.name, item.cities);
      if (wanted.has(key))
        next.set(
          key,
          keepAppleId(next.get(key), inSourceCity(pin, item.cities ?? [])),
        );
    }
    const city = lookupCity(item.cities ?? []);
    const pins = nearEachOther([...next.values()], city).slice(0, MAX_PINS);
    const before = item.placePins ?? [];
    const same =
      pins.length === before.length &&
      pins.every(
        (pin, i) =>
          pin.name === before[i].name &&
          pin.lat === before[i].lat &&
          pin.lng === before[i].lng &&
          pin.city === before[i].city &&
          pin.appleId === before[i].appleId &&
          pin.category === before[i].category,
      );
    const places =
      item.places === undefined
        ? undefined
        : normalizePlaces(item.places, item.cities);
    const samePlaces = JSON.stringify(places) === JSON.stringify(item.places);
    const searchText = buildSearchText({ ...item, places, placePins: pins });
    if (
      !same ||
      !samePlaces ||
      (pins.length > 0 && searchText !== item.searchText)
    )
      await ctx.db.patch(item._id, {
        placePins: pins,
        searchText,
        ...(places === undefined ? {} : { places }),
      });
    return null;
  },
});

async function lookUp(
  names: string[],
  city: string | undefined,
  centre: LatLng | null,
  singleCity: boolean,
  locations: { name: string; location: string }[],
): Promise<Pin[]> {
  const config = appleMapsConfig(env);
  if (config === null) {
    logEvent("info", "place_pins_unconfigured", {});
    return [];
  }
  const token = await appleMapsAccessToken(config);
  if (token === null) {
    logEvent("warn", "place_pins_token_failed", {});
    return [];
  }
  const queries = new Map(
    locations.map(({ name, location }) => [name, `${name}, ${location}`]),
  );
  const looked = await Promise.all(
    names.map(async (name) => ({
      name,
      at: await appleMapsLookup(
        token,
        "search",
        lookupQuery(queries.get(name) ?? name, city),
        centre ?? undefined,
        undefined,
        true,
      ),
    })),
  );
  // A first import can establish its city from agreeing results, then retry an ambiguous name nearby.
  const points = looked.map(({ at }) => at);
  const kept = dropStrays(points).filter((point) => point !== null);
  const anchor =
    centre ?? (singleCity && kept.length >= 3 ? lookupCentre(kept) : null);
  if (anchor && !centre) {
    await Promise.all(
      looked.map(async (place) => {
        if (place.at && keepNearby([place.at], anchor)[0] !== null) return;
        place.at = await appleMapsLookup(
          token,
          "search",
          lookupQuery(queries.get(place.name) ?? place.name, city),
          anchor,
          undefined,
          true,
        );
      }),
    );
  }
  return looked.flatMap(({ name, at }) =>
    at === null
      ? []
      : [
          {
            name,
            lat: at.lat,
            lng: at.lng,
            ...(city ? { city } : at.city ? { city: at.city } : {}),
            ...(at.appleId ? { appleId: at.appleId } : {}),
            ...(at.category ? { category: at.category } : {}),
          },
        ],
  );
}

export const locateItem = internalAction({
  args: { itemId: v.id("items"), refresh: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const todo = await ctx.runQuery(internal.placePins.toLocate, args);
    if (todo === null) return null;
    const found =
      todo.names.length === 0
        ? []
        : await lookUp(
            todo.names,
            todo.city,
            todo.centre,
            todo.singleCity,
            todo.locations,
          );
    await ctx.runMutation(internal.placePins.storePins, {
      itemId: args.itemId,
      found,
      cluesSearched: todo.locations,
    });
    return null;
  },
});

export const toIdentify = internalQuery({
  args: { itemId: v.id("items") },
  returns: v.array(
    v.object({ name: v.string(), lat: v.number(), lng: v.number() }),
  ),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    // Before the save settles its places are not set yet, and storePins would drop every pin.
    if (item === null || item.status !== "ready") return [];
    if (!(await aiAllowed(ctx, item.userId))) return [];
    return (item.placePins ?? [])
      .filter((pin) => pin.appleId === undefined)
      .map(({ name, lat, lng }) => ({ name, lat, lng }));
  },
});

/**
 * Names the places a shared list pinned at its own points: Apple's place id and category, taken only from a
 * match at that spot, so the pin itself never moves.
 */
export const identifyPins = internalAction({
  args: { itemId: v.id("items") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const pins = await ctx.runQuery(internal.placePins.toIdentify, args);
    if (pins.length === 0) return null;
    const config = appleMapsConfig(env);
    if (config === null) {
      logEvent("info", "place_pins_unconfigured", {});
      return null;
    }
    const token = await appleMapsAccessToken(config);
    if (token === null) {
      logEvent("warn", "place_pins_token_failed", {});
      return null;
    }
    const found = await Promise.all(
      pins.map(async (pin) => {
        const at = await appleMapsLookup(token, "search", pin.name, pin);
        return at?.appleId !== undefined && distanceKm(at, pin) <= SAME_SPOT_KM
          ? [
              {
                ...pin,
                appleId: at.appleId,
                ...(at.category ? { category: at.category } : {}),
              },
            ]
          : [];
      }),
    );
    logEvent("info", "place_pins_identified", {
      item_id: args.itemId,
      pins: pins.length,
      identified: found.flat().length,
    });
    await ctx.runMutation(internal.placePins.storePins, {
      itemId: args.itemId,
      found: found.flat(),
    });
    return null;
  },
});

/** Run by hand: `convex run placePins:backfillPage '{"cursor":null}'`. */
export const backfillPage = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { page, isDone, continueCursor } = await ctx.db
      .query("items")
      .paginate({ numItems: BACKFILL_PAGE, cursor: args.cursor });
    const todo: Id<"items">[] = page
      .filter(
        (item) =>
          item.status === "ready" &&
          (item.placePins === undefined ||
            // A pin without a category predates the Map tab's filters.
            (item.placePins ?? []).some((pin) => !pin.city || !pin.category)) &&
          (mapsNames(item.intents).length > 0 ||
            (item.places?.length ?? 0) > 0),
      )
      .map((item) => item._id);
    for (const [i, itemId] of todo.entries()) {
      await ctx.scheduler.runAfter(
        i * BACKFILL_STAGGER_MS,
        internal.placePins.locateItem,
        { itemId, refresh: true },
      );
    }
    if (!isDone) {
      await ctx.scheduler.runAfter(
        todo.length * BACKFILL_STAGGER_MS,
        internal.placePins.backfillPage,
        { cursor: continueCursor },
      );
    }
    return null;
  },
});
