import {
  userRemovals,
  removalValidator,
  visibleSave,
} from "./model/placeRemovals";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { aiAllowed } from "./aiConsent";
import { readyCitySaves, readySavesNewestFirst } from "./items";
import { authedMutation, authedQuery, requireUserId } from "./model/auth";
import {
  MAX_PLACE_NAME_CHARS,
  MAX_PLAN_ITEMS,
  placeKey,
  planSourceValidator,
} from "./model/plan";
import { sameTripPlace, type TripPlaceRef } from "./model/placeIdentity";
import { recentVisits } from "./model/placeVisits";
import { listPlanClaimValidator } from "./model/sharedLists";
import { rateLimiter } from "./model/rateLimiter";
import {
  cityKey,
  distanceKm,
  MAX_CITY_CHARS,
  MAX_TRIP_DAYS,
  middleOf,
  MIN_TRIP_DAYS,
  pinsForCity,
  STOPS_PER_DAY,
  tidyCity,
  tripPaceValidator,
  type LatLng,
} from "./model/trip";
import { SEARCH_RADIUS_KM } from "./model/tripSuggest";
import {
  tidyPlace,
  tidyText,
  tripSummary,
  validPoint,
} from "./model/tripPlace";
import {
  countryName,
  MAX_TRIP_COUNTRIES,
  MAX_TRIP_COVER_CHARS,
} from "./model/tripCountries";
import {
  MAX_TRIP_NAME_CHARS,
  MAX_TRIP_STOP_NOTE_CHARS,
  TRIP_STOP_TIME,
  tripInterestValidator,
  tripPlaceValidator,
  tripSavePlaceValidator,
  tripStopPlaceValidator,
  tripPlanDetailValidator,
  tripPlanStopValidator,
  tripPlanSummaryValidator,
  tripStayValidator,
  UNPLANNED_DAY,
  type TripInterest,
  type TripPlace,
  type TripPlanStop,
  type TripSavePlace,
} from "./model/tripPlan";
import { claimListPlan, requirePlanAccess } from "./sharedLists";
import { requireProEntitlement } from "./subscriptions";
import { beenPlaces, toPlanSource } from "./tripData";

const MAX_STAY_CHARS = 120;
/** Days of a packed 15-day trip, plus room for unplanned extras. */
const MAX_TRIP_STOPS = 150;
/** The most trips one page of My trips reads, whatever the client asks for. */
const LIST_PAGE_MAX = 50;
const TAGS_PER_SAVE = 8;

function tripDays(days: number): number {
  const whole = Number.isFinite(days) ? Math.round(days) : MIN_TRIP_DAYS;
  return Math.min(MAX_TRIP_DAYS, Math.max(MIN_TRIP_DAYS, whole));
}

/** The interests in the order asked, each once. */
function tripInterests(interests: TripInterest[]): TripInterest[] {
  return [...new Set(interests)];
}

/** A real calendar day as YYYY-MM-DD, so Feb 30 never shifts into March. */
function tidyStartDate(date: string | undefined): string | undefined {
  const text = date?.trim();
  const match = text?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!text || !match) return undefined;
  const [year, month, day] = match.slice(1).map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? text
    : undefined;
}

function tidyStay(stay: string | undefined): string | undefined {
  const text = stay?.replace(/\s+/g, " ").trim().slice(0, MAX_STAY_CHARS);
  return text ? text : undefined;
}

