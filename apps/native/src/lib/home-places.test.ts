import { writeFileSync } from "node:fs";
import { isStaleProcessing } from "@convex/model/itemFields";
import vectors from "../../../ios/TestData/library-retry.json";
import { describe, expect, it } from "vitest";

import {
  canRetrySave,
  cityCountLine,
  newlyUnplaced,
  plannableCities,
  savesToReview,
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

describe("cityCountLine", () => {
  it("counts places until one is marked visited", () => {
    expect(cityCountLine({ ...city("Austin"), placeCount: 23 })).toBe(
      "23 places",
    );
    expect(
      cityCountLine({ ...city("Austin"), placeCount: 23, visitedCount: 7 }),
    ).toBe("7 of 23 places visited");
  });

  it("says a city with saves but no place has none yet", () => {
    expect(cityCountLine({ ...city("Austin", 2), placeCount: 0 })).toBe(
      "2 saves, no place yet",
    );
  });
});

it("keeps Swift save retry eligibility aligned with Expo and the server", () => {
  const statuses = ["failed", "ready", "processing"] as const;
  const failures = ["not_found", "image_too_large", "error"] as const;
  const expected = vectors.saves.map((row) => {
    const status = statuses.find((value) => value === row.status);
    if (!status) throw new Error("Invalid fixture status");
    const failureReason = failures.find((value) => value === row.failureReason);
    return (
      canRetrySave({ ...row, status, failureReason }) ||
      isStaleProcessing(row, vectors.now)
    );
  });
  if (process.env.SHELVR_RECORD_RETRY_VECTORS === "1") {
    writeFileSync(
      "../../apps/ios/TestData/library-retry.json",
      JSON.stringify({ ...vectors, expected }, null, 2) + "\n",
    );
  } else {
    expect(expected).toEqual(vectors.expected);
  }
});
