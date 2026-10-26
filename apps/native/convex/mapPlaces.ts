import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { readySavesNewestFirst } from "./items";
import { authedQuery } from "./model/auth";
import { placeKinds } from "./model/placeKinds";
import { placeKey } from "./model/plan";

/** Arrays a function returns hold at most 8192 values; a pin is 30 per save at most. */
const MAX_MAP_PLACES = 3000;

const mapPlaceValidator = v.object({
  itemId: v.id("items"),
  name: v.string(),
  lat: v.number(),
  lng: v.number(),
  city: v.optional(v.string()),
  appleId: v.optional(v.string()),
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
  kinds: string[];
};

/** Every mapped place across the caller's ready saves, newest save first, one entry per spot. */
export const listMapPlaces = authedQuery({
  args: {},
  returns: v.array(mapPlaceValidator),
  handler: async (ctx) => {
    const places = new Map<string, MapPlace>();
    for (const item of await readySavesNewestFirst(ctx, ctx.userId)) {
      for (const pin of item.placePins ?? []) {
        const key = `${placeKey(pin.name)}:${pin.lat.toFixed(4)}:${pin.lng.toFixed(4)}`;
        const kinds = placeKinds(pin.category, item.tags);
        const seen = places.get(key);
        if (seen) {
          // The same spot saved twice keeps the newest save and every kind either save gave it.
          seen.kinds = [...new Set([...seen.kinds, ...kinds])];
          continue;
        }
        if (places.size >= MAX_MAP_PLACES) continue;
        places.set(key, {
          itemId: item._id,
          name: pin.name,
          lat: pin.lat,
          lng: pin.lng,
          ...(pin.city ? { city: pin.city } : {}),
          ...(pin.appleId ? { appleId: pin.appleId } : {}),
          kinds,
        });
      }
    }
    return [...places.values()];
  },
});
