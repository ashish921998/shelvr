import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { localHourOnDayAt } from "./notificationSchedule";
import { MAX_LATE_MS } from "./saveReminders";

export const TRIP_EVE_HOUR = 18;
export const TRIP_EVE_MAX_AGE_MS = 3 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_LEAD_MS = 6 * 60 * 60 * 1000;
const MAX_TRIP_STOPS = 300;

type DatedTrip = Pick<Doc<"tripPlans">, "startDate" | "_creationTime">;

export function tripEveAt(
  startDate: string,
  timezone: string | undefined,
): number {
  return localHourOnDayAt(startDate, -1, TRIP_EVE_HOUR, timezone);
}

export function tripEveDue(
  trip: DatedTrip,
  timezone: string | undefined,
  now: number,
): boolean {
  if (trip.startDate === undefined) return false;
  const eveAt = tripEveAt(trip.startDate, timezone);
  return (
    eveAt <= now &&
    now < eveAt + MAX_LATE_MS &&
    trip._creationTime < eveAt - MIN_LEAD_MS
  );
}

export function nextTripEveAt(
  trips: readonly DatedTrip[],
  timezone: string | undefined,
  now: number,
): number | undefined {
  const upcoming = trips.flatMap((trip) => {
    if (trip.startDate === undefined) return [];
    const eveAt = tripEveAt(trip.startDate, timezone);
    return trip._creationTime < eveAt - MIN_LEAD_MS && now < eveAt + MAX_LATE_MS
      ? [eveAt]
      : [];
  });
  return upcoming.length === 0 ? undefined : Math.min(...upcoming);
}

export function tripEveDateRange(now: number): { from: string; to: string } {
  const day = (offset: number) =>
    new Date(now + offset * DAY_MS).toISOString().slice(0, 10);
  return { from: day(-1), to: day(2) };
}

export function savedStopCount(
  stops: readonly Pick<Doc<"tripStops">, "day" | "source">[],
): number {
  return stops.filter(
    (stop) =>
      stop.day >= 1 && (stop.source === "save" || stop.source === "list"),
  ).length;
}

export async function tripSavedStopCount(
  ctx: QueryCtx,
  tripId: Id<"tripPlans">,
): Promise<number> {
  return savedStopCount(
    await ctx.db
      .query("tripStops")
      .withIndex("by_trip_and_day", (q) => q.eq("tripId", tripId).gte("day", 1))
      .take(MAX_TRIP_STOPS),
  );
}
