"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { tripPaceValidator } from "./model/trip";
import {
  createTripPlanResultValidator,
  tripInterestValidator,
} from "./model/tripPlan";

export const createTripPlan = action({
  args: {
    city: v.string(),
    days: v.number(),
    startDate: v.optional(v.string()),
    pace: tripPaceValidator,
    interests: v.array(tripInterestValidator),
    stay: v.optional(v.string()),
    locale: v.optional(v.string()),
  },
  returns: createTripPlanResultValidator,
  handler: async () => ({ tripId: null, saves: 0, suggested: 0 }),
});
