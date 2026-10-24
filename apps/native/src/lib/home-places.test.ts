import { describe, expect, it } from "vitest";

import { unplacedSaves, visibleCities } from "@/lib/home-places";

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
