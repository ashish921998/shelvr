import { v } from "convex/values";
import { action, env } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  appleMapsAccessToken,
  appleMapsConfig,
  appleMapsLookup,
  appleMapsSearchPlaces,
} from "./model/appleMaps";
import {
  searchTripPlacesResultValidator,
  type TripPlace,
} from "./model/tripPlan";
import { distanceKm } from "./model/trip";

export const search = action({
  args: { itemId: v.id("items"), city: v.string(), query: v.string() },
  returns: searchTripPlacesResultValidator,
  handler: async (
    ctx,
    args,
  ): Promise<{ available: boolean; places: TripPlace[] }> => {
    const allowed = await ctx.runMutation(
      internal.placeCorrections.claimSearch,
      { itemId: args.itemId },
    );
    const config = appleMapsConfig(env);
    if (!allowed || !config) return { available: false, places: [] };
    const city = args.city.trim().slice(0, 80);
    const query = args.query.trim().slice(0, 100);
    if (!city || query.length < 2) return { available: true, places: [] };
    const token = await appleMapsAccessToken(config);
    if (!token) return { available: false, places: [] };
    const centre = await appleMapsLookup(token, "geocode", city);
    if (!centre) return { available: false, places: [] };
    const places = await appleMapsSearchPlaces(token, query, { near: centre });
    return {
      available: true,
      places: places.filter((place) => distanceKm(place, centre) <= 50),
    };
  },
});
