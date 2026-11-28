import { v, type Infer } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { authedMutation, authedQuery, requireUserId } from "./model/auth";
import { aiAllowed } from "./aiConsent";
import { requestCityPhotos } from "./cityPhotos";
import {
  MAX_ITEM_PLACES,
  normalizeCities,
  normalizePlaceLocations,
  savedPlaceKey,
  withoutCitySuffix,
} from "./model/itemFields";
import {
  isRemovedSuggestion,
  removalsSince,
  visibleSave,
} from "./model/placeRemovals";
import { splitSavedPlace } from "./model/plan";
import { buildSearchText } from "./model/searchText";
import { placesFromAnySource } from "./placePins";
import { requireProEntitlement } from "./subscriptions";
import { rateLimiter } from "./model/rateLimiter";

const editablePlace = v.object({
  name: v.string(),
  city: v.optional(v.string()),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
  appleId: v.optional(v.string()),
  category: v.optional(v.string()),
});

type EditablePlace = Infer<typeof editablePlace>;

function currentPlaces(item: Doc<"items">): EditablePlace[] {
  const pins = item.placePins ?? [];
  const names = new Set(pins.map((pin) => pin.name.toLowerCase()));
  return [
    ...pins.map(({ cuisine: _cuisine, ...pin }) => ({
      ...pin,
      ...(pin.city === undefined && item.cities?.length === 1
        ? { city: item.cities[0] }
        : {}),
    })),
    ...(item.places ?? [])
      .filter((name) => !names.has(name.toLowerCase()))
      .map((name) => ({
        name,
        ...(item.cities?.length === 1 ? { city: item.cities[0] } : {}),
      })),
  ];
}

export const getPlaces = authedQuery({
  args: { itemId: v.id("items") },
  returns: v.union(
    v.null(),
    v.object({
      places: v.array(editablePlace),
      version: v.string(),
      ready: v.boolean(),
    }),
  ),
  handler: async (ctx, { itemId }) => {
    const item = await ctx.db.get(itemId);
    if (!item || item.userId !== ctx.userId) return null;
    const places = currentPlaces(await visibleSave(ctx, item));
    return {
      places,
      version: JSON.stringify(places),
      ready: item.status === "ready",
    };
  },
});

function cleanPlace(place: EditablePlace): EditablePlace {
  const name = place.name.trim();
  const city = place.city?.trim();
  if (!name || name.length > 120 || (city?.length ?? 0) > 80)
    throw new Error("Invalid place");
  const pinned = place.lat !== undefined || place.lng !== undefined;
  if (
    pinned &&
    (!Number.isFinite(place.lat) ||
      !Number.isFinite(place.lng) ||
      Math.abs(place.lat ?? Infinity) > 90 ||
      Math.abs(place.lng ?? Infinity) > 180)
  ) {
    throw new Error("Invalid coordinates");
  }
  if ((place.appleId?.length ?? 0) > 100 || (place.category?.length ?? 0) > 80)
    throw new Error("Invalid place");
  return { ...place, name, ...(city ? { city } : {}) };
}

function samePlace(place: EditablePlace, other: EditablePlace): boolean {
  return (
    place.name === other.name &&
    place.city === other.city &&
    place.lat === other.lat &&
    place.lng === other.lng &&
    place.appleId === other.appleId &&
    place.category === other.category
  );
}

function samePlaces(left: EditablePlace[], right: EditablePlace[]): boolean {
  return (
    left.length === right.length &&
    left.every((place, index) => samePlace(place, right[index]))
  );
}

function keptPositions(
  chosen: EditablePlace[],
  current: EditablePlace[],
): Set<number> | null {
  const kept = new Set<number>();
  let at = 0;
  for (const place of chosen) {
    while (at < current.length && !samePlace(place, current[at])) at++;
    if (at === current.length) return null;
    kept.add(at++);
  }
  return kept;
}

function removalEdit(
  item: Doc<"items">,
  visible: Doc<"items">,
  chosen: EditablePlace[],
  current: EditablePlace[],
  kept: Set<number>,
  sources: string[],
) {
  const keyOf = (name: string, city: string | undefined) => {
    const bare = (city && withoutCitySuffix(name, city)) || name;
    return savedPlaceKey(bare, visible.cities) || bare.toLowerCase();
  };
  const names = (place: EditablePlace, name: string) =>
    keyOf(name, place.city) === keyOf(place.name, place.city);
  const elsewhere = (place: EditablePlace, name: string) =>
    (visible.cities ?? []).some(
      (city) =>
        city.toLowerCase() !== place.city?.toLowerCase() &&
        withoutCitySuffix(name, city) !== null,
    );
  const parts = (name: string, city: string | undefined) =>
    splitSavedPlace((city && withoutCitySuffix(name, city)) || name);
  const venue = (place: EditablePlace, name: string) => {
    const own = parts(place.name, place.city);
    const other = parts(name, place.city);
    return (
      !elsewhere(place, name) &&
      keyOf(other.name, place.city) === keyOf(own.name, place.city) &&
      (own.area === "" || own.area.toLowerCase() === other.area.toLowerCase())
    );
  };
  const removed = current.filter((_, index) => !kept.has(index));
  const gone = (name: string) =>
    (removed.some((place) => names(place, name)) &&
      !chosen.some((kept) => names(kept, name))) ||
    (removed.some((place) => venue(place, name)) &&
      !chosen.some((kept) => venue(kept, name)));
  const shownPins = visible.placePins ?? [];
  const removedPins = shownPins.filter((_, index) => !kept.has(index));
  const shownIntents = visible.intents ?? [];
  const pending = sources.filter(
    (name, index) =>
      !current.some((place) => names(place, name)) &&
      !gone(name) &&
      sources.findIndex(
        (other) => keyOf(other, undefined) === keyOf(name, undefined),
      ) === index,
  );
  return {
    kept: chosen,
    pending,
    placePins: (item.placePins ?? []).filter(
      (pin) => !removedPins.includes(pin),
    ),
    hiddenPins: (item.placePins ?? []).filter(
      (pin) => !shownPins.includes(pin),
    ),
    hiddenLabels: (item.places ?? []).filter(
      (name) => !(visible.places ?? []).includes(name),
    ),
    placeCuisines: item.placeCuisines?.filter((row) => !gone(row.name)),
    intents: item.intents?.filter(
      (intent) =>
        intent.kind !== "open_maps" ||
        !shownIntents.includes(intent) ||
        !gone(intent.value),
    ),
  };
}

