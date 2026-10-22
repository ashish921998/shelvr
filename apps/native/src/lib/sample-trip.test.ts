import { describe, expect, it } from "vitest";
import en from "@/locales/en.json";
import { SAMPLE_CITY_IDS } from "./sample-cities";
import {
  DEFAULT_SAMPLE_CITY,
  isSampleCity,
  SAMPLE_CROPS,
  SAMPLE_MAP,
  SAMPLE_SLOT_LABELS,
  sampleRows,
  sampleStops,
  sampleTrip,
  showTripTeaser,
} from "./sample-trip";

describe("showTripTeaser", () => {
  it.each([
    [["Travel"], [], true],
    [[], ["Travel"], true],
    [["Recipes", "Travel"], ["AI & tech"], true],
    [["Articles"], ["Home & design", "Films, books & music"], false],
    [[], [], false],
  ] as const)(
    "for kinds %j and topics %j shows the trip: %s",
    (kinds, interests, expected) => {
      expect(showTripTeaser(kinds, interests)).toBe(expected);
    },
  );
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

  it("builds each city's trip once", () => {
    expect(sampleTrip("seoul")).toBe(sampleTrip("seoul"));
  });
});

describe.each(SAMPLE_CITY_IDS)("the %s sample trip", (city) => {
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
      const edge = 11;
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
        expect(apart).toBeGreaterThanOrEqual(20);
      }
    }
  });

  it("uses only copy the English catalog has", () => {
    const keys = [
      trip.name,
      ...Object.values(SAMPLE_SLOT_LABELS),
      ...trip.days.map((day) => day.title),
      ...trip.saves.flatMap((save) =>
        "label" in save.source ? [save.source.label] : [],
      ),
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

describe("sampleRows", () => {
  const trip = sampleTrip("prague");

  it("lists each day's header, then that day's stops", () => {
    expect(
      sampleRows(trip).map((row) =>
        row.kind === "day" ? `day ${row.day}` : row.entry.stop.name,
      ),
    ).toEqual([
      "day 0",
      "Old Town Square",
      "Grand Café Orient",
      "Charles Bridge",
      "Lokál Dlouhááá",
      "day 1",
      "Prague Castle",
      "Café Savoy",
      "Petřín Lookout Tower",
      "Terasa U Zlaté studně",
    ]);
  });

  it("gives each day's header its title and place count", () => {
    expect(sampleRows(trip)[0]).toEqual({
      kind: "day",
      day: 0,
      title: "tripTeaser.pragueDayOne",
      places: 4,
    });
  });

  it("carries every stop once, numbered as the map numbers them", () => {
    const numbers = sampleRows(trip).flatMap((row) =>
      row.kind === "stop" ? [row.entry.number] : [],
    );
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
