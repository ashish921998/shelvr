import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { aiAllowed } from "./aiConsent";
import { readyCitySaves } from "./items";
import { authedMutation, authedQuery, requireUserId } from "./model/auth";
import { MAX_PLAN_ITEMS, planSourceValidator } from "./model/plan";
import { rateLimiter } from "./model/rateLimiter";
import {
  MAX_TRIP_DAYS,
  MIN_TRIP_DAYS,
  pinsForCity,
  tidyCity,
  tripPaceValidator,
} from "./model/trip";
import {
  TRIP_INTERESTS,
  tripInterestValidator,
  tripPlanDetailValidator,
  tripPlanStopValidator,
  tripPlanSummaryValidator,
  tripStayValidator,
  UNPLANNED_DAY,
  type TripInterest,
  type TripPlanStop,
} from "./model/tripPlan";
import { requireProEntitlement } from "./subscriptions";
import { beenPlaces, toPlanSource } from "./tripData";

const MAX_CITY_CHARS = 80;
const MAX_STAY_CHARS = 120;
/** Days of a packed 15-day trip, plus room for unplanned extras. */
const MAX_TRIP_STOPS = 150;
const LIST_LIMIT = 50;
/** Recent "We went" marks a suggestion is checked against, beyond the saves' own places. */
const RECENT_VISITS = 200;
const TAGS_PER_SAVE = 8;

function tripDays(days: number): number {
  const whole = Number.isFinite(days) ? Math.round(days) : MIN_TRIP_DAYS;
  return Math.min(MAX_TRIP_DAYS, Math.max(MIN_TRIP_DAYS, whole));
}

/** Known interests in the order asked, each once. */
function tripInterests(interests: TripInterest[]): TripInterest[] {
  return [...new Set(interests)]
    .filter((interest) => TRIP_INTERESTS.includes(interest))
    .slice(0, TRIP_INTERESTS.length);
}

function tidyStartDate(date: string | undefined): string | undefined {
  return date !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(date.trim())
    ? date.trim()
    : undefined;
}

function tidyStay(stay: string | undefined): string | undefined {
  const text = stay?.replace(/\s+/g, " ").trim().slice(0, MAX_STAY_CHARS);
  return text ? text : undefined;
}

const savedPinValidator = v.object({
  itemId: v.id("items"),
  name: v.string(),
  lat: v.number(),
  lng: v.number(),
  appleId: v.optional(v.string()),
  category: v.optional(v.string()),
});

const saveTasteValidator = v.object({
  tags: v.array(v.string()),
  categories: v.array(v.string()),
});

async function recentVisits(ctx: QueryCtx, userId: string): Promise<string[]> {
  const visits = await ctx.db
    .query("placeVisits")
    .withIndex("by_user_and_visited", (q) => q.eq("userId", userId))
    .order("desc")
    .take(RECENT_VISITS);
  return visits.map((visit) => visit.name);
}

function tasteOf(item: Doc<"items">, city: string) {
  return {
    tags: item.tags.slice(0, TAGS_PER_SAVE),
    categories: [
      ...new Set(
        pinsForCity(item, city).flatMap((pin) =>
          pin.category ? [pin.category] : [],
        ),
      ),
    ],
  };
}

