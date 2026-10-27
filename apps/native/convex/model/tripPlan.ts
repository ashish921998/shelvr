import { type Infer, v } from "convex/values";
import { tripPaceValidator, tripSlotValidator } from "./trip";

// The app imports this module, so it holds validators and plain data only.

export const TRIP_INTERESTS = [
  "food",
  "coffee",
  "drinks",
  "culture",
  "sights",
  "outdoors",
  "shopping",
] as const;

export const tripInterestValidator = v.union(
  v.literal("food"),
  v.literal("coffee"),
  v.literal("drinks"),
  v.literal("culture"),
  v.literal("sights"),
  v.literal("outdoors"),
  v.literal("shopping"),
);
export type TripInterest = Infer<typeof tripInterestValidator>;

/** Where a stop came from: one of the person's saves, an Apple Maps suggestion, or added by hand. */
export const tripStopSourceValidator = v.union(
  v.literal("save"),
  v.literal("suggested"),
  v.literal("added"),
);
export type TripStopSource = Infer<typeof tripStopSourceValidator>;

export const tripStayValidator = v.object({
  name: v.string(),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
});

/** Day 0 holds the unplanned stops; days 1..dayCount are the itinerary. */
export const UNPLANNED_DAY = 0;

export const tripPlanStopValidator = v.object({
  _id: v.id("tripStops"),
  source: tripStopSourceValidator,
  itemId: v.optional(v.id("items")),
  name: v.string(),
  area: v.optional(v.string()),
  lat: v.number(),
  lng: v.number(),
  appleId: v.optional(v.string()),
  category: v.optional(v.string()),
  why: v.optional(v.string()),
  slot: v.optional(tripSlotValidator),
});
export type TripPlanStop = Infer<typeof tripPlanStopValidator>;

export const tripPlanSummaryValidator = v.object({
  _id: v.id("tripPlans"),
  name: v.string(),
  city: v.string(),
  startDate: v.optional(v.string()),
  dayCount: v.number(),
  stopCount: v.number(),
  savedCount: v.number(),
  interests: v.array(tripInterestValidator),
  createdAt: v.number(),
});
export type TripPlanSummary = Infer<typeof tripPlanSummaryValidator>;

export const tripPlanDetailValidator = v.object({
  _id: v.id("tripPlans"),
  name: v.string(),
  city: v.string(),
  startDate: v.optional(v.string()),
  dayCount: v.number(),
  pace: tripPaceValidator,
  interests: v.array(tripInterestValidator),
  stay: v.optional(tripStayValidator),
  createdAt: v.number(),
  /** `days[0]` is day 1. Stops are in visiting order. */
  days: v.array(v.array(tripPlanStopValidator)),
  unplanned: v.array(tripPlanStopValidator),
});
export type TripPlanDetail = Infer<typeof tripPlanDetailValidator>;

export const createTripPlanResultValidator = v.object({
  tripId: v.union(v.id("tripPlans"), v.null()),
  saves: v.number(),
  suggested: v.number(),
});
