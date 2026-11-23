import { describe, expect, it } from "vitest";
import {
  chooseOpening,
  newSaveFrame,
  openingCamera,
  parseKnownSaves,
  parseStoredView,
  sampleCityFor,
  type StoredView,
} from "./map-opening";

const LAST: StoredView = { lat: 38.7, lng: -9.1, zoom: 12 };

describe("chooseOpening", () => {
  const cases = [
    {
      row: "location and a last view: fly to the person, then restore",
      input: { located: true, last: LAST, hasFit: true, regionCode: "PT" },
      kind: "person",
      restore: LAST,
    },
    {
      row: "no location and a last view: open on it",
      input: { located: false, last: LAST, hasFit: true, regionCode: "PT" },
      kind: "last",
    },
    {
      row: "no last view, location: unchanged",
      input: { located: true, last: undefined, hasFit: true, regionCode: "PT" },
      kind: "person",
    },
    {
      row: "no last view, no location, places: the busiest city",
      input: {
        located: false,
        last: undefined,
        hasFit: true,
        regionCode: "PT",
      },
      kind: "fit",
    },
    {
      row: "nothing to frame: a sample city of the region",
      input: {
        located: false,
        last: undefined,
        hasFit: false,
        regionCode: "PT",
      },
      kind: "sample",
    },
    {
      row: "nothing to frame in an unknown region: unchanged",
      input: {
        located: false,
        last: undefined,
        hasFit: false,
        regionCode: "ZZ",
      },
      kind: "default",
    },
    {
      row: "nothing to frame without a region: unchanged",
      input: {
        located: false,
        last: undefined,
        hasFit: false,
        regionCode: null,
      },
      kind: "default",
    },
  ] as const;

  it.each(cases)("$row", ({ input, kind, ...rest }) => {
    const opening = chooseOpening(input);
    expect(opening.kind).toBe(kind);
    if ("restore" in rest && opening.kind === "person")
      expect(opening.restore).toEqual(rest.restore);
    if (!("restore" in rest) && opening.kind === "person")
      expect(opening.restore).toBeUndefined();
  });

  it("frames the stops of the sample city", () => {
    const opening = chooseOpening({
      located: false,
      last: undefined,
      hasFit: false,
      regionCode: "PT",
    });
    expect(opening).toMatchObject({ kind: "sample", city: "lisbon" });
    expect(opening.kind === "sample" && opening.places.length).toBeGreaterThan(
      0,
    );
  });
});

describe("sampleCityFor", () => {
  it.each([
    ["US", "new-york"],
    ["CA", "toronto"],
    ["IT", "rome"],
    ["PT", "lisbon"],
    ["jp", "tokyo"],
    ["GB", "london"],
  ])("maps %s to %s", (region, city) => {
    expect(sampleCityFor(region)).toBe(city);
  });

  it.each(["ZZ", "", null, undefined, "constructor"])(
    "has none for %s",
    (region) => {
      expect(sampleCityFor(region)).toBeUndefined();
    },
  );
});

describe("parseStoredView", () => {
  it("reads a good view", () => {
    expect(parseStoredView(JSON.stringify(LAST))).toEqual(LAST);
  });

  it.each([
    undefined,
    "",
    "not json",
    "null",
    "[]",
    JSON.stringify({ lat: 91, lng: 0, zoom: 10 }),
    JSON.stringify({ lat: 0, lng: 181, zoom: 10 }),
    JSON.stringify({ lat: 0, lng: 0, zoom: 99 }),
    JSON.stringify({ lat: "1", lng: 0, zoom: 10 }),
    JSON.stringify({ lat: 1, lng: 0 }),
    '{"lat":1e999,"lng":0,"zoom":3}',
  ])("rejects %s", (raw) => {
    expect(parseStoredView(raw)).toBeUndefined();
  });
});

describe("parseKnownSaves", () => {
  it("reads a list of ids", () => {
    expect(parseKnownSaves('["a","b"]')).toEqual(new Set(["a", "b"]));
    expect(parseKnownSaves("[]")).toEqual(new Set());
  });

  it.each([undefined, "x", "{}", "[1]", '["a",2]'])("rejects %s", (raw) => {
    expect(parseKnownSaves(raw)).toBeUndefined();
  });
});

describe("newSaveFrame", () => {
  const all = [
    { itemId: "new", city: "Porto", lat: 41.1, lng: -8.6 },
    { itemId: "new", city: "Porto", lat: 41.15, lng: -8.62 },
    { itemId: "old", city: "Lisbon", lat: 38.7, lng: -9.1 },
    { itemId: "bare", lat: 10, lng: 10 },
  ];

  it("is nothing before the device has recorded what it has seen", () => {
    expect(newSaveFrame(all, undefined)).toBeUndefined();
  });

  it("is nothing when every save is known", () => {
    expect(newSaveFrame(all, new Set(["new", "old", "bare"]))).toBeUndefined();
  });

  it("frames the city of the newest unseen save, keyed by it", () => {
    const frame = newSaveFrame(all, new Set(["old", "bare"]));
    expect(frame?.key).toBe("new");
    expect(frame?.places.map((place) => place.lat)).toEqual([41.1, 41.15]);
  });

  it("frames just the pin of a save without a city", () => {
    const frame = newSaveFrame(all, new Set(["new", "old"]));
    expect(frame).toEqual({
      key: "bare",
      places: [{ itemId: "bare", lat: 10, lng: 10 }],
    });
  });
});

describe("openingCamera", () => {
  const fit = { coordinates: { latitude: 1, longitude: 2 }, zoom: 9 };
  const frame = () => ({ coordinates: { latitude: 3, longitude: 4 }, zoom: 7 });

  it("starts where each opening says, and unpositioned for the person", () => {
    expect(openingCamera({ kind: "person" }, fit, frame)).toBeUndefined();
    expect(
      openingCamera({ kind: "default" }, undefined, frame),
    ).toBeUndefined();
    expect(openingCamera({ kind: "fit" }, fit, frame)).toBe(fit);
    expect(openingCamera({ kind: "last", view: LAST }, fit, frame)).toEqual({
      coordinates: { latitude: 38.7, longitude: -9.1 },
      zoom: 12,
    });
    expect(
      openingCamera({ kind: "sample", city: "lisbon", places: [] }, fit, frame),
    ).toEqual(frame());
  });
});
