import { describe, expect, it } from "vitest";
import { completionByCity, type CompletionSave } from "./cityCompletion";
import type { VisitMark } from "./placeVisits";

const TIGRE = { name: "Tigre", lat: 38.71, lng: -9.14 };
const BLEND = { name: "Blend", lat: 38.72, lng: -9.15 };
const MANTEIGARIA = { name: "Manteigaria", lat: 38.711, lng: -9.143 };
const MAJESTIC = { name: "Majestic", lat: 41.15, lng: -8.61 };

function completion(
  input: {
    saves?: CompletionSave[];
    stamps?: { city?: string; visitedAt: number }[];
    visits?: VisitMark[];
    savesPerCity?: number;
  } = {},
) {
  return completionByCity({
    saves: input.saves ?? [],
    stamps: input.stamps ?? [],
    visits: input.visits ?? [],
    savesPerCity: input.savesPerCity ?? 200,
  });
}

const lisbon: CompletionSave = {
  cities: ["Lisbon"],
  placePins: [TIGRE, BLEND, MANTEIGARIA],
};

describe("completionByCity", () => {
  it("has no rows before anything is saved or stamped", () => {
    expect(completion()).toEqual([]);
  });

  it("counts a city's stamps out of its stamps and unstamped places", () => {
    expect(
      completion({
        saves: [lisbon],
        stamps: [{ city: "Lisbon", visitedAt: 5 }],
        visits: [{ key: "tigre", name: "Tigre", spots: [TIGRE] }],
      }),
    ).toEqual([{ city: "Lisbon", stamped: 1, total: 3 }]);
  });

  it("fills the ring once every place is stamped", () => {
    expect(
      completion({
        saves: [lisbon],
        stamps: [TIGRE, BLEND, MANTEIGARIA].map(() => ({
          city: "Lisbon",
          visitedAt: 1,
        })),
        visits: [TIGRE, BLEND, MANTEIGARIA].map((pin) => ({
          key: pin.name.toLowerCase(),
          name: pin.name,
          spots: [{ lat: pin.lat, lng: pin.lng }],
        })),
      }),
    ).toEqual([{ city: "Lisbon", stamped: 3, total: 3 }]);
  });

  it("keeps a stamp whose save is gone in both counts", () => {
    expect(completion({ stamps: [{ city: "Porto", visitedAt: 1 }] })).toEqual([
      { city: "Porto", stamped: 1, total: 1 },
    ]);
  });

  it("leaves out a stamp and a pin with no city", () => {
    expect(
      completion({
        saves: [
          { cities: ["Lisbon", "Porto"], placePins: [TIGRE] },
          { placePins: [BLEND] },
          { cities: ["Lisbon"], placePins: [] },
        ],
        stamps: [{ visitedAt: 1 }, { city: " ", visitedAt: 2 }],
      }),
    ).toEqual([]);
  });

  it("counts a pin under its own city on a save naming two", () => {
    expect(
      completion({
        saves: [
          {
            cities: ["Lisbon", "Porto"],
            placePins: [
              { ...TIGRE, city: "Lisbon" },
              { ...MAJESTIC, city: "Porto" },
              { ...BLEND, city: "Madrid" },
            ],
          },
        ],
      }),
    ).toEqual([
      { city: "Lisbon", stamped: 0, total: 1 },
      { city: "Porto", stamped: 0, total: 1 },
    ]);
  });

  it("merges spellings that differ in case and spacing, under the most used one", () => {
    expect(
      completion({
        saves: [
          { cities: ["lisbon"], placePins: [TIGRE] },
          { cities: ["Lisbon"], placePins: [BLEND] },
          { cities: ["Lisbon", "LISBON "], placePins: [MANTEIGARIA] },
        ],
        stamps: [{ city: "Lisbon ", visitedAt: 1 }],
      }),
    ).toEqual([{ city: "Lisbon", stamped: 1, total: 4 }]);
  });

  it("keeps spellings that differ in accents apart, as cityKey does", () => {
    expect(
      completion({
        saves: [
          { cities: ["São Paulo"], placePins: [TIGRE] },
          { cities: ["Sao Paulo"], placePins: [BLEND] },
        ],
      }).map((row) => row.city),
    ).toEqual(["Sao Paulo", "São Paulo"]);
  });

  it("counts a place two saves share once", () => {
    expect(
      completion({
        saves: [
          { cities: ["Lisbon"], placePins: [TIGRE] },
          {
            cities: ["Lisbon"],
            placePins: [{ ...TIGRE, lat: TIGRE.lat + 0.0005 }],
          },
        ],
      }),
    ).toEqual([{ city: "Lisbon", stamped: 0, total: 1 }]);
  });

  it("reads only the newest saves of a city, as the city page does", () => {
    expect(
      completion({
        saves: [
          { cities: ["Lisbon"], placePins: [TIGRE] },
          { cities: ["Lisbon"], placePins: [BLEND] },
          { cities: ["Lisbon"], placePins: [MANTEIGARIA] },
        ],
        savesPerCity: 2,
      }),
    ).toEqual([{ city: "Lisbon", stamped: 0, total: 2 }]);
  });

  it("puts the most recent stamp first, then unstamped cities by size", () => {
    const rows = completion({
      saves: [
        { cities: ["Madrid"], placePins: [TIGRE] },
        { cities: ["Rome"], placePins: [TIGRE, BLEND] },
        { cities: ["Athens"], placePins: [TIGRE, BLEND] },
      ],
      stamps: [
        { city: "Porto", visitedAt: 30 },
        { city: "Lisbon", visitedAt: 10 },
        { city: "Porto", visitedAt: 5 },
        { city: "Berlin", visitedAt: 20 },
      ],
    });
    expect(rows.map((row) => row.city)).toEqual([
      "Porto",
      "Berlin",
      "Lisbon",
      "Athens",
      "Rome",
      "Madrid",
    ]);
    expect(rows[0]).toEqual({ city: "Porto", stamped: 2, total: 2 });
  });

  it("orders cities stamped at the same moment by size, then name", () => {
    expect(
      completion({
        saves: [{ cities: ["Lisbon"], placePins: [TIGRE] }],
        stamps: [
          { city: "Porto", visitedAt: 1 },
          { city: "Faro", visitedAt: 1 },
          { city: "Lisbon", visitedAt: 1 },
        ],
      }).map((row) => row.city),
    ).toEqual(["Lisbon", "Faro", "Porto"]);
  });
});
