import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { authedMutation, authedQuery } from "./model/auth";
import {
  tripPlanDetailValidator,
  tripPlanSummaryValidator,
} from "./model/tripPlan";

// Contract stubs for the trip planner; the handlers are filled in next.

export const listTripPlans = authedQuery({
  args: {},
  returns: v.array(tripPlanSummaryValidator),
  handler: async () => [],
});

export const getTripPlan = authedQuery({
  args: { tripId: v.id("tripPlans") },
  returns: v.union(v.null(), tripPlanDetailValidator),
  handler: async () => null,
});

export const deleteTripPlan = authedMutation({
  args: { tripId: v.id("tripPlans") },
  returns: v.null(),
  handler: async () => null,
});

export const claimTripPlanInternal = internalMutation({
  args: {},
  returns: v.null(),
  handler: async () => null,
});

export const saveTripPlanInternal = internalMutation({
  args: {},
  returns: v.null(),
  handler: async () => null,
});
