import { ahaReel, ahaReelUrl, type AhaReel } from "@/lib/aha-reels";
import type { SampleCityId } from "@/lib/sample-cities";
import type { PlanKind } from "@/lib/sample-plans";
import { samplePlan, stopsTrip, type SampleTrip } from "@/lib/sample-trip";

/** How many spots the sample reel names. */
export const AHA_SPOTS = 3;

const FALLBACK_REEL_CITY: SampleCityId = "austin";

/** What the onboarding reel shows, decided here so the screens only render it. */
export type AhaSample = {
  kind: PlanKind;
  city: SampleCityId;
  /** The spots as one day on the city's map. */
  trip: SampleTrip;
  /** A real public reel, credited to its creator and queued as the first save once the account has Pro. */
  source: "reel";
  /** "@handle". */
  creator: string;
  videoCode: string;
  firstSaveUrl: string;
  /** Only the names: a real creator gets no words they did not say. */
  spots: { name: string }[];
};

const REEL_TRIPS = new Map<AhaReel, SampleTrip>();

/** The real reel's first places on the city's map, in its video's order. */
function reelTrip(plan: SampleTrip, reel: AhaReel): SampleTrip {
  let trip = REEL_TRIPS.get(reel);
  if (trip === undefined) {
    trip = stopsTrip(
      plan.kind,
      plan.city,
      plan.days[0].title,
      reel.places
        .slice(0, AHA_SPOTS)
        .map(([slot, name, lat, lng]) => ({ name, slot, at: { lat, lng } })),
    );
    REEL_TRIPS.set(reel, trip);
  }
  return trip;
}

/** Always demonstrate a saveable reel; cities without one use the Austin reel for the same goal. */
export function ahaSample(
  kind: PlanKind,
  city: SampleCityId | null,
): AhaSample {
  const selected = samplePlan(kind, city);
  const plan = ahaReel(kind, selected.city)
    ? selected
    : samplePlan(kind, FALLBACK_REEL_CITY);
  const reel = ahaReel(kind, plan.city);
  if (reel === null) throw new Error("Missing onboarding fallback reel");
  const trip = reelTrip(plan, reel);
  return {
    kind,
    city: plan.city,
    trip,
    source: "reel",
    creator: `@${reel.handle}`,
    videoCode: reel.code,
    firstSaveUrl: ahaReelUrl(reel),
    spots: trip.days[0].stops.map((stop) => ({ name: stop.name })),
  };
}
