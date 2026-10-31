import { v, type Infer } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { authedMutation, authedQuery, requireUserId } from "./model/auth";
import { aiAllowed } from "./aiConsent";
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
    ...pins.map((pin) => ({
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

function samePlaces(left: EditablePlace[], right: EditablePlace[]): boolean {
  return (
    left.length === right.length &&
    left.every((place, index) => {
      const other = right[index];
      return (
        place.name === other.name &&
        place.city === other.city &&
        place.lat === other.lat &&
        place.lng === other.lng &&
        place.appleId === other.appleId &&
        place.category === other.category
      );
    })
  );
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
    await requireProEntitlement(ctx, ctx.userId);
    const removals = await ctx.db
      .query("placeRemovals")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .collect();
    const current = currentPlaces(await visibleSave(ctx, item, removals));
    if (item.status !== "ready" || JSON.stringify(current) !== args.version)
      throw new Error("Places changed; reopen this save");
    if (args.places.length > MAX_ITEM_PLACES)
      throw new Error("Too many places");
    await rateLimiter.limit(ctx, "tripEdit", { key: ctx.userId, throws: true });
    const chosen = args.places.map(cleanPlace);
    if (samePlaces(chosen, current)) return null;
    const cities = normalizeCities(
      chosen.flatMap((place) =>
        place.city ? [place.city] : (item.cities ?? []),
      ),
    );
    const places = [...new Set(chosen.map((place) => place.name))];
    const unpinned = chosen.filter((place) => place.lat === undefined);
    const placePins = chosen.flatMap((place) =>
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
      intents: item.intents?.filter((intent) => intent.kind !== "open_maps"),
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
