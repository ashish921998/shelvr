import { describe, expect, it } from "vitest";
import { t } from "@/lib/i18n";
import { SAMPLE_CITIES, SAMPLE_CITY_IDS, cityMatches } from "./sample-cities";

describe("cityMatches", () => {
  it("folds accents and case", () => {
    expect(cityMatches("montreal", "Montréal", "montreal")).toBe(true);
    expect(cityMatches("montreal", "Montréal", "MONTRÉAL")).toBe(true);
    expect(cityMatches("montreal", "Montréal", "  mont ")).toBe(true);
  });

  it("matches the id with dashes as spaces when the name differs", () => {
    expect(cityMatches("copenhagen", "Copenhague", "copenhagen")).toBe(true);
    expect(cityMatches("new-york", "ニューヨーク", "new york")).toBe(true);
    expect(cityMatches("new-york", "ニューヨーク", "new-york")).toBe(false);
  });

  it("matches every city for a blank or whitespace query", () => {
    for (const query of ["", "   "]) {
      expect(
        SAMPLE_CITY_IDS.filter((id) =>
          cityMatches(id, t(SAMPLE_CITIES[id].name), query),
        ),
      ).toEqual([...SAMPLE_CITY_IDS]);
    }
  });

  it("matches no city for a query no name or id holds", () => {
    expect(
      SAMPLE_CITY_IDS.filter((id) =>
        cityMatches(id, t(SAMPLE_CITIES[id].name), "zzz"),
      ),
    ).toEqual([]);
  });
});
