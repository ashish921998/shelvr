import { t } from "@/lib/i18n";
import { MAX_TRIP_DAYS, tripDayDate } from "@/lib/trip";
import { tripDateRange, tripName, tripStopsLine } from "@/lib/trip-planner";
import type { TripCountdownWidgetProps } from "@/widgets/trip-countdown-widget";
import type { TripPlanSummary } from "@convex/model/tripPlan";

export type CountdownTrip = Pick<
  TripPlanSummary,
  | "_id"
  | "name"
  | "city"
  | "startDate"
  | "dayCount"
  | "stopCount"
  | "savedCount"
  | "createdAt"
>;

export type CountdownPhase =
  | { kind: "countdown"; days: number }
  | { kind: "tomorrow" }
  | { kind: "during"; day: number }
  | { kind: "over" };

export type CountdownEntry = { date: Date; props: TripCountdownWidgetProps };

type Shared = Pick<TripCountdownWidgetProps, "scheme" | "imageUri">;

export const TIMELINE_DAYS = 60;

const DAY_MS = 86_400_000;

function midnight(date: Date, plusDays = 0): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + plusDays,
  );
}

export function daysBetween(from: Date, to: Date): number {
  const utc = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((utc(to) - utc(from)) / DAY_MS);
}

export function countdownPhase(trip: CountdownTrip, on: Date): CountdownPhase {
  const start = tripDayDate(trip.startDate, 0);
  if (start === null) return { kind: "over" };
  const until = daysBetween(on, start);
  if (until > 1) return { kind: "countdown", days: until };
  if (until === 1) return { kind: "tomorrow" };
  const day = 1 - until;
  return day <= trip.dayCount ? { kind: "during", day } : { kind: "over" };
}

export function nextTrip(
  trips: readonly CountdownTrip[],
  today: Date,
): CountdownTrip | null {
  const upcoming = trips.flatMap((trip) => {
    const start = tripDayDate(trip.startDate, 0);
    if (start === null || countdownPhase(trip, today).kind === "over") {
      return [];
    }
    return [{ trip, start: start.getTime() }];
  });
  upcoming.sort(
    (a, b) => a.start - b.start || b.trip.createdAt - a.trip.createdAt,
  );
  return upcoming[0]?.trip ?? null;
}

function headline(trip: CountdownTrip, phase: CountdownPhase): string {
  switch (phase.kind) {
    case "countdown":
      return t("tripWidget.daysToGo", { count: phase.days });
    case "tomorrow":
      return t("tripWidget.tomorrow");
    case "during":
      return trip.dayCount <= 1
        ? t("tripWidget.today")
        : t("tripWidget.dayOf", {
            day: String(phase.day),
            days: String(trip.dayCount),
          });
    case "over":
      return "";
  }
}

export function emptyCountdownProps(shared: Shared): TripCountdownWidgetProps {
  return {
    scheme: shared.scheme,
    emptyTitle: t("tripWidget.emptyTitle"),
    emptyBody: t("tripWidget.emptyBody"),
  };
}

function tripProps(
  trip: CountdownTrip,
  text: string,
  shared: Shared,
): TripCountdownWidgetProps {
  return {
    ...emptyCountdownProps(shared),
    tripId: trip._id,
    label: tripName(trip),
    headline: text,
    detail: tripDateRange(trip.startDate, trip.dayCount) ?? undefined,
    footnote: tripStopsLine(trip),
    ...(shared.imageUri ? { imageUri: shared.imageUri } : {}),
  };
}

export function countdownTimeline(
  trip: CountdownTrip | null,
  now: Date,
  shared: Shared,
): CountdownEntry[] {
  if (trip === null) return [{ date: now, props: emptyCountdownProps(shared) }];
  const startsOn = tripDateRange(trip.startDate, 1) ?? "";
  const entries: CountdownEntry[] = [];
  for (let day = 0; day <= TIMELINE_DAYS + MAX_TRIP_DAYS; day++) {
    const date = day === 0 ? now : midnight(now, day);
    const phase = countdownPhase(trip, date);
    if (phase.kind === "over") {
      entries.push({ date, props: emptyCountdownProps(shared) });
      return entries;
    }
    if (day >= TIMELINE_DAYS && phase.kind !== "during") {
      const text = t("tripWidget.onDate", { date: startsOn });
      entries.push({ date, props: tripProps(trip, text, shared) });
      return entries;
    }
    entries.push({
      date,
      props: tripProps(trip, headline(trip, phase), shared),
    });
  }
  return entries;
}
