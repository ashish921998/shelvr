import type { Interest } from "@/lib/onboarding-interests";
import type { SaveKind } from "@/lib/save-kinds";
import type { TextMessageKey } from "@/locales/message-types";

// The sample trip onboarding builds before the paywall, for people who said
// they save travel. It is the same on every run and is never made by the
// model: it shows what a trip looks like, and the label on every screen says
// it is a sample. Place names are the places' own and stay untranslated.

/** Whether onboarding shows the sample trip: travel was picked as a kind of
 * save or as a topic. Everyone else goes from the promise to the paywall. */
export function showTripTeaser(
  kinds: readonly SaveKind[],
  interests: readonly Interest[],
): boolean {
  return kinds.includes("Travel") || interests.includes("Travel");
}

type SampleSlot = "morning" | "afternoon" | "evening";

/** The trip screen's slot labels, so the sample reads like the real trip. */
export const SAMPLE_SLOT_LABELS: Record<SampleSlot, TextMessageKey> = {
  morning: "trip.slotMorning",
  afternoon: "trip.slotAfternoon",
  evening: "trip.slotEvening",
};

/** The drawing the sample map is made on, in points before it scales to the
 * card. Each stop's pin sits on it. */
export const SAMPLE_MAP = { width: 340, height: 168 } as const;

/** The band of the drawing a card shows, from `top`. The locked card shows
 * less of it than the open one, and every pin lies inside both. */
export type SampleCrop = { top: number; height: number };
export const SAMPLE_CROPS = {
  locked: { top: 28, height: 120 },
  reveal: { top: 10, height: 150 },
} as const satisfies Record<string, SampleCrop>;

export type SampleStop = {
  name: string;
  slot: SampleSlot;
  pin: { x: number; y: number };
};

type SampleDay = {
  title: TextMessageKey;
  stops: readonly SampleStop[];
};

type SampleSave = {
  name: string;
  /** The page's own host, or a label that says what kind of save it is. */
  source: { host: string } | { label: TextMessageKey };
  /** How many of the trip's places this save names. */
  places: number;
  picture: "oldTown" | "rooftops" | "place";
};

export const SAMPLE_TRIP = {
  saves: [
    {
      name: "Old Town Square",
      source: { host: "prague.eu" },
      places: 1,
      picture: "oldTown",
    },
    {
      name: "Three days in Prague",
      source: { label: "tripTeaser.sourceArticle" },
      places: 3,
      picture: "rooftops",
    },
    {
      name: "Café Louvre",
      source: { label: "tripTeaser.sourcePlace" },
      places: 1,
      picture: "place",
    },
  ],
  days: [
    {
      title: "tripTeaser.dayOneTitle",
      stops: [
        {
          name: "Old Town Square",
          slot: "morning",
          pin: { x: 250, y: 76 },
        },
        { name: "Café Louvre", slot: "afternoon", pin: { x: 232, y: 124 } },
        { name: "Charles Bridge", slot: "evening", pin: { x: 188, y: 92 } },
      ],
    },
    {
      title: "tripTeaser.dayTwoTitle",
      stops: [
        { name: "Prague Castle", slot: "morning", pin: { x: 118, y: 56 } },
        {
          name: "Petřín Lookout Tower",
          slot: "afternoon",
          pin: { x: 96, y: 122 },
        },
      ],
    },
  ],
} as const satisfies {
  saves: readonly SampleSave[];
  days: readonly SampleDay[];
};

export type NumberedStop = {
  stop: SampleStop;
  /** Index of the day the stop belongs to. */
  day: number;
  /** The stop's number on the map, counted across the whole trip. */
  number: number;
};

/** Every stop in trip order, numbered as the map numbers its pins. */
export function sampleStops(): NumberedStop[] {
  return SAMPLE_TRIP.days
    .flatMap((day, dayIndex) =>
      day.stops.map((stop) => ({ stop, day: dayIndex })),
    )
    .map((entry, index) => ({ ...entry, number: index + 1 }));
}
