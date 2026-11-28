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

type Scheme = TripCountdownWidgetProps["scheme"];

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

function emptyProps(scheme: Scheme): TripCountdownWidgetProps {
  return {
    scheme,
    emptyTitle: t("tripWidget.emptyTitle"),
    emptyBody: t("tripWidget.emptyBody"),
  };
}

function tripProps(
  trip: CountdownTrip,
  text: string,
  scheme: Scheme,
  imageUri: string | undefined,
): TripCountdownWidgetProps {
  return {
    ...emptyProps(scheme),
    tripId: trip._id,
    label: tripName(trip),
    headline: text,
    detail: tripDateRange(trip.startDate, trip.dayCount) ?? undefined,
    footnote: tripStopsLine(trip),
    ...(imageUri ? { imageUri } : {}),
  };
}

type Step = {
  date: Date;
  trip: CountdownTrip | null;
  phase: CountdownPhase;
  last: boolean;
};

function timelineSteps(trips: readonly CountdownTrip[], now: Date): Step[] {
  const steps: Step[] = [];
  for (let day = 0; day <= TIMELINE_DAYS + MAX_TRIP_DAYS; day++) {
    const date = day === 0 ? now : midnight(now, day);
    const trip = nextTrip(trips, date);
    if (trip === null) {
      steps.push({ date, trip, phase: { kind: "over" }, last: true });
      return steps;
    }
    const phase = countdownPhase(trip, date);
    const last = day >= TIMELINE_DAYS && phase.kind !== "during";
    steps.push({ date, trip, phase, last });
    if (last) return steps;
  }
  return steps;
}

export function timelineTrips(
  trips: readonly CountdownTrip[],
  now: Date,
): CountdownTrip[] {
  const seen = new Map<string, CountdownTrip>();
  for (const step of timelineSteps(trips, now)) {
    if (step.trip !== null) seen.set(step.trip._id, step.trip);
  }
  return [...seen.values()];
}

export function countdownTimeline(
  trips: readonly CountdownTrip[],
  now: Date,
  scheme: Scheme,
  imageFor: (trip: CountdownTrip) => string | undefined = () => undefined,
): CountdownEntry[] {
  return timelineSteps(trips, now).map(({ date, trip, phase, last }) => {
    if (trip === null) return { date, props: emptyProps(scheme) };
    const text =
      last && phase.kind !== "during"
        ? t("tripWidget.onDate", {
            date: tripDateRange(trip.startDate, 1) ?? "",
          })
        : headline(trip, phase);
    return { date, props: tripProps(trip, text, scheme, imageFor(trip)) };
  });
}
