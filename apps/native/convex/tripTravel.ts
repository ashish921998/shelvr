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

const ESTIMATES_AT_ONCE_PER_DAY = 4;

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
    if (!stops) return null;
    const config = appleMapsConfig(env);
    if (!config) {
      logEvent("warn", "trip_travel_config_missing", { mode: args.mode });
      return null;
    }
    const token = await travelAccessToken(config);
    if (!token) {
      logEvent("warn", "trip_travel_token_failed", { mode: args.mode });
      return null;
    }
    const adjacentStops = stops
      .slice(1)
      .map((to, index) => ({ from: stops[index], to }));
    const legs = [];
    for (
      let start = 0;
      start < adjacentStops.length;
      start += ESTIMATES_AT_ONCE_PER_DAY
    ) {
      const batch = await Promise.all(
        adjacentStops
          .slice(start, start + ESTIMATES_AT_ONCE_PER_DAY)
          .map(async ({ from, to }) => ({
            key: travelLegKey(from, to),
            estimate: await appleTravelEstimate(token, from, to, args.mode),
          })),
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
