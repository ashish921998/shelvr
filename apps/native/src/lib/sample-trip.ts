import type { Interest } from "@/lib/onboarding-interests";
import type { SaveKind } from "@/lib/save-kinds";
import type { TextMessageKey } from "@/locales/message-types";

export function showTripTeaser(
  kinds: readonly SaveKind[],
  interests: readonly Interest[],
): boolean {
  return kinds.includes("Travel") || interests.includes("Travel");
}

type SampleSlot = "morning" | "afternoon" | "evening";

export const SAMPLE_SLOT_LABELS: Record<SampleSlot, TextMessageKey> = {
  morning: "trip.slotMorning",
  afternoon: "trip.slotAfternoon",
  evening: "trip.slotEvening",
};

export const SAMPLE_MAP = { width: 340, height: 168 } as const;

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
  source: { host: string } | { label: TextMessageKey };
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
  day: number;
  number: number;
};

export function sampleStops(): NumberedStop[] {
  return SAMPLE_TRIP.days
    .flatMap((day, dayIndex) =>
      day.stops.map((stop) => ({ stop, day: dayIndex })),
    )
    .map((entry, index) => ({ ...entry, number: index + 1 }));
}

export type SampleRow =
  | { kind: "day"; day: number }
  | { kind: "stop"; entry: NumberedStop };

export function sampleRows(): SampleRow[] {
  const stops = sampleStops();
  return SAMPLE_TRIP.days.flatMap((_, day) => [
    { kind: "day" as const, day },
    ...stops
      .filter((entry) => entry.day === day)
      .map((entry) => ({ kind: "stop" as const, entry })),
  ]);
}
