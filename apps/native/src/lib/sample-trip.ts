import {
  SAMPLE_CITIES,
  isSampleCity,
  type CityStop,
  type LatLng,
  type SampleCity,
  type SampleCityId,
  type SampleSave,
  type SampleSlot,
} from "@/lib/sample-cities";
import { planAsCity, planCity, type PlanKind } from "@/lib/sample-plans";
import type { TextMessageKey } from "@/locales/message-types";

export const DEFAULT_SAMPLE_CITY: SampleCityId = "prague";

export const SAMPLE_MAP = { width: 340, height: 168 } as const;

export type SampleCrop = { top: number; height: number };
export const SAMPLE_CROPS = {
  reveal: { top: 10, height: 150 },
} as const satisfies Record<string, SampleCrop>;

type Point = { x: number; y: number };

type SampleStop = {
  name: string;
  slot: SampleSlot;
  pin: Point;
  at: LatLng;
};

type SampleDay = {
  title: TextMessageKey;
  stops: readonly SampleStop[];
};

export type SampleTrip = {
  kind: PlanKind;
  city: SampleCityId;
  name: TextMessageKey;
  saves: readonly SampleSave[];
  days: readonly SampleDay[];
  water: readonly string[];
  waterWidth: number;
};

const PIN_BOX = { left: 26, right: 314, top: 50, bottom: 136 };
export const PIN_SIZE = 22;
const PIN_GAP = PIN_SIZE + 2;
const WATER_WIDTH = 16;
export const WATER_CLEARANCE = 8;
const CROSSING_REACH = 3;
const SPREAD_ROUNDS = 80;
const SAME_SPOT_SLANT = [0.8, 0.6] as const;

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

type Water = { lines: readonly (readonly Point[])[]; width: number };

type Nearest = { near: Point; distance: number; side: 1 | -1; normal: Point };

function nearestOnLine(pin: Point, line: readonly Point[]): Nearest {
  let best: Nearest = {
    near: line[0],
    distance: Infinity,
    side: 1,
    normal: { x: 0, y: -1 },
  };
  for (let index = 1; index < line.length; index += 1) {
    const a = line[index - 1];
    const b = line[index];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const along = clamp(
      ((pin.x - a.x) * dx + (pin.y - a.y) * dy) / (length * length),
      0,
      1,
    );
    const near = { x: a.x + along * dx, y: a.y + along * dy };
    const distance = Math.hypot(pin.x - near.x, pin.y - near.y);
    if (distance >= best.distance) continue;
    const side = dx * (pin.y - a.y) - dy * (pin.x - a.x) < 0 ? -1 : 1;
    best = {
      near,
      distance,
      side,
      normal: { x: (-dy / length) * side, y: (dx / length) * side },
    };
  }
  return best;
}

function keepOffWater(pin: Point, home: Point, water: Water): boolean {
  const room = water.width / 2 + WATER_CLEARANCE;
  let moved = false;
  for (const line of water.lines) {
    const bank = nearestOnLine(home, line);
    const now = nearestOnLine(pin, line);
    const crossed =
      now.side !== bank.side && now.distance < room * CROSSING_REACH;
    if (now.distance >= room && !crossed) continue;
    const sign = now.side === bank.side ? 1 : -1;
    pin.x = now.near.x + now.normal.x * sign * room;
    pin.y = now.near.y + now.normal.y * sign * room;
    moved = true;
  }
  return moved;
}

function spreadPins(
  pins: Point[],
  onWater: readonly boolean[],
  water: Water,
): Point[] {
  const spread = pins.map((pin) => ({ ...pin }));
  const homes = pins.map((pin) => ({ ...pin }));
  for (let round = 0; round < SPREAD_ROUNDS; round += 1) {
    let moved = false;
    for (let a = 0; a < spread.length; a += 1) {
      for (let b = a + 1; b < spread.length; b += 1) {
        const dx = spread[b].x - spread[a].x;
        const dy = spread[b].y - spread[a].y;
        const distance = Math.hypot(dx, dy);
        if (distance >= PIN_GAP) continue;
        moved = true;
        const [ux, uy] =
          distance === 0 ? SAME_SPOT_SLANT : [dx / distance, dy / distance];
        const push = (PIN_GAP - distance) / 2;
        spread[a].x -= ux * push;
        spread[a].y -= uy * push;
        spread[b].x += ux * push;
        spread[b].y += uy * push;
      }
    }
    spread.forEach((pin, index) => {
      if (!onWater[index] && keepOffWater(pin, homes[index], water)) {
        moved = true;
      }
      pin.x = clamp(pin.x, PIN_BOX.left, PIN_BOX.right);
      pin.y = clamp(pin.y, PIN_BOX.top, PIN_BOX.bottom);
    });
    if (!moved) break;
  }
  return spread.map((pin) => ({
    x: Math.round(pin.x * 10) / 10,
    y: Math.round(pin.y * 10) / 10,
  }));
}

function buildTrip(
  kind: PlanKind,
  id: SampleCityId,
  city: SampleCity,
): SampleTrip {
  const stops = city.days.flatMap((day) => day.stops);
  const place = projection(stops.map((stop) => stop.at));
  const water: Water = {
    lines: city.water.map((line) => line.map(place)),
    width: city.waterWidth ?? WATER_WIDTH,
  };
  const pins = spreadPins(
    stops.map((stop) => place(stop.at)),
    stops.map((stop) => stop.onWater === true),
    water,
  );
  let next = 0;
  return {
    kind,
    city: id,
    name: city.name,
    saves: city.saves,
    days: city.days.map((day) => ({
      title: day.title,
      stops: day.stops.map((stop) => {
        const pin = pins[next];
        next += 1;
        return { name: stop.name, slot: stop.slot, pin, at: stop.at };
      }),
    })),
    water: water.lines.map((line) =>
      line
        .map(
          ({ x, y }, index) =>
            `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`,
        )
        .join(" "),
    ),
    waterWidth: water.width,
  };
}

const TRIPS = new Map<string, SampleTrip>();

/** The sample a goal shows: a trip in the picked city, or a date night or weekend there, in Prague when that city has none. */
export function samplePlan(kind: PlanKind, city?: string | null): SampleTrip {
  const picked = isSampleCity(city) ? city : null;
  const tripCity =
    picked !== null && SAMPLE_CITIES[picked].days.length > 0 ? picked : null;
  const id =
    kind === "trip"
      ? (tripCity ?? DEFAULT_SAMPLE_CITY)
      : planCity(kind, picked);
  const key = `${kind}:${id}`;
  let trip = TRIPS.get(key);
  if (trip === undefined) {
    trip = buildTrip(
      kind,
      id,
      kind === "trip" ? SAMPLE_CITIES[id] : planAsCity(kind, id),
    );
    TRIPS.set(key, trip);
  }
  return trip;
}

/** Just these stops on the city's map, as one day: a real reel's places. */
export function stopsTrip(
  kind: PlanKind,
  id: SampleCityId,
  title: TextMessageKey,
  stops: readonly CityStop[],
): SampleTrip {
  return buildTrip(kind, id, {
    ...SAMPLE_CITIES[id],
    saves: [],
    days: [{ title, stops }],
  });
}

export function sampleTrip(city?: string | null): SampleTrip {
  return samplePlan("trip", city);
}

type NumberedStop = {
  stop: SampleStop;
  day: number;
  number: number;
};

export function sampleStops(trip: SampleTrip): NumberedStop[] {
  return trip.days
    .flatMap((day, dayIndex) =>
      day.stops.map((stop) => ({ stop, day: dayIndex })),
    )
    .map((entry, index) => ({ ...entry, number: index + 1 }));
}
