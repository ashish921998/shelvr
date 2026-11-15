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
  /** "@handle". */
  creator: string;
  videoCode: string;
  firstSaveUrl: string;
  /** Only the names: a real creator gets no words they did not say. */
  spots: { name: string }[];
};

const REEL_TRIPS = new Map<string, SampleTrip>();

/** The real reel's places on its city's map, in the order it names them. */
function reelTrip(
  kind: PlanKind,
  city: SampleCityId,
  reel: AhaReel,
): SampleTrip {
  const key = `${kind}:${city}`;
  let trip = REEL_TRIPS.get(key);
  if (trip === undefined) {
    trip = stopsTrip(
      kind,
      city,
      samplePlan(kind, city).days[0].title,
      reel.places
        .slice(0, AHA_SPOTS)
        .map(([slot, name, lat, lng]) => ({ name, slot, at: { lat, lng } })),
    );
    REEL_TRIPS.set(key, trip);
  }
  return trip;
}

/** Always demonstrate the picked city's reel, or Austin's when no city was picked. */
export function ahaSample(
  kind: PlanKind,
  picked: SampleCityId | null,
): AhaSample {
  const city = picked ?? FALLBACK_REEL_CITY;
  const reel = ahaReel(city);
  const trip = reelTrip(kind, city, reel);
  return {
    kind,
    city,
    trip,
    creator: `@${reel.handle}`,
    videoCode: reel.code,
    firstSaveUrl: ahaReelUrl(reel),
    spots: trip.days[0].stops.map((stop) => ({ name: stop.name })),
  };
}
