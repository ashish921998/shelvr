import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { readySavesNewestFirst } from "./items";
import { authedQuery } from "./model/auth";
import { PLACE_KINDS, placeKinds } from "./model/placeKinds";
import { uniquePlacePins } from "./model/trip";

/** Arrays a function returns hold at most 8192 values; a pin is 30 per save at most. */
const MAX_MAP_PLACES = 3000;

const mapPlaceValidator = v.object({
  itemId: v.id("items"),
  name: v.string(),
  lat: v.number(),
  lng: v.number(),
  city: v.optional(v.string()),
  appleId: v.optional(v.string()),
  /** Apple's point-of-interest category, which picks the pin's icon. */
  category: v.optional(v.string()),
  /** Ids from `PLACE_KINDS`; a client skips an id it has no label for. */
  kinds: v.array(v.string()),
});

type MapPlace = {
  itemId: Id<"items">;
  name: string;
  lat: number;
  lng: number;
  city?: string;
  appleId?: string;
  category?: string;
  kinds: string[];
};

/** Every mapped place across the caller's ready saves, newest save first, one entry per spot. */
export const listMapPlaces = authedQuery({
  args: {},
  returns: v.array(mapPlaceValidator),
  handler: async (ctx) => {
    const pins: MapPlace[] = [];
    for (const item of await readySavesNewestFirst(ctx, ctx.userId))
      for (const pin of item.placePins ?? [])
        pins.push({
          itemId: item._id,
          name: pin.name,
          lat: pin.lat,
          lng: pin.lng,
          ...(pin.city ? { city: pin.city } : {}),
          ...(pin.appleId ? { appleId: pin.appleId } : {}),
          ...(pin.category ? { category: pin.category } : {}),
          kinds: placeKinds(pin.category, item.tags),
        });
    // One venue across saves, by the city page's identity rules: it keeps the newest save and every
    // kind any of its saves gave it, and the first category any of them found.
    return uniquePlacePins(pins, (kept, repeat) => ({
      ...kept,
      ...(kept.category || !repeat.category
        ? {}
        : { category: repeat.category }),
      kinds: PLACE_KINDS.filter(
        (kind) => kept.kinds.includes(kind) || repeat.kinds.includes(kind),
      ),
    })).slice(0, MAX_MAP_PLACES);
  },
});
