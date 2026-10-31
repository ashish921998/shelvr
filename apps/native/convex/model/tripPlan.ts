import { type Infer, v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
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

const [firstInterest, ...otherInterests] = TRIP_INTERESTS.map((interest) =>
  v.literal(interest),
);
export const tripInterestValidator = v.union(firstInterest, ...otherInterests);
export type TripInterest = Infer<typeof tripInterestValidator>;

/**
 * Where a stop came from: one of the person's saves, an Apple Maps suggestion, or a place the
 * person found with Add a place.
 */
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

/** The longest trip name a rename keeps. */
export const MAX_TRIP_NAME_CHARS = 80;

export const tripPlanSummaryValidator = v.object({
  _id: v.id("tripPlans"),
  /** Set once the person renames the trip; the app shows "<city> trip" until then. */
  name: v.optional(v.string()),
  city: v.string(),
  startDate: v.optional(v.string()),
  dayCount: v.number(),
  stopCount: v.number(),
  savedCount: v.number(),
  interests: v.array(tripInterestValidator),
  createdAt: v.number(),
});
export type TripPlanSummary = Infer<typeof tripPlanSummaryValidator>;

export function tripSummary(plan: Doc<"tripPlans">): TripPlanSummary {
  return {
    _id: plan._id,
    ...(plan.name !== undefined ? { name: plan.name } : {}),
    city: plan.city,
    ...(plan.startDate !== undefined ? { startDate: plan.startDate } : {}),
    dayCount: plan.dayCount,
    stopCount: plan.stopCount,
    savedCount: plan.savedCount,
    interests: plan.interests,
    createdAt: plan._creationTime,
  };
}

export const tripPlanDetailValidator = v.object({
  _id: v.id("tripPlans"),
  listId: v.optional(v.id("sharedLists")),
  name: v.optional(v.string()),
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

/** A place Add a place can put on a trip: an Apple Maps search result. */
export const tripPlaceValidator = v.object({
  name: v.string(),
  lat: v.number(),
  lng: v.number(),
  appleId: v.optional(v.string()),
  category: v.optional(v.string()),
  area: v.optional(v.string()),
});
export type TripPlace = Infer<typeof tripPlaceValidator>;

export const searchTripPlacesResultValidator = v.object({
  /** False when Apple Maps can't be asked: no Maps key, or AI declined for this account. */
  available: v.boolean(),
  places: v.array(tripPlaceValidator),
});

/** One of the trip city's saved places that is not on the trip yet. */
export const tripSavePlaceValidator = v.object({
  itemId: v.id("items"),
  name: v.string(),
  /** The save's title, so the person knows which save the place came from. */
  title: v.optional(v.string()),
  category: v.optional(v.string()),
});
export type TripSavePlace = Infer<typeof tripSavePlaceValidator>;

/** Where a stop was before an edit, so the app's Undo can put it back. */
export const tripStopPlaceValidator = v.object({
  day: v.number(),
  index: v.number(),
});
