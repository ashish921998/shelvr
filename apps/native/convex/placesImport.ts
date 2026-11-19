"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { logEvent } from "./model/log";
import {
  cityCentre,
  inCity,
  reportValidator,
  type StoredPlace,
} from "./model/placeImport";
import { SAME_SPOT_KM } from "./model/placeList";
import { fetchGoogleMapsList } from "./model/readers/googleMaps";
import { appleMapsLookup } from "./model/appleMaps";
import { distanceKm } from "./model/trip";

export const importGoogleMapsList = internalAction({
  args: { city: v.string(), url: v.string() },
  returns: reportValidator,
  handler: async (ctx, args) => {
    const page = await fetchGoogleMapsList(args.url);
    if (page === undefined)
      throw new Error("the link is not a Google Maps list");
    if (!page.placeList) throw new Error("the list has no places");
    const { name: city, token, centre } = await cityCentre(args.city);
    const found: StoredPlace[] = [];
    const missed: string[] = [];
    for (const listed of page.placeList) {
      const hint =
        listed.lat !== undefined && listed.lng !== undefined
          ? { lat: listed.lat, lng: listed.lng }
          : null;
      const at = hint
        ? await appleMapsLookup(token, "search", listed.name, hint)
        : null;
      if (
        hint === null ||
        !at?.appleId ||
        distanceKm(at, hint) > SAME_SPOT_KM ||
        !inCity(at, centre)
      ) {
        missed.push(listed.name);
        continue;
      }
      found.push({
        name: listed.name,
        lat: at.lat,
        lng: at.lng,
        appleId: at.appleId,
        ...(at.category ? { category: at.category } : {}),
      });
    }
    const stored: { added: number; existing: number } = await ctx.runMutation(
      internal.places.store,
      { city, places: found, source: args.url },
    );
    logEvent("info", "places_imported", { ...stored, missed: missed.length });
    return { ...stored, missed };
  },
});
