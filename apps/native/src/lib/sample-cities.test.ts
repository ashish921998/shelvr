import { describe, expect, it } from "vitest";
import { t } from "@/lib/i18n";
import { CITY_STAMP_IDS } from "@convex/model/cityStamps";
import {
  SAMPLE_CITIES,
  SAMPLE_CITY_IDS,
  cityMatches,
  readSampleCities,
} from "./sample-cities";

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

describe("readSampleCities", () => {
  it("keeps known cities once each, in the list's order", () => {
    expect(
      readSampleCities(["madrid", "lisbon", "atlantis", "lisbon"]),
    ).toEqual(["lisbon", "madrid"]);
  });

  it("reads anything but a list as none", () => {
    expect(readSampleCities("lisbon")).toEqual([]);
    expect(readSampleCities(undefined)).toEqual([]);
    expect(readSampleCities({ 0: "lisbon" })).toEqual([]);
  });
});

describe("the city stamp list", () => {
  it("is the sample city list, so every stamp has a name and a picture", () => {
    expect([...SAMPLE_CITY_IDS]).toEqual(CITY_STAMP_IDS);
  });
});
