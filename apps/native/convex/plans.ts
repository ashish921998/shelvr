"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { logEvent } from "./model/log";
import {
  MAX_PLAN_PLACES,
  placeKey,
  planPlaceValidator,
  suggestSavedPlaces,
  type PlanPlace,
  type PlanSource,
} from "./model/plan";

export const makePlan = action({
  args: {
    spaceId: v.id("spaces"),
    locale: v.optional(v.string()),
    /** The city the plan was opened from; it plans that city's saves, not the space's. */
    city: v.optional(v.string()),
  },
  returns: v.object({
    places: v.array(planPlaceValidator),
    considered: v.number(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ places: PlanPlace[]; considered: number }> => {
    const {
      sources,
      been,
    }: { spaceName: string; sources: PlanSource[]; been: string[] } =
      await ctx.runMutation(internal.spaces.claimPlanInternal, {
        spaceId: args.spaceId,
        city: args.city,
      });
    if (sources.length === 0) {
      return { places: [], considered: 0 };
    }

    const places = suggestSavedPlaces(
      sources,
      new Set(been.map(placeKey)),
      MAX_PLAN_PLACES,
    );
    logEvent("info", "make_plan_succeeded", {
      space_id: args.spaceId,
      considered: sources.length,
      places: places.length,
    });
    return { places, considered: sources.length };
  },
});