/** Checks the caller may plan, spends one plan from the rate limit, and reads what the plan is made from. */
export const claimTripPlanInternal = internalMutation({
  args: {
    city: v.string(),
    days: v.number(),
    interests: v.array(tripInterestValidator),
    startDate: v.optional(v.string()),
    stay: v.optional(v.string()),
  },
  returns: v.object({
    city: v.string(),
    days: v.number(),
    interests: v.array(tripInterestValidator),
    startDate: v.optional(v.string()),
    stay: v.optional(v.string()),
    sources: v.array(planSourceValidator),
    been: v.array(v.string()),
    pins: v.array(savedPinValidator),
    tastes: v.array(saveTasteValidator),
    aiAllowed: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireProEntitlement(ctx, userId);
    const city = tidyCity(args.city).slice(0, MAX_CITY_CHARS);
    if (city === "") throw new Error("City required");
    await rateLimiter.limit(ctx, "createTripPlan", {
      key: userId,
      throws: true,
    });
    const saves = await readyCitySaves(ctx, userId, city, MAX_PLAN_ITEMS);
    const sources = saves.map((item) => toPlanSource(item, undefined, city));
    const allowed = await aiAllowed(ctx, userId);
    const startDate = tidyStartDate(args.startDate);
    const stay = tidyStay(args.stay);
    return {
      city,
      days: tripDays(args.days),
      interests: tripInterests(args.interests),
      ...(startDate !== undefined ? { startDate } : {}),
      ...(stay !== undefined ? { stay } : {}),
      sources,
      been: [
        ...new Set([
          ...(await beenPlaces(ctx, userId, sources)),
          ...(await recentVisits(ctx, userId)),
        ]),
      ],
      pins: saves.flatMap((item) =>
        pinsForCity(item, city).map((pin) => ({
          itemId: item._id,
          name: pin.name,
          lat: pin.lat,
          lng: pin.lng,
          ...(pin.appleId !== undefined ? { appleId: pin.appleId } : {}),
          ...(pin.category !== undefined ? { category: pin.category } : {}),
        })),
      ),
      // Tags come from the model's reading of a save, so they reach Apple only while AI is allowed.
      tastes: allowed ? saves.map((item) => tasteOf(item, city)) : [],
      aiAllowed: allowed,
    };
  },
});

const { _id: _stopId, ...stopFields } = tripPlanStopValidator.fields;
const stopInputValidator = v.object(stopFields);
type StopInput = Omit<TripPlanStop, "_id">;

async function ownedStops(
  ctx: QueryCtx,
  userId: string,
  stops: StopInput[],
): Promise<StopInput[]> {
  const kept: StopInput[] = [];
  for (const stop of stops) {
    if (stop.itemId !== undefined) {
      const item = await ctx.db.get(stop.itemId);
      // A save deleted since the claim leaves the trip; a stop never points at someone else's save.
      if (item === null || item.userId !== userId) continue;
    }
    kept.push(stop);
  }
  return kept;
}

/** Stores a new trip (older trips stay) with its stops; day 0 holds the unplanned ones. */
export const saveTripPlanInternal = internalMutation({
  args: {
    city: v.string(),
    dayCount: v.number(),
    pace: tripPaceValidator,
    interests: v.array(tripInterestValidator),
    startDate: v.optional(v.string()),
    stay: v.optional(tripStayValidator),
    days: v.array(v.array(stopInputValidator)),
    unplanned: v.array(stopInputValidator),
  },
  returns: v.id("tripPlans"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const dayCount = tripDays(args.dayCount);
    let room = MAX_TRIP_STOPS;
    const placed: { day: number; stops: StopInput[] }[] = [];
    const groups = [
      ...args.days
        .slice(0, dayCount)
        .map((stops, i) => ({ day: i + 1, stops })),
      { day: UNPLANNED_DAY, stops: args.unplanned },
    ];
    for (const { day, stops } of groups) {
      const kept = (await ownedStops(ctx, userId, stops)).slice(0, room);
      room -= kept.length;
      placed.push({ day, stops: kept });
    }
    // My Trips counts the stops the days hold; the unplanned extras are not part of the trip yet.
    const planned = placed
      .filter(({ day }) => day !== UNPLANNED_DAY)
      .flatMap(({ stops }) => stops);
    const now = Date.now();
    const tripId = await ctx.db.insert("tripPlans", {
      userId,
      name: tidyCity(args.city).slice(0, MAX_CITY_CHARS),
      city: tidyCity(args.city).slice(0, MAX_CITY_CHARS),
      ...(args.startDate !== undefined ? { startDate: args.startDate } : {}),
      dayCount,
      pace: args.pace,
      interests: tripInterests(args.interests),
      ...(args.stay !== undefined ? { stay: args.stay } : {}),
      stopCount: planned.length,
      savedCount: planned.filter((stop) => stop.source === "save").length,
      createdAt: now,
      updatedAt: now,
    });
    for (const { day, stops } of placed) {
      for (const [order, stop] of stops.entries()) {
        await ctx.db.insert("tripStops", {
          ...stop,
          tripId,
          userId,
          day,
          order,
        });
      }
    }
    return tripId;
  },
});

export const listTripPlans = authedQuery({
  args: {},
  returns: v.array(tripPlanSummaryValidator),
  handler: async (ctx) => {
    const plans = await ctx.db
      .query("tripPlans")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .take(LIST_LIMIT);
    return plans.map((plan) => ({
      _id: plan._id,
      name: plan.name,
      city: plan.city,
      ...(plan.startDate !== undefined ? { startDate: plan.startDate } : {}),
      dayCount: plan.dayCount,
      stopCount: plan.stopCount,
      savedCount: plan.savedCount,
      createdAt: plan.createdAt,
    }));
  },
});

async function ownedPlan(
  ctx: QueryCtx,
  tripId: Id<"tripPlans">,
  userId: string,
): Promise<Doc<"tripPlans"> | null> {
  const plan = await ctx.db.get(tripId);
  return plan !== null && plan.userId === userId ? plan : null;
}

async function stopsOf(
  ctx: QueryCtx,
  tripId: Id<"tripPlans">,
): Promise<Doc<"tripStops">[]> {
  return await ctx.db
    .query("tripStops")
    .withIndex("by_trip_and_day", (q) => q.eq("tripId", tripId))
    .take(MAX_TRIP_STOPS);
}

function stopView(
  stop: Doc<"tripStops">,
  live: ReadonlySet<Id<"items">>,
): TripPlanStop {
  // A save deleted past what deleteItem unlinks in one go must not open from the trip.
  const itemId =
    stop.itemId !== undefined && live.has(stop.itemId)
      ? stop.itemId
      : undefined;
  return {
    _id: stop._id,
    source: stop.source,
    ...(itemId !== undefined ? { itemId } : {}),
    name: stop.name,
    ...(stop.area !== undefined ? { area: stop.area } : {}),
    lat: stop.lat,
    lng: stop.lng,
    ...(stop.appleId !== undefined ? { appleId: stop.appleId } : {}),
    ...(stop.category !== undefined ? { category: stop.category } : {}),
    ...(stop.why !== undefined ? { why: stop.why } : {}),
    ...(stop.slot !== undefined ? { slot: stop.slot } : {}),
  };
}

/** The saves the trip's stops link to that still exist and belong to the caller. */
async function liveSaves(
  ctx: QueryCtx,
  stops: Doc<"tripStops">[],
  userId: string,
): Promise<Set<Id<"items">>> {
  const ids = [
    ...new Set(
      stops.flatMap((stop) => (stop.itemId !== undefined ? [stop.itemId] : [])),
    ),
  ];
  const items = await Promise.all(ids.map((id) => ctx.db.get(id)));
  return new Set(
    ids.filter((_, i) => {
      const item = items[i];
      return item !== null && item.userId === userId;
    }),
  );
}

/** The trip with its days and unplanned stops. Stops carry their own name and pin, so a deleted save never breaks it. */
export const getTripPlan = authedQuery({
  args: { tripId: v.id("tripPlans") },
  returns: v.union(v.null(), tripPlanDetailValidator),
  handler: async (ctx, args) => {
    const plan = await ownedPlan(ctx, args.tripId, ctx.userId);
    if (plan === null) return null;
    const days: TripPlanStop[][] = Array.from(
      { length: plan.dayCount },
      () => [],
    );
    const unplanned: TripPlanStop[] = [];
    // The index orders stops by day, then by their order within it.
    const stops = await stopsOf(ctx, plan._id);
    const live = await liveSaves(ctx, stops, ctx.userId);
    for (const stop of stops) {
      if (stop.day === UNPLANNED_DAY) unplanned.push(stopView(stop, live));
      else days[stop.day - 1]?.push(stopView(stop, live));
    }
    return {
      _id: plan._id,
      name: plan.name,
      city: plan.city,
      ...(plan.startDate !== undefined ? { startDate: plan.startDate } : {}),
      dayCount: plan.dayCount,
      pace: plan.pace,
      interests: plan.interests,
      ...(plan.stay !== undefined ? { stay: plan.stay } : {}),
      createdAt: plan.createdAt,
      days,
      unplanned,
    };
  },
});

export const deleteTripPlan = authedMutation({
  args: { tripId: v.id("tripPlans") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const plan = await ownedPlan(ctx, args.tripId, ctx.userId);
    if (plan === null) throw new Error("Trip not found");
    // saveTripPlanInternal stores at most MAX_TRIP_STOPS, so one read takes them all.
    for (const stop of await stopsOf(ctx, plan._id)) {
      await ctx.db.delete(stop._id);
    }
    await ctx.db.delete(plan._id);
    return null;
  },
});