function editedScope(
  item: Doc<"items">,
  chosen: EditablePlace[],
  removal: ReturnType<typeof removalEdit> | null,
) {
  const waiting = (removal?.pending.length ?? 0) > 0;
  const cities = normalizeCities([
    ...chosen.flatMap((place) =>
      place.city ? [place.city] : (item.cities ?? []),
    ),
    ...(removal?.hiddenPins ?? []).flatMap((pin) =>
      pin.city ? [pin.city] : [],
    ),
    ...(waiting ? (item.cities ?? []) : []),
  ]);
  return {
    cities,
    lookAgain:
      waiting && JSON.stringify(cities) !== JSON.stringify(item.cities ?? []),
  };
}

export const savePlaces = authedMutation({
  args: {
    itemId: v.id("items"),
    version: v.string(),
    places: v.array(editablePlace),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item || item.userId !== ctx.userId) throw new Error("Save not found");
    const removals = await ctx.db
      .query("placeRemovals")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .collect();
    const visible = await visibleSave(ctx, item, removals);
    const current = currentPlaces(visible);
    if (item.status !== "ready" || JSON.stringify(current) !== args.version)
      throw new Error("Places changed; reopen this save");
    if (args.places.length > MAX_ITEM_PLACES)
      throw new Error("Too many places");
    const requested = args.places.map(cleanPlace);
    const kept = keptPositions(requested, current);
    const removeOnly = kept
      ? removalEdit(
          item,
          visible,
          requested,
          current,
          kept,
          item.placesEdited ? [] : await placesFromAnySource(ctx, visible),
        )
      : null;
    if (!removeOnly) await requireProEntitlement(ctx, ctx.userId);
    await rateLimiter.limit(ctx, "tripEdit", { key: ctx.userId, throws: true });
    const chosen = removeOnly?.kept ?? requested;
    if (samePlaces(chosen, current)) return null;
    const { cities, lookAgain } = editedScope(item, chosen, removeOnly);
    const hiddenLabels = [
      ...(removeOnly?.hiddenLabels ?? []),
      ...(removeOnly?.pending ?? []),
    ];
    const places = [
      ...new Set([...chosen.map((place) => place.name), ...hiddenLabels]),
    ];
    const unpinned = chosen.filter((place) => place.lat === undefined);
    const placePins =
      removeOnly?.placePins ??
      chosen.flatMap((place) =>
        place.lat !== undefined && place.lng !== undefined
          ? [{ ...place, lat: place.lat, lng: place.lng }]
          : [],
      );
    const patch = {
      cities,
      places,
      placePins,
      placesEdited: true,
      placeLocations: normalizePlaceLocations(
        item.placeLocations,
        [...unpinned.map(({ name }) => name), ...hiddenLabels],
        cities,
      ),
      placeCuisines: removeOnly ? removeOnly.placeCuisines : undefined,
      intents: removeOnly
        ? removeOnly.intents
        : item.intents?.filter((intent) => intent.kind !== "open_maps"),
    };
    await ctx.db.patch(item._id, {
      ...patch,
      searchText: buildSearchText({ ...item, ...patch }),
    });
    if (!removeOnly)
      for (const removal of removalsSince(removals, item._creationTime))
        if (placePins.some((pin) => isRemovedSuggestion([removal], pin)))
          await ctx.db.delete(removal._id);
    if (unpinned.length > 0 || lookAgain)
      await ctx.scheduler.runAfter(0, internal.placePins.locateItem, {
        itemId: item._id,
      });
    if (await aiAllowed(ctx, ctx.userId)) await requestCityPhotos(ctx, cities);
    return null;
  },
});

export const claimSearch = internalMutation({
  args: { itemId: v.id("items") },
  returns: v.boolean(),
  handler: async (ctx, { itemId }) => {
    const userId = await requireUserId(ctx);
    const item = await ctx.db.get(itemId);
    if (!item || item.userId !== userId) throw new Error("Save not found");
    await requireProEntitlement(ctx, userId);
    await rateLimiter.limit(ctx, "tripPlaceSearch", {
      key: userId,
      throws: true,
    });
    return aiAllowed(ctx, userId);
  },
});
