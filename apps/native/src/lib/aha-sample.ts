import { distanceKm } from "@convex/model/trip";
import type { SampleCityId, SampleSlot } from "@/lib/sample-cities";
import type { PlanKind } from "@/lib/sample-plans";
import {
  samplePlan,
  type SampleStop,
  type SampleTrip,
} from "@/lib/sample-trip";

/** How many spots the sample reel names. */
export const AHA_SPOTS = 3;

/** A rough clock for each kind of stop, in minutes after midnight. */
const SLOT_TIMES: Record<SampleSlot, number> = {
  coffee: 9 * 60,
  morning: 10 * 60,
  brunch: 11 * 60,
  lunch: 13 * 60,
  afternoon: 15 * 60 + 30,
  dinner: 19 * 60 + 30,
  drinks: 21 * 60 + 30,
  dessert: 22 * 60 + 15,
  walk: 23 * 60,
};

/** About 4.8 km an hour, with the detours a city adds. */
const WALK_METERS_PER_MINUTE = 70;

export type AhaSpot = {
  stop: SampleStop;
  number: number;
  /** Minutes after midnight. */
  time: number;
  /** Walking minutes from the spot before; null for the first. */
  walk: number | null;
};

export type AhaSample = {
  kind: PlanKind;
  city: SampleCityId;
  /** The plan cut to the reel's spots, for the map. */
  trip: SampleTrip;
  spots: AhaSpot[];
  /** A made-up account, so the reel never stands in for a real creator. */
  handle: string;
};

export function walkMinutes(
  from: SampleStop["at"],
  to: SampleStop["at"],
): number {
  return Math.max(
    1,
    Math.round((distanceKm(from, to) * 1000) / WALK_METERS_PER_MINUTE),
  );
}

/** The one reel onboarding shows: the sample plan's first three spots as one day, by the clock, with walks between. */
export function ahaSample(
  kind: PlanKind,
  city: SampleCityId | null,
): AhaSample {
  const plan = samplePlan(kind, city);
  const [first] = plan.days;
  const stops = plan.days
    .flatMap((day) => day.stops)
    .slice(0, AHA_SPOTS)
    .sort((a, b) => SLOT_TIMES[a.slot] - SLOT_TIMES[b.slot]);
  const spots = stops.map((stop, index) => ({
    stop,
    number: index + 1,
    time: SLOT_TIMES[stop.slot],
    walk: index === 0 ? null : walkMinutes(stops[index - 1].at, stop.at),
  }));
  return {
    kind,
    city: plan.city,
    trip: { ...plan, days: [{ ...first, stops }] },
    spots,
    handle: `@${plan.city.replace(/-/g, "")}.${kind === "trip" ? "trips" : "eats"}`,
  };
}
