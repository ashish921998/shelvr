import { ahaReel, ahaReelUrl, type AhaReel } from "@/lib/aha-reels";
import type { SampleCityId, SampleSlot } from "@/lib/sample-cities";
import type { PlanKind } from "@/lib/sample-plans";
import { samplePlan, stopsTrip, type SampleTrip } from "@/lib/sample-trip";
import type { TextMessageKey } from "@/locales/message-types";

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

const SLOT_QUOTES: Record<SampleSlot, TextMessageKey> = {
  coffee: "aha.quoteCoffee",
  morning: "aha.quoteMorning",
  brunch: "aha.quoteBrunch",
  lunch: "aha.quoteLunch",
  afternoon: "aha.quoteAfternoon",
  dinner: "aha.quoteDinner",
  drinks: "aha.quoteDrinks",
  dessert: "aha.quoteDessert",
  walk: "aha.quoteWalk",
};

type CaptionKey = "aha.captionDate" | "aha.captionTrip" | "aha.captionWeekend";

const CAPTIONS: Record<PlanKind, CaptionKey> = {
  date: "aha.captionDate",
  trip: "aha.captionTrip",
  weekend: "aha.captionWeekend",
};

/** What the onboarding reel shows, decided here so the screens only render it. */
export type AhaSample = {
  kind: PlanKind;
  city: SampleCityId;
  /** The spots as one day on the city's map. */
  trip: SampleTrip;
} & (
  | {
      /** A real public reel, credited to its creator and queued as the first save once the account has Pro. */
      source: "reel";
      /** "@handle". */
      creator: string;
      videoCode: string;
      firstSaveUrl: string;
      /** Only the names: a real creator gets no words they did not say. */
      spots: { name: string }[];
    }
  | {
      /** Shelvr's own example over the city photo, credited to no one. */
      source: "example";
      /** Our caption, which takes the city's name. */
      caption: CaptionKey;
      spots: { name: string; quote: TextMessageKey }[];
    }
);

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

/** The sample plan's first three stops by the clock, as one day. */
function exampleTrip(plan: SampleTrip): SampleTrip {
  const stops = plan.days
    .flatMap((day) => day.stops)
    .slice(0, AHA_SPOTS)
    .sort((a, b) => SLOT_TIMES[a.slot] - SLOT_TIMES[b.slot]);
  return { ...plan, days: [{ ...plan.days[0], stops }] };
}

/** The one reel onboarding shows: the real reel where this city and plan have one, else Shelvr's own example. */
export function ahaSample(
  kind: PlanKind,
  city: SampleCityId | null,
): AhaSample {
  const plan = samplePlan(kind, city);
  const reel = ahaReel(kind, plan.city);
  if (reel === null) {
    const trip = exampleTrip(plan);
    return {
      kind,
      city: plan.city,
      trip,
      source: "example",
      caption: CAPTIONS[kind],
      spots: trip.days[0].stops.map((stop) => ({
        name: stop.name,
        quote: SLOT_QUOTES[stop.slot],
      })),
    };
  }
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
