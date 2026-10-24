import { ahaReel, type AhaReel } from "@/lib/aha-reels";
import {
  SAMPLE_CITIES,
  type SampleCityId,
  type SampleSlot,
} from "@/lib/sample-cities";
import type { PlanKind } from "@/lib/sample-plans";
import {
  buildTrip,
  samplePlan,
  type SampleStop,
  type SampleTrip,
} from "@/lib/sample-trip";

/** How many spots the sample reel names. */
export const AHA_SPOTS = 3;

/** A rough clock for each kind of stop, in minutes after midnight, to put the spots in the order of an evening or a day. */
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

type AhaSpot = {
  stop: SampleStop;
  number: number;
};

export type AhaSample = {
  kind: PlanKind;
  city: SampleCityId;
  /** The plan cut to the reel's spots, for the map. */
  trip: SampleTrip;
  spots: AhaSpot[];
  /** The real reel this city and plan play, or null where only the photo shows. */
  reel: AhaReel | null;
  /** The reel's creator, or a made-up account when there is no reel, so the photo never stands in for a real creator. */
  handle: string;
};

const REEL_PLANS = new Map<AhaReel, SampleTrip>();

/** The reel's places laid out on the city's map, as the sample plan's first day. */
function reelPlan(plan: SampleTrip, reel: AhaReel): SampleTrip {
  const cached = REEL_PLANS.get(reel);
  if (cached !== undefined) return cached;
  const city = SAMPLE_CITIES[plan.city];
  const trip = buildTrip(plan.kind, plan.city, {
    ...city,
    saves: plan.saves,
    days: [
      {
        title: plan.days[0].title,
        stops: reel.places.map(([slot, name, lat, lng]) => ({
          name,
          slot,
          at: { lat, lng },
        })),
      },
    ],
  });
  REEL_PLANS.set(reel, trip);
  return trip;
}

/** The one reel onboarding shows: its first three spots (the real reel's where there is one, else the sample plan's) as one day: the sample's by the clock, the reel's in its video's order. */
export function ahaSample(
  kind: PlanKind,
  city: SampleCityId | null,
): AhaSample {
  const sample = samplePlan(kind, city);
  const reel = ahaReel(kind, sample.city);
  const plan = reel === null ? sample : reelPlan(sample, reel);
  const [first] = plan.days;
  const firstStops = plan.days.flatMap((day) => day.stops).slice(0, AHA_SPOTS);
  // A real reel's spots keep the order its video shows them; the sample's go by the clock.
  const stops =
    reel === null
      ? firstStops.sort((a, b) => SLOT_TIMES[a.slot] - SLOT_TIMES[b.slot])
      : firstStops;
  const spots = stops.map((stop, index) => ({ stop, number: index + 1 }));
  return {
    kind,
    city: plan.city,
    trip: { ...plan, days: [{ ...first, stops }] },
    spots,
    reel,
    handle:
      reel === null
        ? `@${plan.city.replace(/-/g, "")}.${kind === "trip" ? "trips" : "eats"}`
        : `@${reel.handle}`,
  };
}
