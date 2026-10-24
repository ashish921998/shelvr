import { describe, expect, it } from "vitest";
import en from "@/locales/en.json";
import { isSampleCity, SAMPLE_CITIES, SAMPLE_CITY_IDS } from "./sample-cities";
import {
  DEFAULT_SAMPLE_CITY,
  PIN_SIZE,
  SAMPLE_CROPS,
  SAMPLE_MAP,
  sampleStops,
  samplePlan,
  sampleTrip,
  WATER_CLEARANCE,
} from "./sample-trip";
import { planAsCity, planCities } from "./sample-plans";

const ROUNDING_SLACK = 0.5;

describe("samplePlan", () => {
  it.each([
    ["date", "paris", "paris"],
    ["date", "las-vegas", "prague"],
    ["date", null, "prague"],
    ["weekend", "new-york", "new-york"],
    ["weekend", "las-vegas", "prague"],
  ] as const)(
    "draws a %s picked in %s in %s, Prague when the city has none",
    (kind, picked, expected) => {
      expect(samplePlan(kind, picked).city).toBe(expected);
      expect(samplePlan(kind, picked).kind).toBe(kind);
    },
  );

  it("offers only cities with a written plan, Prague among them", () => {
    for (const kind of ["date", "weekend"] as const) {
      expect(planCities(kind)).toContain("prague");
      for (const city of planCities(kind)) {
        expect(samplePlan(kind, city).city).toBe(city);
      }
    }
    expect(planCities("trip")).toEqual(
      SAMPLE_CITY_IDS.filter((id) => id !== "seattle"),
    );
  });
});

describe("sampleTrip", () => {
  it("is in the picked city", () => {
    expect(sampleTrip("tokyo").city).toBe("tokyo");
    expect(sampleTrip("new-york").name).toBe("tripTeaser.cityNewYork");
  });

  it.each([null, undefined, "", "atlantis", "toString"])(
    "falls back to Prague for %j",
    (city) => {
      expect(sampleTrip(city).city).toBe(DEFAULT_SAMPLE_CITY);
      expect(DEFAULT_SAMPLE_CITY).toBe("prague");
    },
  );

  it("knows only the sample cities", () => {
    expect(isSampleCity("paris")).toBe(true);
    expect(isSampleCity("toString")).toBe(false);
    expect(isSampleCity(7)).toBe(false);
  });
});

describe.each(planCities("trip"))("the %s sample trip", (city) => {
  const trip = sampleTrip(city);
  const stops = sampleStops(trip);

  it("has two days of a morning, lunch, afternoon and dinner", () => {
    expect(trip.days).toHaveLength(2);
    for (const day of trip.days) {
      expect(day.stops.map((stop) => stop.slot)).toEqual([
        "morning",
        "lunch",
        "afternoon",
        "dinner",
      ]);
    }
  });

  it("numbers its stops in trip order and keeps each day together", () => {
    expect(stops.map(({ number }) => number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(stops.map(({ day }) => day)).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
  });
});

const PLANS = [
  ...planCities("trip").map((city) => ["trip", city] as const),
  ...planCities("date").map((city) => ["date", city] as const),
  ...planCities("weekend").map((city) => ["weekend", city] as const),
];

describe.each(PLANS)("the %s sample in %s", (kind, city) => {
  const trip = samplePlan(kind, city);
  const stops = sampleStops(trip);
  const source = kind === "trip" ? SAMPLE_CITIES[city] : planAsCity(kind, city);

  it("names as many places in its saves as it has stops", () => {
    const named = trip.saves.reduce((sum, save) => sum + save.places, 0);
    expect(named).toBe(stops.length);
  });

  it("does not name the same place twice", () => {
    const names = stops.map(({ stop }) => stop.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(Object.entries(SAMPLE_CROPS))(
    "keeps every pin, and its edge, inside the %s crop",
    (_, crop) => {
      const edge = PIN_SIZE / 2;
      for (const { stop } of stops) {
        expect(stop.pin.x - edge).toBeGreaterThanOrEqual(0);
        expect(stop.pin.x + edge).toBeLessThanOrEqual(SAMPLE_MAP.width);
        expect(stop.pin.y - edge).toBeGreaterThanOrEqual(crop.top);
        expect(stop.pin.y + edge).toBeLessThanOrEqual(crop.top + crop.height);
      }
    },
  );

  it("leaves room between its pins", () => {
    for (const [index, a] of stops.entries()) {
      for (const b of stops.slice(index + 1)) {
        const apart = Math.hypot(
          a.stop.pin.x - b.stop.pin.x,
          a.stop.pin.y - b.stop.pin.y,
        );
        expect(apart).toBeGreaterThanOrEqual(PIN_SIZE - 2);
      }
    }
  });

  it("keeps the pins of places on land off the drawn water", () => {
    const lines = trip.water.map((path) =>
      [...path.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map(([, x, y]) => ({
        x: Number(x),
        y: Number(y),
      })),
    );
    const onWater = new Set<string>(
      source.days.flatMap((day) =>
        day.stops
          .filter((stop) => "onWater" in stop && stop.onWater)
          .map((stop) => stop.name),
      ),
    );
    const room = trip.waterWidth / 2 + WATER_CLEARANCE - ROUNDING_SLACK;
    for (const { stop } of sampleStops(trip)) {
      if (onWater.has(stop.name)) continue;
      for (const line of lines) {
        for (let index = 1; index < line.length; index += 1) {
          const a = line[index - 1]!;
          const b = line[index]!;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const t = Math.min(
            1,
            Math.max(
              0,
              ((stop.pin.x - a.x) * dx + (stop.pin.y - a.y) * dy) /
                (dx * dx + dy * dy || 1),
            ),
          );
          const gap = Math.hypot(
            stop.pin.x - (a.x + t * dx),
            stop.pin.y - (a.y + t * dy),
          );
          expect(gap, `${stop.name} is in the water`).toBeGreaterThanOrEqual(
            room,
          );
        }
      }
    }
  });

  it("uses only copy the English catalog has", () => {
    const keys = [
      trip.name,
      ...trip.days.map((day) => day.title),
      ...trip.saves.map((save) => save.source),
    ];
    for (const key of keys) expect(en).toHaveProperty([key]);
  });
});

it("keeps both crops inside the drawing", () => {
  for (const crop of Object.values(SAMPLE_CROPS)) {
    expect(crop.top).toBeGreaterThanOrEqual(0);
    expect(crop.top + crop.height).toBeLessThanOrEqual(SAMPLE_MAP.height);
  }
});
