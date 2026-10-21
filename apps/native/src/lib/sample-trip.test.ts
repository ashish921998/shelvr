import { describe, expect, it } from "vitest";
import en from "@/locales/en.json";
import {
  SAMPLE_CROPS,
  SAMPLE_MAP,
  SAMPLE_SLOT_LABELS,
  SAMPLE_TRIP,
  sampleRows,
  sampleStops,
  showTripTeaser,
} from "./sample-trip";

describe("showTripTeaser", () => {
  it.each([
    [["Travel"], [], true],
    [[], ["Travel"], true],
    [["Recipes", "Travel"], ["AI"], true],
    [["Articles"], ["Coffee", "Photography"], false],
    [[], [], false],
  ] as const)(
    "for kinds %j and topics %j shows the trip: %s",
    (kinds, interests, expected) => {
      expect(showTripTeaser(kinds, interests)).toBe(expected);
    },
  );
});

describe("the sample trip", () => {
  it("numbers its stops 1 to 5 in trip order", () => {
    expect(sampleStops().map(({ number }) => number)).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps each day's stops together", () => {
    expect(sampleStops().map(({ day }) => day)).toEqual([0, 0, 0, 1, 1]);
  });

  it("names as many places in its saves as it has stops", () => {
    const named = SAMPLE_TRIP.saves.reduce((sum, save) => sum + save.places, 0);
    expect(named).toBe(sampleStops().length);
  });

  it("does not name the same place twice", () => {
    const names = sampleStops().map(({ stop }) => stop.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(Object.entries(SAMPLE_CROPS))(
    "keeps every pin, and its edge, inside the %s crop",
    (_, crop) => {
      const edge = 11;
      for (const { stop } of sampleStops()) {
        expect(stop.pin.x - edge).toBeGreaterThanOrEqual(0);
        expect(stop.pin.x + edge).toBeLessThanOrEqual(SAMPLE_MAP.width);
        expect(stop.pin.y - edge).toBeGreaterThanOrEqual(crop.top);
        expect(stop.pin.y + edge).toBeLessThanOrEqual(crop.top + crop.height);
      }
    },
  );

  it("keeps both crops inside the drawing", () => {
    for (const crop of Object.values(SAMPLE_CROPS)) {
      expect(crop.top).toBeGreaterThanOrEqual(0);
      expect(crop.top + crop.height).toBeLessThanOrEqual(SAMPLE_MAP.height);
    }
  });

  it("uses only copy the English catalog has", () => {
    const keys = [
      ...Object.values(SAMPLE_SLOT_LABELS),
      ...SAMPLE_TRIP.days.map((day) => day.title),
      ...SAMPLE_TRIP.saves.flatMap((save) =>
        "label" in save.source ? [save.source.label] : [],
      ),
    ];
    for (const key of keys) expect(en).toHaveProperty([key]);
  });
});

describe("sampleRows", () => {
  it("lists each day's header, then that day's stops", () => {
    expect(
      sampleRows().map((row) =>
        row.kind === "day" ? `day ${row.day}` : row.entry.stop.name,
      ),
    ).toEqual([
      "day 0",
      "Old Town Square",
      "Café Louvre",
      "Charles Bridge",
      "day 1",
      "Prague Castle",
      "Petřín Lookout Tower",
    ]);
  });

  it("carries every stop once, numbered as the map numbers them", () => {
    const numbers = sampleRows().flatMap((row) =>
      row.kind === "stop" ? [row.entry.number] : [],
    );
    expect(numbers).toEqual([1, 2, 3, 4, 5]);
  });
});
