import type { Interest } from "@/lib/onboarding-interests";
import type { SaveKind } from "@/lib/save-kinds";
import {
  SAMPLE_CITIES,
  type LatLng,
  type SampleCity,
  type SampleCityId,
  type SampleSave,
  type SampleSlot,
} from "@/lib/sample-cities";
import type { TextMessageKey } from "@/locales/message-types";

// The sample trip onboarding builds before the paywall, for people who said
// they save travel. It is in the city they said they are going to next, the
// same on every run, and never made by the model: it shows what a trip looks
// like, and the label on every screen says it is a sample. Place names are
// the places' own and stay untranslated.

/** Whether onboarding shows the sample trip: travel was picked as a kind of
 * save or as a topic. Everyone else goes from the promise to the paywall. */
export function showTripTeaser(
  kinds: readonly SaveKind[],
  interests: readonly Interest[],
): boolean {
  return kinds.includes("Travel") || interests.includes("Travel");
}

/** The city a sample trip is in when nobody picked one ("Not sure yet",
 * travel picked only as a kind of save, or an older stored pick). */
export const DEFAULT_SAMPLE_CITY: SampleCityId = "prague";

/** The trip screen's slot labels, so the sample reads like the real trip. */
export const SAMPLE_SLOT_LABELS: Record<SampleSlot, TextMessageKey> = {
  morning: "trip.slotMorning",
  lunch: "trip.slotLunch",
  afternoon: "trip.slotAfternoon",
  dinner: "trip.slotDinner",
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

type Point = { x: number; y: number };

export type SampleStop = {
  name: string;
  slot: SampleSlot;
  pin: Point;
};

type SampleDay = {
  title: TextMessageKey;
  stops: readonly SampleStop[];
};

/** A city's sample trip, with every stop pinned on the drawing. */
export type SampleTrip = {
  city: SampleCityId;
  /** The city's name. */
  name: TextMessageKey;
  saves: readonly SampleSave[];
  days: readonly SampleDay[];
  /** The city's water as drawing paths, on the same scale as the pins. */
  water: readonly string[];
};

// Where pins may sit: a pin's centre stays this far inside both crops.
const PIN_BOX = { left: 26, right: 314, top: 50, bottom: 136 };
// Two pins closer than this would overlap, so they are pushed apart.
const PIN_GAP = 24;

/** Places the trip's real coordinates on the drawing: one scale for both
 * axes (a degree of longitude shrinks away from the equator), centred in the
 * pin box. */
function projection(points: readonly LatLng[]): (at: LatLng) => Point {
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  const [south, north] = [Math.min(...lats), Math.max(...lats)];
  const [west, east] = [Math.min(...lngs), Math.max(...lngs)];
  const shrink = Math.cos((((north + south) / 2) * Math.PI) / 180);
  const spanX = Math.max((east - west) * shrink, 1e-6);
  const spanY = Math.max(north - south, 1e-6);
  const boxWidth = PIN_BOX.right - PIN_BOX.left;
  const boxHeight = PIN_BOX.bottom - PIN_BOX.top;
  const scale = Math.min(boxWidth / spanX, boxHeight / spanY);
  const left = PIN_BOX.left + (boxWidth - spanX * scale) / 2;
  const top = PIN_BOX.top + (boxHeight - spanY * scale) / 2;
  return (at) => ({
    x: left + (at.lng - west) * shrink * scale,
    y: top + (north - at.lat) * scale,
  });
}

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/** Moves pins that would overlap apart until each has room, keeping them in
 * the pin box. Neighbours a street apart still read as two pins. */
function spreadPins(pins: Point[]): Point[] {
  const spread = pins.map((pin) => ({ ...pin }));
  for (let round = 0; round < 40; round += 1) {
    let moved = false;
    for (let a = 0; a < spread.length; a += 1) {
      for (let b = a + 1; b < spread.length; b += 1) {
        const dx = spread[b].x - spread[a].x;
        const dy = spread[b].y - spread[a].y;
        const distance = Math.hypot(dx, dy);
        if (distance >= PIN_GAP) continue;
        moved = true;
        // Pins on the same spot part along a fixed slant.
        const [ux, uy] =
          distance === 0 ? [0.8, 0.6] : [dx / distance, dy / distance];
        const push = (PIN_GAP - distance) / 2;
        spread[a].x -= ux * push;
        spread[a].y -= uy * push;
        spread[b].x += ux * push;
        spread[b].y += uy * push;
      }
    }
    for (const pin of spread) {
      pin.x = clamp(pin.x, PIN_BOX.left, PIN_BOX.right);
      pin.y = clamp(pin.y, PIN_BOX.top, PIN_BOX.bottom);
    }
    if (!moved) break;
  }
  return spread.map((pin) => ({
    x: Math.round(pin.x * 10) / 10,
    y: Math.round(pin.y * 10) / 10,
  }));
}

function buildTrip(id: SampleCityId): SampleTrip {
  const city: SampleCity = SAMPLE_CITIES[id];
  const stops = city.days.flatMap((day) => day.stops);
  const place = projection(stops.map((stop) => stop.at));
  const pins = spreadPins(stops.map((stop) => place(stop.at)));
  let next = 0;
  return {
    city: id,
    name: city.name,
    saves: city.saves,
    days: city.days.map((day) => ({
      title: day.title,
      stops: day.stops.map((stop) => {
        const pin = pins[next];
        next += 1;
        return { name: stop.name, slot: stop.slot, pin };
      }),
    })),
    water: city.water.map((line) =>
      line
        .map((at, index) => {
          const { x, y } = place(at);
          return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(" "),
    ),
  };
}

const TRIPS = new Map<SampleCityId, SampleTrip>();

/** Whether `value` names a city there is a sample trip for. */
export function isSampleCity(value: unknown): value is SampleCityId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(SAMPLE_CITIES, value)
  );
}

/** The sample trip in `city`, or in the default city when there is none. */
export function sampleTrip(city?: string | null): SampleTrip {
  const id = isSampleCity(city) ? city : DEFAULT_SAMPLE_CITY;
  let trip = TRIPS.get(id);
  if (trip === undefined) {
    trip = buildTrip(id);
    TRIPS.set(id, trip);
  }
  return trip;
}

export type NumberedStop = {
  stop: SampleStop;
  /** Index of the day the stop belongs to. */
  day: number;
  /** The stop's number on the map, counted across the whole trip. */
  number: number;
};

/** Every stop in trip order, numbered as the map numbers its pins. */
export function sampleStops(trip: SampleTrip): NumberedStop[] {
  return trip.days
    .flatMap((day, dayIndex) =>
      day.stops.map((stop) => ({ stop, day: dayIndex })),
    )
    .map((entry, index) => ({ ...entry, number: index + 1 }));
}

/** One line of the trip as the card lists it: a day's header or one stop. */
export type SampleRow =
  | { kind: "day"; day: number; title: TextMessageKey; places: number }
  | { kind: "stop"; entry: NumberedStop };

/** The trip's rows top to bottom: each day's header, then its stops. */
export function sampleRows(trip: SampleTrip): SampleRow[] {
  const stops = sampleStops(trip);
  return trip.days.flatMap(({ title, stops: places }, day) => [
    { kind: "day" as const, day, title, places: places.length },
    ...stops
      .filter((entry) => entry.day === day)
      .map((entry) => ({ kind: "stop" as const, entry })),
  ]);
}
