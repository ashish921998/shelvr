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
} from "./model/itemFields";
import {
  isRemovedSuggestion,
  removalsSince,
  visibleSave,
} from "./model/placeRemovals";
import { placeKey, splitSavedPlace } from "./model/plan";
import { buildSearchText } from "./model/searchText";
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

function onlyRemoves(
  chosen: EditablePlace[],
  current: EditablePlace[],
): boolean {
  let at = 0;
  return chosen.every((place) => {
    while (at < current.length && !samePlace(place, current[at])) at++;
    return at++ < current.length;
  });
}

function venueOf(label: string): string {
  const { name } = splitSavedPlace(label);
  return placeKey(name) || name.toLowerCase();
}

function removalEdit(
  visible: Doc<"items">,
  chosen: EditablePlace[],
  current: EditablePlace[],
) {
  const pinned = new Set(
    chosen.flatMap((place) =>
      place.lat === undefined ? [] : [venueOf(place.name)],
    ),
  );
  const removed = new Set(
    current
      .filter((place) => !chosen.some((kept) => samePlace(kept, place)))
      .map((place) => venueOf(place.name))
      .filter((venue) => !pinned.has(venue)),
  );
  const gone = (name: string) => removed.has(venueOf(name));
  const kept = chosen.filter(
    (place) => place.lat !== undefined || !gone(place.name),
  );
  return {
    kept,
    placePins: (visible.placePins ?? []).filter((pin) =>
      kept.some(
        (place) =>
          place.name === pin.name &&
          place.lat === pin.lat &&
          place.lng === pin.lng,
      ),
    ),
    placeCuisines: visible.placeCuisines?.filter((row) => !gone(row.name)),
    intents: visible.intents?.filter(
      (intent) => intent.kind !== "open_maps" || !gone(intent.value),
    ),
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
    const removeOnly = onlyRemoves(requested, current)
      ? removalEdit(visible, requested, current)
      : null;
    if (!removeOnly) await requireProEntitlement(ctx, ctx.userId);
    await rateLimiter.limit(ctx, "tripEdit", { key: ctx.userId, throws: true });
    const chosen = removeOnly?.kept ?? requested;
    if (samePlaces(chosen, current)) return null;
    const cities = normalizeCities(
      chosen.flatMap((place) =>
        place.city ? [place.city] : (item.cities ?? []),
      ),
    );
    const places = [...new Set(chosen.map((place) => place.name))];
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
        unpinned.map(({ name }) => name),
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
    for (const removal of removalsSince(removals, item._creationTime))
      if (placePins.some((pin) => isRemovedSuggestion([removal], pin)))
        await ctx.db.delete(removal._id);
    if (unpinned.length > 0)
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
