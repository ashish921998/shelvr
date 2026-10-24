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

type AhaSpot = {
  name: string;
  /** A line about the spot, only on Shelvr's own example: a real creator gets no words they did not say. */
  quote: TextMessageKey | null;
};

/** What the onboarding reel shows, decided here so the screens only render it. */
export type AhaSample = {
  kind: PlanKind;
  city: SampleCityId;
  /** The spots as one day on the city's map. */
  trip: SampleTrip;
  spots: AhaSpot[];
  /** The real reel's creator, as "@handle"; null on Shelvr's own example, which credits no one. */
  creator: string | null;
  /** The real reel to play over the photo, or null where only the photo shows. */
  videoCode: string | null;
  /** Our caption (takes the city's name), only on Shelvr's own example. */
  caption: CaptionKey | null;
  /** The real reel's link, queued as the first save once the account has Pro. */
  firstSaveUrl: string | null;
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
  const trip = reel === null ? exampleTrip(plan) : reelTrip(plan, reel);
  return {
    kind,
    city: plan.city,
    trip,
    spots: trip.days[0].stops.map((stop) => ({
      name: stop.name,
      quote: reel === null ? SLOT_QUOTES[stop.slot] : null,
    })),
    creator: reel === null ? null : `@${reel.handle}`,
    videoCode: reel?.code ?? null,
    caption: reel === null ? CAPTIONS[kind] : null,
    firstSaveUrl: reel === null ? null : ahaReelUrl(reel),
  };
}
