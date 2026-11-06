import { describe, expect, it } from "vitest";

import {
  canRetrySave,
  newlyUnplaced,
  plannableCities,
  savesToReview,
  sharedListCover,
  unplacedSaves,
} from "@/lib/home-places";

const city = (name: string, count = 1) => ({
  city: name,
  count,
  cover: null,
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

describe("sharedListCover", () => {
  const mine = [
    { ...city("Lisbon"), cover: "lisbon.jpg" },
    { ...city("Paris"), cover: null },
    { ...city("Tokyo"), cover: "tokyo.jpg" },
  ];

  it("matches the viewer's own city cover ignoring case", () => {
    expect(sharedListCover(["lisbon"], mine)).toBe("lisbon.jpg");
  });

  it("skips cities without a cover and takes the next one", () => {
    expect(sharedListCover(["Paris", "TOKYO"], mine)).toBe("tokyo.jpg");
  });

  it("has no cover when the viewer saved none of the cities", () => {
    expect(sharedListCover(["Oslo"], mine)).toBeNull();
    expect(sharedListCover(["Lisbon"], undefined)).toBeNull();
  });
});
