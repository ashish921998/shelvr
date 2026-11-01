import { describe, expect, it } from "vitest";

import {
  canRetrySave,
  cityRows,
  newlyUnplaced,
  plannableCities,
  savesToReview,
  unplacedSaves,
  visibleCities,
} from "@/lib/home-places";

const city = (name: string, count = 1) => ({
  city: name,
  count,
  cover: null,
});

describe("visibleCities", () => {
  const six = ["A", "B", "C", "D", "E", "F"].map((name) => city(name));

  it("shows four and counts the rest until expanded", () => {
    const { shown, hidden } = visibleCities(six, false);
    expect(shown.map((c) => c.city)).toEqual(["A", "B", "C", "D"]);
    expect(hidden).toBe(2);
  });

  it("shows every city once expanded", () => {
    expect(visibleCities(six, true)).toEqual({ shown: six, hidden: 0 });
  });

  it("hides nothing at exactly four", () => {
    expect(visibleCities(six.slice(0, 4), false).hidden).toBe(0);
  });
});

describe("unplacedSaves", () => {
  it("keeps saves still reading, failed, or ready without a city", () => {
    const saves = [
      { _id: "a", status: "ready" as const, cities: ["Lisbon"] },
      { _id: "b", status: "ready" as const, cities: [] },
      { _id: "c", status: "ready" as const },
      { _id: "d", status: "processing" as const },
      { _id: "e", status: "failed" as const, cities: ["Porto"] },
    ];
    expect(unplacedSaves(saves).map((s) => s._id)).toEqual([
      "b",
      "c",
      "d",
      "e",
    ]);
  });
});

describe("savesToReview", () => {
  it("holds failed saves and finished saves without a city, never ones still reading or placed", () => {
    const saves = [
      { _id: "reading", status: "processing" as const },
      { _id: "failed", status: "failed" as const },
      { _id: "empty", status: "ready" as const, cities: [] },
      { _id: "placed", status: "ready" as const, cities: ["Lisbon"] },
    ];
    expect(savesToReview(saves).map((s) => s._id)).toEqual(["failed", "empty"]);
  });
});

describe("newlyUnplaced", () => {
  it("names only saves the app saw reading that then finished without a city", () => {
    const before = new Map([
      ["failed-now", "processing" as const],
      ["empty-now", "processing" as const],
      ["placed-now", "processing" as const],
      ["failed-earlier", "failed" as const],
    ]);
    const saves = [
      { _id: "failed-now", status: "failed" as const },
      { _id: "empty-now", status: "ready" as const },
      { _id: "placed-now", status: "ready" as const, cities: ["Sintra"] },
      { _id: "failed-earlier", status: "failed" as const },
      { _id: "unseen", status: "failed" as const },
    ];
    expect(newlyUnplaced(before, saves).map((s) => s._id)).toEqual([
      "failed-now",
      "empty-now",
    ]);
  });
});

describe("canRetrySave", () => {
  it("matches what reprocessItem accepts", () => {
    expect(canRetrySave({ _id: "a", status: "failed" })).toBe(true);
    expect(
      canRetrySave({ _id: "b", status: "failed", failureReason: "not_found" }),
    ).toBe(false);
    expect(canRetrySave({ _id: "c", status: "ready" })).toBe(false);
    expect(
      canRetrySave({ _id: "d", status: "ready", enrichment: "partial" }),
    ).toBe(true);
  });
});

describe("plannableCities", () => {
  it("drops only cities whose place count is zero", () => {
    const cities = [
      { ...city("Lisbon"), placeCount: 3 },
      { ...city("Rome"), placeCount: 0 },
      city("Oslo"),
    ];
    expect(plannableCities(cities).map((c) => c.city)).toEqual([
      "Lisbon",
      "Oslo",
    ]);
  });
});

describe("cityRows", () => {
  const names = (count: number) =>
    cityRows(
      Array.from({ length: count }, (_, index) => city(String(index))),
    ).map((row) =>
      row.kind === "pair" ? row.cities.map((c) => c.city) : row.city.city,
    );

  it("has no rows for no cities", () => {
    expect(names(0)).toEqual([]);
  });

  it("gives a lone city a wide row", () => {
    expect(names(1)).toEqual(["0"]);
  });

  it("pairs two cities", () => {
    expect(names(2)).toEqual([["0", "1"]]);
  });

  it("ends an odd list with a wide row", () => {
    expect(names(3)).toEqual([["0", "1"], "2"]);
    expect(names(5)).toEqual([["0", "1"], ["2", "3"], "4"]);
  });

  it("marks only the last odd city as wide", () => {
    const kinds = cityRows(["a", "b", "c"].map((name) => city(name))).map(
      (row) => row.kind,
    );
    expect(kinds).toEqual(["pair", "wide"]);
  });
});
