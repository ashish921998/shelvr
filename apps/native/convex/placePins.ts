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
import { logEvent } from "./model/log";
import { effectiveStatus } from "./model/memberships";
import { placeKey } from "./model/plan";
import { dropStrays, keepNearby, middleOf, type LatLng } from "./model/trip";

const MAX_PINS = 5;
const BACKFILL_PAGE = 100;
const BACKFILL_STAGGER_MS = 250;

type Pin = { name: string; lat: number; lng: number };

/** In a save that names exactly one city, a pin far from most of the others is a wrong match for a same-named place elsewhere. */
function nearEachOther(pins: Pin[], cities: string[]): Pin[] {
  if (cities.length !== 1) return pins;
  return dropStrays(pins).filter((pin) => pin !== null);
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
  for (const name of names) {
    const key = placeKey(name);
    if (key !== "" && !wanted.has(key)) wanted.set(key, name);
  }
  return wanted;
}

/** Mirrors trips.ts: the city narrows a bare name, unless the name already says it. */
function lookupQuery(name: string, city: string | undefined): string {
  if (city && !name.toLowerCase().includes(city.trim().toLowerCase())) {
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
      city: v.optional(v.string()),
      singleCity: v.boolean(),
      centre: v.union(v.null(), v.object({ lat: v.number(), lng: v.number() })),
    }),
  ),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (item === null || item.status !== "ready") return null;
    if (!(await aiAllowed(ctx, item.userId))) return null;
    const pinned = new Set((item.placePins ?? []).map((p) => placeKey(p.name)));
    const wanted = [...(await wantedPlaces(ctx, item))];
    const kept = wanted.filter(([key]) => pinned.has(key)).length;
    const names = wanted
      .filter(([key]) => args.refresh || !pinned.has(key))
      .map(([, name]) => name)
      // Look past the free slots: a stray match storePins drops must not keep the next place from a pin.
      .slice(0, !args.refresh && kept >= MAX_PINS ? 0 : MAX_PINS);
    const pins = nearEachOther(item.placePins ?? [], item.cities ?? []);
    return {
      names,
      city: item.cities?.[0],
      singleCity: item.cities?.length === 1,
      centre: item.cities?.length === 1 ? lookupCentre(pins) : null,
    };
  },
});

export const storePins = internalMutation({
  args: {
    itemId: v.id("items"),
    found: v.array(
      v.object({ name: v.string(), lat: v.number(), lng: v.number() }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (item === null || !(await aiAllowed(ctx, item.userId))) return null;
    const wanted = await wantedPlaces(ctx, item);
    const next = new Map<string, Pin>();
    for (const pin of [...(item.placePins ?? []), ...args.found]) {
      const key = placeKey(pin.name);
      if (wanted.has(key)) next.set(key, pin);
    }
    const pins = nearEachOther([...next.values()], item.cities ?? []).slice(
      0,
      MAX_PINS,
    );
    const before = item.placePins ?? [];
    const same =
      pins.length === before.length &&
      pins.every(
        (pin, i) =>
          pin.name === before[i].name &&
          pin.lat === before[i].lat &&
          pin.lng === before[i].lng,
      );
    if (!same) await ctx.db.patch(item._id, { placePins: pins });
    return null;
  },
});

async function lookUp(
  names: string[],
  city: string | undefined,
  centre: LatLng | null,
  singleCity: boolean,
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
  const looked = await Promise.all(
    names.map(async (name) => ({
      name,
      at: await appleMapsLookup(
        token,
        "search",
        lookupQuery(name, city),
        centre ?? undefined,
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
          lookupQuery(place.name, city),
          anchor,
        );
      }),
    );
  }
  return looked.flatMap(({ name, at }) =>
    at === null ? [] : [{ name, lat: at.lat, lng: at.lng }],
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
        : await lookUp(todo.names, todo.city, todo.centre, todo.singleCity);
    await ctx.runMutation(internal.placePins.storePins, {
      itemId: args.itemId,
      found,
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
          item.placePins === undefined &&
          mapsNames(item.intents).length > 0,
      )
      .map((item) => item._id);
    for (const [i, itemId] of todo.entries()) {
      await ctx.scheduler.runAfter(
        i * BACKFILL_STAGGER_MS,
        internal.placePins.locateItem,
        { itemId },
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
