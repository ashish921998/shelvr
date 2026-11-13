import { describe, expect, it } from "vitest";
import {
  completionByCity,
  type CompletionSave,
  type CompletionStamp,
} from "./cityCompletion";
import { placeKey } from "./plan";
import type { VisitMark } from "./placeVisits";

type Pin = { name: string; lat: number; lng: number; appleId?: string };

const TIGRE = { name: "Tigre", lat: 38.71, lng: -9.14 };
const BLEND = { name: "Blend", lat: 38.72, lng: -9.15 };
const MANTEIGARIA = { name: "Manteigaria", lat: 38.711, lng: -9.143 };
const MAJESTIC = { name: "Majestic", lat: 41.15, lng: -8.61 };

function completion(
  input: {
    saves?: CompletionSave[];
    stamps?: CompletionStamp[];
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

function stampAt(
  pin: Pin,
  city: string | undefined,
  visitedAt = 1,
  extra: Partial<CompletionStamp> = {},
): CompletionStamp {
  return {
    key: placeKey(pin.name),
    name: pin.name,
    lat: pin.lat,
    lng: pin.lng,
    ...(pin.appleId === undefined ? {} : { appleId: pin.appleId }),
    ...(city === undefined ? {} : { city }),
    visitedAt,
    ...extra,
  };
}

function visitAt(...pins: Pin[]): VisitMark {
  return {
    key: placeKey(pins[0].name),
    name: pins[0].name,
    spots: pins.map(({ lat, lng, appleId }) =>
      appleId === undefined ? { lat, lng } : { lat, lng, appleId },
    ),
  };
}

function stamped(pins: Pin[], city: string) {
  return {
    stamps: pins.map((pin) => stampAt(pin, city)),
    visits: pins.map((pin) => visitAt(pin)),
  };
}

const lisbon: CompletionSave = {
  cities: ["Lisbon"],
  placePins: [TIGRE, BLEND, MANTEIGARIA],
};

describe("completionByCity", () => {
  it("has no rows before anything is saved or stamped", () => {
    expect(completion()).toEqual([]);
  });

  it("counts a city's ticked places out of its places", () => {
    expect(
      completion({ saves: [lisbon], ...stamped([TIGRE], "Lisbon") }),
    ).toEqual([{ city: "Lisbon", stamped: 1, total: 3 }]);
  });

  it("fills the ring once every place is stamped", () => {
    expect(
      completion({
        saves: [lisbon],
        ...stamped([TIGRE, BLEND, MANTEIGARIA], "Lisbon"),
      }),
    ).toEqual([{ city: "Lisbon", stamped: 3, total: 3 }]);
  });

  it("adds a stamp whose save is gone to both counts", () => {
    expect(
      completion({
        saves: [lisbon],
        ...stamped([MAJESTIC], "Porto"),
      }),
    ).toEqual([
      { city: "Porto", stamped: 1, total: 1 },
      { city: "Lisbon", stamped: 0, total: 3 },
    ]);
  });

  it("adds a stamp whose pin the save dropped, beside the city's places", () => {
    expect(
      completion({
        saves: [{ cities: ["Lisbon"], placePins: [BLEND] }],
        ...stamped([TIGRE], "Lisbon"),
      }),
    ).toEqual([{ city: "Lisbon", stamped: 1, total: 2 }]);
  });

  it("counts one place once when two stamps tick it", () => {
    const nextDoor = { ...TIGRE, lat: TIGRE.lat + 0.0005 };
    expect(
      completion({
        saves: [
          { cities: ["Lisbon"], placePins: [TIGRE] },
          { cities: ["Lisbon"], placePins: [nextDoor] },
        ],
        stamps: [
          stampAt(TIGRE, "Lisbon"),
          stampAt(nextDoor, "Lisbon"),
          stampAt({ ...TIGRE, name: "Tigre, Lisbon" }, "Lisbon"),
        ],
        visits: [
          visitAt(TIGRE, nextDoor),
          visitAt({ ...TIGRE, name: "Tigre, Lisbon" }),
        ],
      }),
    ).toEqual([{ city: "Lisbon", stamped: 1, total: 1 }]);
  });

  it("counts two stamps of one gone place once", () => {
    const nextDoor = { ...MAJESTIC, lat: MAJESTIC.lat + 0.0005 };
    expect(
      completion({
        stamps: [stampAt(MAJESTIC, "Porto"), stampAt(nextDoor, "Porto")],
      }),
    ).toEqual([{ city: "Porto", stamped: 1, total: 1 }]);
  });

  it("counts a stamp with no city through the place it ticks", () => {
    expect(
      completion({
        saves: [lisbon],
        stamps: [{ key: "tigre", name: "Tigre", visitedAt: 1 }],
        visits: [{ key: "tigre", name: "Tigre" }],
      }),
    ).toEqual([{ city: "Lisbon", stamped: 1, total: 3 }]);
  });

  it("matches a stamp to a venue saved under another name by its Apple id", () => {
    const franklin = { ...TIGRE, name: "Franklin Barbecue", appleId: "A-1" };
    const bbq = { ...franklin, name: "Franklin BBQ", lat: TIGRE.lat + 0.001 };
    expect(
      completion({
        saves: [{ cities: ["Austin"], placePins: [franklin] }],
        stamps: [stampAt(bbq, "Austin")],
        visits: [visitAt(bbq)],
      }),
    ).toEqual([{ city: "Austin", stamped: 1, total: 1 }]);
  });

  it("counts a stamp under its place's current city, not the one it was stamped in", () => {
    expect(
      completion({
        saves: [lisbon],
        ...stamped([TIGRE], "Porto"),
      }),
    ).toEqual([{ city: "Lisbon", stamped: 1, total: 3 }]);
  });

  it("leaves out a stamp and a pin with no city", () => {
    expect(
      completion({
        saves: [
          { cities: ["Lisbon", "Porto"], placePins: [TIGRE] },
          { placePins: [BLEND] },
          { cities: ["Lisbon"], placePins: [] },
        ],
        stamps: [
          stampAt(MAJESTIC, undefined),
          stampAt(MAJESTIC, " "),
          { key: "nowhere", name: "Nowhere", city: "Faro", visitedAt: 1 },
        ],
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
          { cities: ["Lisbon", "LISBON "], placePins: [] },
        ],
        stamps: [stampAt(MANTEIGARIA, "Lisbon ")],
      }),
    ).toEqual([{ city: "Lisbon", stamped: 1, total: 3 }]);
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

  it("puts the latest dated stamp first, then undated stamps, then unstamped cities by size", () => {
    const pin = (name: string, lat: number) => ({ name, lat, lng: 0 });
    const rows = completion({
      saves: [
        { cities: ["Madrid"], placePins: [pin("Sobrino", 1)] },
        {
          cities: ["Rome"],
          placePins: [pin("Roscioli", 2), pin("Armando", 3)],
        },
        { cities: ["Athens"], placePins: [pin("Ergon", 4), pin("Diporto", 5)] },
      ],
      stamps: [
        stampAt(pin("Ikarus", 6), "Faro", 99, { backfilled: true }),
        stampAt(pin("Cafe A", 7), "Porto", 30),
        stampAt(pin("Cafe B", 8), "Lisbon", 10),
        stampAt(pin("Cafe C", 9), "Porto", 5),
        stampAt(pin("Cafe D", 10), "Berlin", 20),
      ],
    });
    expect(rows.map((row) => row.city)).toEqual([
      "Porto",
      "Berlin",
      "Lisbon",
      "Faro",
      "Athens",
      "Rome",
      "Madrid",
    ]);
    expect(rows[0]).toEqual({ city: "Porto", stamped: 2, total: 2 });
  });

  it("dates a city by a stamp with no city that ticks one of its places", () => {
    expect(
      completion({
        saves: [{ cities: ["Lisbon"], placePins: [TIGRE] }],
        stamps: [
          stampAt(MAJESTIC, "Porto", 1),
          { key: "tigre", name: "Tigre", visitedAt: 2 },
        ],
        visits: [{ key: "tigre", name: "Tigre" }, visitAt(MAJESTIC)],
      }).map((row) => row.city),
    ).toEqual(["Lisbon", "Porto"]);
  });

  it("orders cities stamped at the same moment by size, then name", () => {
    expect(
      completion({
        saves: [{ cities: ["Lisbon"], placePins: [TIGRE, BLEND] }],
        stamps: [
          stampAt(MAJESTIC, "Porto"),
          stampAt({ ...MAJESTIC, name: "Gelo" }, "Faro"),
          stampAt(TIGRE, "Lisbon"),
        ],
        visits: [visitAt(TIGRE)],
      }).map((row) => row.city),
    ).toEqual(["Lisbon", "Faro", "Porto"]);
  });
});