export const savedPinValidator = v.object({
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

const plannedTripFields = {
  city: v.string(),
  days: v.number(),
  interests: v.array(tripInterestValidator),
  startDate: v.optional(v.string()),
  stay: v.optional(v.string()),
  tastes: v.array(saveTasteValidator),
};

/** Checks the caller may plan, spends one plan from the rate limit, and reads what the plan is made from. */
export const claimTripPlanInternal = internalMutation({
  args: {
    city: v.string(),
    days: v.number(),
    interests: v.array(tripInterestValidator),
    startDate: v.optional(v.string()),
    stay: v.optional(v.string()),
    listId: v.optional(v.id("sharedLists")),
  },
  returns: v.union(
    v.object({
      from: v.literal("saves"),
      ...plannedTripFields,
      sources: v.array(planSourceValidator),
      been: v.array(v.string()),
      removed: v.array(removalValidator),
      pins: v.array(savedPinValidator),
      aiAllowed: v.boolean(),
    }),
    v.object({
      from: v.literal("list"),
      ...plannedTripFields,
      ...listPlanClaimValidator.fields,
    }),
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const city = tidyCity(args.city).slice(0, MAX_CITY_CHARS);
    if (city === "") throw new Error("City required");
    const startDate = tidyStartDate(args.startDate);
    const stay = tidyStay(args.stay);
    const asked = {
      city,
      days: tripDays(args.days),
      interests: tripInterests(args.interests),
      ...(startDate !== undefined ? { startDate } : {}),
      ...(stay !== undefined ? { stay } : {}),
    };
    if (args.listId !== undefined) {
      const claim = await claimListPlan(ctx, args.listId, userId, city, {
        bucket: "createTripPlan",
        needsPlaces: true,
      });
      return {
        from: "list" as const,
        ...asked,
        ...claim,
        tastes: claim.aiAllowed
          ? claim.places.map((place) => ({
              tags: place.tags,
              categories: place.category !== undefined ? [place.category] : [],
            }))
          : [],
      };
    }
    await requireProEntitlement(ctx, userId);
    await rateLimiter.limit(ctx, "createTripPlan", {
      key: userId,
      throws: true,
    });
    const removed = await userRemovals(ctx, userId);
    const saves = await readyCitySaves(
      ctx,
      userId,
      city,
      MAX_PLAN_ITEMS,
      removed,
    );
    const sources = saves.map((item) => toPlanSource(item, city));
    const allowed = await aiAllowed(ctx, userId);
    return {
      from: "saves" as const,
      ...asked,
      sources,
      removed,
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

function savedStops(planned: { source: string }[]): number {
  return planned.filter((stop) => stop.source === "save").length;
}
type StopInput = Omit<TripPlanStop, "_id">;

/** Stores a new trip (older trips stay) with its stops; day 0 holds the unplanned ones. */
export const saveTripPlanInternal = internalMutation({
  args: {
    city: v.string(),
    listId: v.optional(v.id("sharedLists")),
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
    // The claim already tidied the city, clamped the days and deduplicated the interests.
    let room = MAX_TRIP_STOPS;
    const placed: { day: number; stops: StopInput[] }[] = [];
    const groups = [
      ...args.days
        .slice(0, args.dayCount)
        .map((stops, i) => ({ day: i + 1, stops })),
      { day: UNPLANNED_DAY, stops: args.unplanned },
    ];
    for (const { day, stops } of groups) {
      const kept = stops.slice(0, room);
      room -= kept.length;
      placed.push({ day, stops: kept });
    }
    // My Trips counts the stops the days hold; the unplanned extras are not part of the trip yet.
    const planned = placed
      .filter(({ day }) => day !== UNPLANNED_DAY)
      .flatMap(({ stops }) => stops);
    const { days: _days, unplanned: _unplanned, ...trip } = args;
    const tripId = await ctx.db.insert("tripPlans", {
      ...trip,
      userId,
      stopCount: planned.length,
      savedCount: savedStops(planned),
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

export const createBlankTrip = authedMutation({
  args: {
    name: v.string(),
    countries: v.array(v.string()),
    city: v.optional(v.string()),
    dayCount: v.number(),
    startDate: v.optional(v.string()),
    stay: v.optional(tripStayValidator),
    cover: v.optional(v.string()),
  },
  returns: v.id("tripPlans"),
  handler: async (ctx, args) => {
    const name = tidyText(args.name, MAX_TRIP_NAME_CHARS);
    const countries = [...new Set(args.countries)];
    const destination = countryName(countries[0] ?? "");
    if (
      !name ||
      !destination ||
      countries.length > MAX_TRIP_COUNTRIES ||
      countries.some((code) => !countryName(code))
    )
      throw new Error("Invalid trip");
    if (args.dayCount !== tripDays(args.dayCount))
      throw new Error("Invalid duration");
    const startDate = tidyStartDate(args.startDate);
    if (args.startDate !== undefined && startDate === undefined)
      throw new Error("Invalid start date");
    const cover = args.cover;
    if (
      cover !== undefined &&
      (cover.length > MAX_TRIP_COVER_CHARS ||
        !/^\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(cover))
    )
      throw new Error("Invalid cover");
    const stay = tidyStay(args.stay?.name);
    const at = args.stay;
    if (
      (at?.lat !== undefined || at?.lng !== undefined) &&
      (at.lat === undefined ||
        at.lng === undefined ||
        !validPoint(at.lat, at.lng))
    )
      throw new Error("Invalid stay");
    await requireProEntitlement(ctx, ctx.userId);
    await rateLimiter.limit(ctx, "createTripPlan", {
      key: ctx.userId,
      throws: true,
    });
    return await ctx.db.insert("tripPlans", {
      userId: ctx.userId,
      name,
      countries,
      city: tidyText(args.city, MAX_CITY_CHARS) ?? destination,
      dayCount: args.dayCount,
      pace: "balanced",
      interests: [],
      stopCount: 0,
      savedCount: 0,
      ...(startDate ? { startDate } : {}),
      ...(cover ? { cover } : {}),
      ...(stay
        ? {
            stay: {
              name: stay,
              ...(at?.lat !== undefined && at.lng !== undefined
                ? { lat: at.lat, lng: at.lng }
                : {}),
            },
          }
        : {}),
    });
  },
});

export const listTripPlans = authedQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(tripPlanSummaryValidator),
  handler: async (ctx, args) => {
    const opts = args.paginationOpts;
    const result = await ctx.db
      .query("tripPlans")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .paginate({ ...opts, numItems: Math.min(opts.numItems, LIST_PAGE_MAX) });
    return { ...result, page: result.page.map(tripSummary) };
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

function tripCentre(
  plan: Doc<"tripPlans">,
  stops: Doc<"tripStops">[],
): LatLng | null {
  const planned = stops.filter((stop) => stop.day !== UNPLANNED_DAY);
  const lat = plan.stay?.lat;
  const lng = plan.stay?.lng;
  return (
    middleOf(planned.length > 0 ? planned : stops) ??
    (lat !== undefined && lng !== undefined ? { lat, lng } : null)
  );
}

function hasBaseCity(plan: Doc<"tripPlans">): boolean {
  return !plan.countries?.some(
    (code) => cityKey(countryName(code) ?? "") === cityKey(plan.city),
  );
}

function tripPins<T extends LatLng & { name: string; city?: string }>(
  item: { cities?: string[]; placePins?: T[] },
  plan: Doc<"tripPlans">,
  centre: LatLng | null,
): T[] {
  const named = pinsForCity(item, plan.city);
  if (hasBaseCity(plan) || centre === null) return named;
  return (item.placePins ?? []).filter(
    (pin) => named.includes(pin) || distanceKm(pin, centre) <= SEARCH_RADIUS_KM,
  );
}

async function tripSaves(
  ctx: QueryCtx,
  plan: Doc<"tripPlans">,
  userId: string,
  centre: LatLng | null,
): Promise<Doc<"items">[]> {
  if (hasBaseCity(plan) || centre === null)
    return await readyCitySaves(ctx, userId, plan.city);
  return (await readySavesNewestFirst(ctx, userId)).filter(
    (item) => tripPins(item, plan, centre).length > 0,
  );
}

function stopView(
  stop: Doc<"tripStops">,
  live: ReadonlySet<Id<"items">>,
): TripPlanStop {
  // Deleting a save leaves its stops pointing at it; only a live save of the caller opens.
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
    ...(stop.time !== undefined ? { time: stop.time } : {}),
    ...(stop.note !== undefined ? { note: stop.note } : {}),
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
      ...(plan.listId !== undefined ? { listId: plan.listId } : {}),
      ...(plan.name !== undefined ? { name: plan.name } : {}),
      ...(plan.countries !== undefined ? { countries: plan.countries } : {}),
      ...(plan.cover !== undefined ? { cover: plan.cover } : {}),
      city: plan.city,
      ...(plan.startDate !== undefined ? { startDate: plan.startDate } : {}),
      dayCount: plan.dayCount,
      pace: plan.pace,
      interests: plan.interests,
      ...(plan.stay !== undefined ? { stay: plan.stay } : {}),
      createdAt: plan._creationTime,
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

/** Saved places Add a place offers; a city's saves rarely name more. */
const MAX_SAVE_PLACES = 100;

/** The caller's trip, checked for Pro and charged one edit, or an error the app shows as "couldn't". */
async function editablePlan(
  ctx: MutationCtx,
  tripId: Id<"tripPlans">,
  userId: Id<"users">,
): Promise<Doc<"tripPlans">> {
  const plan = await ownedPlan(ctx, tripId, userId);
  if (plan === null) throw new Error("Trip not found");
  await requirePlanAccess(ctx, plan, userId);
  await rateLimiter.limit(ctx, "tripEdit", { key: userId, throws: true });
  return plan;
}

async function ownedStop(
  ctx: MutationCtx,
  stopId: Id<"tripStops">,
  userId: Id<"users">,
): Promise<{ plan: Doc<"tripPlans">; stop: Doc<"tripStops"> }> {
  const stop = await ctx.db.get(stopId);
  if (stop === null || stop.userId !== userId)
    throw new Error("Stop not found");
  const plan = await editablePlan(ctx, stop.tripId, userId);
  return { plan, stop };
}

function checkedDay(plan: Doc<"tripPlans">, day: number): number {
  if (!Number.isInteger(day) || day < UNPLANNED_DAY || day > plan.dayCount) {
    throw new Error("No such day");
  }
  return day;
}

/** One day's stops in visiting order (the index orders them by `order`). */
async function stopsOnDay(
  ctx: QueryCtx,
  tripId: Id<"tripPlans">,
  day: number,
): Promise<Doc<"tripStops">[]> {
  return await ctx.db
    .query("tripStops")
    .withIndex("by_trip_and_day", (q) => q.eq("tripId", tripId).eq("day", day))
    .take(MAX_TRIP_STOPS);
}

/**
 * Puts `stopId` at `index` of `day` and numbers that day again, so `order` stays 0..n-1.
 * The day it left keeps its gap: order only has to sort, and leaving it alone saves writes.
 */
async function placeStop(
  ctx: MutationCtx,
  plan: Doc<"tripPlans">,
  stopId: Id<"tripStops">,
  day: number,
  index: number,
): Promise<void> {
  const others = (await stopsOnDay(ctx, plan._id, day)).filter(
    (stop) => stop._id !== stopId,
  );
  const at = Number.isFinite(index)
    ? Math.min(others.length, Math.max(0, Math.round(index)))
    : others.length;
  const ids = others.map((stop) => stop._id);
  ids.splice(at, 0, stopId);
  const orders = new Map(others.map((stop) => [stop._id, stop.order]));
  for (const [order, id] of ids.entries()) {
    if (id === stopId) await ctx.db.patch(id, { day, order });
    else if (orders.get(id) !== order) await ctx.db.patch(id, { order });
  }
}

/** My trips' counts follow the days; the unplanned stops are not part of the trip yet. */
async function recount(ctx: MutationCtx, plan: Doc<"tripPlans">) {
  const planned = (await stopsOf(ctx, plan._id)).filter(
    (stop) => stop.day !== UNPLANNED_DAY,
  );
  await ctx.db.patch(plan._id, {
    stopCount: planned.length,
    savedCount: savedStops(planned),
  });
}

async function positionOf(
  ctx: QueryCtx,
  stop: Doc<"tripStops">,
): Promise<{ day: number; index: number }> {
  const day = await stopsOnDay(ctx, stop.tripId, stop.day);
  return {
    day: stop.day,
    index: Math.max(
      0,
      day.findIndex((other) => other._id === stop._id),
    ),
  };
}

/**
 * Moves a stop to `index` of `day` (0 is Unplanned), within its day or to another one.
 * Undo calls it again with the place the earlier edit returned.
 */
export const moveTripStop = authedMutation({
  args: { stopId: v.id("tripStops"), day: v.number(), index: v.number() },
  returns: tripStopPlaceValidator,
  handler: async (ctx, args) => {
    const { plan, stop } = await ownedStop(ctx, args.stopId, ctx.userId);
    const day = checkedDay(plan, args.day);
    const before = await positionOf(ctx, stop);
    await placeStop(ctx, plan, stop._id, day, args.index);
    await recount(ctx, plan);
    return before;
  },
});

/** Takes a stop off its day into Unplanned (at the top, where the person sees it land); never deletes it. */
export const removeTripStop = authedMutation({
  args: { stopId: v.id("tripStops") },
  returns: tripStopPlaceValidator,
  handler: async (ctx, args) => {
    const { plan, stop } = await ownedStop(ctx, args.stopId, ctx.userId);
    const before = await positionOf(ctx, stop);
    if (stop.day !== UNPLANNED_DAY) {
      await placeStop(ctx, plan, stop._id, UNPLANNED_DAY, 0);
      await recount(ctx, plan);
    }
    return before;
  },
});

type NewStop = Omit<
  Doc<"tripStops">,
  "_id" | "_creationTime" | "tripId" | "userId" | "day" | "order"
>;

function addedStop(place: TripPlace): NewStop {
  return { source: "added", ...tidyPlace(place) };
}

function savedStopFromPin(
  item: Doc<"items">,
  pin: NonNullable<Doc<"items">["placePins"]>[number],
): NewStop {
  const why = tidyText(item.title, MAX_PLACE_NAME_CHARS);
  return {
    source: "save",
    itemId: item._id,
    name: pin.name,
    lat: pin.lat,
    lng: pin.lng,
    ...(pin.appleId !== undefined ? { appleId: pin.appleId } : {}),
    ...(pin.category !== undefined ? { category: pin.category } : {}),
    ...(why !== undefined ? { why } : {}),
  };
}

async function savedStop(
  ctx: MutationCtx,
  plan: Doc<"tripPlans">,
  itemId: Id<"items">,
  name: string,
): Promise<NewStop> {
  const item = await ctx.db.get(itemId);
  if (item === null || item.userId !== plan.userId || item.status !== "ready") {
    throw new Error("Save not found");
  }
  // Only a pin the save already has in the trip's city, so a stop never lands somewhere made up.
  const centre = tripCentre(plan, await stopsOf(ctx, plan._id));
  const pin = tripPins(await visibleSave(ctx, item), plan, centre).find(
    (candidate) => candidate.name === name,
  );
  if (pin === undefined) throw new Error("Place not found");
  return savedStopFromPin(item, pin);
}

export const fillBlankTripDay = authedMutation({
  args: { tripId: v.id("tripPlans"), day: v.number() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const plan = await editablePlan(ctx, args.tripId, ctx.userId);
    const day = checkedDay(plan, args.day);
    if (!plan.countries?.length || day === UNPLANNED_DAY) return 0;
    const stops = await stopsOf(ctx, plan._id);
    if (stops.some((stop) => stop.day === day)) return 0;
    const limit = Math.min(
      MAX_TRIP_STOPS - stops.length,
      STOPS_PER_DAY[plan.pace],
    );
    const picks: NewStop[] = [];
    const centre = tripCentre(plan, stops);
    for (const item of await tripSaves(ctx, plan, ctx.userId, centre)) {
      for (const pin of tripPins(item, plan, centre)) {
        if (picks.length >= limit) break;
        const place = savedStopFromPin(item, pin);
        if (
          stops.some((stop) => sameTripPlace(stop, place)) ||
          picks.some((stop) => sameTripPlace(stop, place))
        )
          continue;
        picks.push(place);
      }
      if (picks.length >= limit) break;
    }
    for (const [order, place] of picks.entries())
      await ctx.db.insert("tripStops", {
        ...place,
        tripId: plan._id,
        userId: ctx.userId,
        day,
        order,
      });
    if (picks.length > 0) await recount(ctx, plan);
    return picks.length;
  },
});

export const applyTripDaySuggestions = authedMutation({
  args: {
    tripId: v.id("tripPlans"),
    day: v.number(),
    places: v.array(v.object({ itemId: v.id("items"), name: v.string() })),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const plan = await editablePlan(ctx, args.tripId, ctx.userId);
    await requireProEntitlement(ctx, ctx.userId);
    const day = checkedDay(plan, args.day);
    if (
      day === UNPLANNED_DAY ||
      args.places.length === 0 ||
      args.places.length > STOPS_PER_DAY[plan.pace]
    )
      return false;
    const stops = await stopsOf(ctx, plan._id);
    if (
      stops.some((stop) => stop.day === day) ||
      stops.length + args.places.length > MAX_TRIP_STOPS
    )
      return false;
    const picks: NewStop[] = [];
    for (const { itemId, name } of args.places) {
      const place = await savedStop(ctx, plan, itemId, name);
      if (
        stops.some((stop) => sameTripPlace(stop, place)) ||
        picks.some((stop) => sameTripPlace(stop, place))
      )
        return false;
      picks.push(place);
    }
    for (const [order, place] of picks.entries()) {
      await ctx.db.insert("tripStops", {
        ...place,
        tripId: plan._id,
        userId: ctx.userId,
        day,
        order,
      });
    }
    await recount(ctx, plan);
    return true;
  },
});

/**
 * Adds a place to `day` at `index` (the end when left out): a search result from
 * `searchTripPlaces`, or one of the city's saved places. A place already on the trip moves
 * there instead of appearing twice.
 */
export const addTripStop = authedMutation({
  args: {
    tripId: v.id("tripPlans"),
    day: v.number(),
    index: v.optional(v.number()),
    place: v.union(
      v.object({ kind: v.literal("search"), place: tripPlaceValidator }),
      v.object({
        kind: v.literal("save"),
        itemId: v.id("items"),
        name: v.string(),
      }),
    ),
  },
  returns: v.id("tripStops"),
  handler: async (ctx, args) => {
    const plan = await editablePlan(ctx, args.tripId, ctx.userId);
    const day = checkedDay(plan, args.day);
    const next =
      args.place.kind === "search"
        ? addedStop(args.place.place)
        : await savedStop(ctx, plan, args.place.itemId, args.place.name);
    const stops = await stopsOf(ctx, plan._id);
    const existing = stops.find((stop) => sameTripPlace(stop, next));
    let stopId: Id<"tripStops">;
    if (existing !== undefined) {
      stopId = existing._id;
    } else {
      if (stops.length >= MAX_TRIP_STOPS) throw new Error("Trip is full");
      stopId = await ctx.db.insert("tripStops", {
        ...next,
        tripId: plan._id,
        userId: ctx.userId,
        day,
        order: 0,
      });
    }
    await placeStop(
      ctx,
      plan,
      stopId,
      day,
      args.index ?? Number.POSITIVE_INFINITY,
    );
    await recount(ctx, plan);
    return stopId;
  },
});

/** Names the trip; an empty name goes back to "<city> trip". */
export const updateTripStopDetails = authedMutation({
  args: {
    stopId: v.id("tripStops"),
    time: v.union(v.string(), v.null()),
    note: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { stopId, time, note }) => {
    await ownedStop(ctx, stopId, ctx.userId);
    if (time !== null && !TRIP_STOP_TIME.test(time)) {
      throw new Error("Invalid stop time");
    }
    if (note !== null && note.length > MAX_TRIP_STOP_NOTE_CHARS) {
      throw new Error("Stop note is too long");
    }
    await ctx.db.patch(stopId, {
      time: time ?? undefined,
      note: note?.trim() || undefined,
    });
    return null;
  },
});

export const renameTripPlan = authedMutation({
  args: { tripId: v.id("tripPlans"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const plan = await editablePlan(ctx, args.tripId, ctx.userId);
    await ctx.db.patch(plan._id, {
      name: tidyText(args.name, MAX_TRIP_NAME_CHARS),
    });
    return null;
  },
});

/** The trip city's saved places that are not on the trip, for Add a place's "From your saves". */
export const tripSavePlaces = authedQuery({
  args: { tripId: v.id("tripPlans") },
  returns: v.array(tripSavePlaceValidator),
  handler: async (ctx, args) => {
    const plan = await ownedPlan(ctx, args.tripId, ctx.userId);
    if (plan === null) return [];
    const stops = await stopsOf(ctx, plan._id);
    const listed: TripPlaceRef[] = [];
    const keys = new Set<string>();
    const centre = tripCentre(plan, stops);
    const saves = await tripSaves(ctx, plan, ctx.userId, centre);
    const places: TripSavePlace[] = [];
    for (const item of saves) {
      for (const pin of tripPins(item, plan, centre)) {
        if (places.length >= MAX_SAVE_PLACES) return places;
        const key = `${item._id}|${placeKey(pin.name)}`;
        const place = { ...pin, itemId: item._id };
        if (
          keys.has(key) ||
          stops.some((stop) => sameTripPlace(stop, place)) ||
          listed.some((other) => sameTripPlace(other, place))
        )
          continue;
        listed.push(place);
        keys.add(key);
        places.push({
          itemId: item._id,
          name: pin.name,
          location: {
            lat: pin.lat,
            lng: pin.lng,
            ...(pin.appleId !== undefined ? { appleId: pin.appleId } : {}),
          },
          ...(item.title !== undefined ? { title: item.title } : {}),
          ...(pin.category !== undefined ? { category: pin.category } : {}),
        });
      }
    }
    return places;
  },
});

/** Checks the caller may search for a trip, spends one search, and says where to search near. */
export const claimTripSearchInternal = internalMutation({
  args: { tripId: v.id("tripPlans") },
  returns: v.object({
    city: v.string(),
    countries: v.optional(v.array(v.string())),
    centre: v.union(v.null(), v.object({ lat: v.number(), lng: v.number() })),
    aiAllowed: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const plan = await ownedPlan(ctx, args.tripId, userId);
    if (plan === null) throw new Error("Trip not found");
    await requirePlanAccess(ctx, plan, userId);
    await rateLimiter.limit(ctx, "tripPlaceSearch", {
      key: userId,
      throws: true,
    });
    return {
      city: plan.city,
      ...(plan.countries !== undefined ? { countries: plan.countries } : {}),
      centre:
        plan.listId !== undefined
          ? null
          : tripCentre(plan, await stopsOf(ctx, plan._id)),
      aiAllowed: await aiAllowed(ctx, userId),
    };
  },
});

export const claimCitySearchInternal = internalMutation({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    if (!(await aiAllowed(ctx, userId))) return false;
    const result = await rateLimiter.limit(ctx, "tripCitySearch", {
      key: userId,
    });
    return result.ok;
  },
});
