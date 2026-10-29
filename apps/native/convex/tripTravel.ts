"use node";

import { v } from "convex/values";
import { action, env } from "./_generated/server";
import { internal } from "./_generated/api";
import { appleMapsConfig } from "./model/appleMaps";
import { appleTravelEstimate, travelAccessToken } from "./model/appleTravel";
import {
  travelLegKey,
  travelModeValidator,
  travelLegValidator,
  type TravelEstimate,
} from "./model/tripTravel";
import { logEvent } from "./model/log";

export const estimateDay = action({
  args: {
    tripId: v.id("tripPlans"),
    day: v.number(),
    layout: v.string(),
    mode: travelModeValidator,
  },
  returns: v.union(v.null(), v.array(travelLegValidator)),
  handler: async (
    ctx,
    args,
  ): Promise<{ key: string; estimate: TravelEstimate | null }[] | null> => {
    const stops = await ctx.runMutation(internal.tripTravelData.claimDay, {
      tripId: args.tripId,
      day: args.day,
      layout: args.layout,
    });
    const config = appleMapsConfig(env);
    if (!stops || !config) return null;
    const token = await travelAccessToken(config);
    if (!token) return null;
    const legs = [];
    // Bound concurrent requests even when a user moves many stops onto one day.
    for (let start = 1; start < stops.length; start += 4) {
      const batch = await Promise.all(
        stops.slice(start, start + 4).map(async (to, index) => {
          const from = stops[start + index - 1];
          return {
            key: travelLegKey(from, to),
            estimate: await appleTravelEstimate(token, from, to, args.mode),
          };
        }),
      );
      legs.push(...batch);
    }
    const missing = legs.filter((leg) => leg.estimate === null).length;
    if (missing)
      logEvent("warn", "trip_travel_unavailable", {
        legs: legs.length,
        missing,
        mode: args.mode,
      });
    return legs;
  },
});
