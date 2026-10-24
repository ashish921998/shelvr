import { describe, expect, it } from "vitest";

import { visibleCities } from "@/lib/home-places";

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
