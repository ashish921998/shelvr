import { describe, expect, it } from "vitest";

import { badgeTotals, earnedBadges } from "./badges";
import {
  CITY_STAMP_CITIES,
  cityStampKeys,
  isCityStampId,
  knownCityStamps,
} from "./cityStamps";
import { passportCounts } from "./passport";

const LISBON = { city: "lisbon", country: "PT" };
const PARIS = { city: "paris", country: "FR" };

describe("the city list", () => {
  it("knows its own ids only, never an inherited key", () => {
    expect(isCityStampId("new-york")).toBe(true);
    expect(isCityStampId("toString")).toBe(false);
    expect(isCityStampId("__proto__")).toBe(false);
    expect(cityStampKeys("atlantis")).toEqual([]);
  });

  it("drops unknown and repeated stamps", () => {
    expect(
      knownCityStamps([LISBON, { city: "atlantis", country: "XX" }, LISBON]),
    ).toEqual([LISBON]);
  });
});

describe("passportCounts with city stamps", () => {
  it("adds a stamped city and its country, but no place", () => {
    expect(passportCounts([], [LISBON, PARIS])).toEqual({
      places: 0,
      cities: 2,
      countries: 2,
    });
  });

  it("counts a city once when a place there is stamped too, under any of its names", () => {
    expect(
      passportCounts(
        [
          { city: "Lisboa", countryCode: "PT" },
          { city: "Porto", countryCode: "PT" },
        ],
        [LISBON],
      ),
    ).toEqual({ places: 2, cities: 2, countries: 1 });
  });

  it("keeps a same-named city in another country apart from the stamp", () => {
    expect(
      passportCounts([{ city: "Paris", countryCode: "US" }], [PARIS]),
    ).toEqual({ places: 1, cities: 2, countries: 2 });
  });

  it("shows countries once a city stamp brings one, even before place countries arrive", () => {
    expect(passportCounts([{ city: "Porto" }], [PARIS])).toEqual({
      places: 1,
      cities: 2,
      countries: 1,
    });
  });
});

describe("badges with city stamps", () => {
  const five = (["tokyo", "lisbon", "paris", "rome", "seoul"] as const).map(
    (city) => ({ city, country: CITY_STAMP_CITIES[city].country }),
  );

  it("earn City hopper and Passport holder with no place stamped", () => {
    const totals = badgeTotals([], [], five);
    expect(totals.places).toBe(0);
    expect(earnedBadges(totals)).toEqual(["cityHopper", "passportHolder"]);
  });

  it("leave place, category and completion badges alone", () => {
    const totals = badgeTotals(
      [{ city: "Lisbon", countryCode: "PT", kinds: ["coffee"] }],
      [{ stamped: 1, total: 2 }],
      five,
    );
    expect(totals).toMatchObject({
      places: 1,
      coffee: 1,
      completeCities: 0,
      cities: 5,
    });
    expect(earnedBadges(totals)).not.toContain("explorer");
    expect(earnedBadges(totals)).not.toContain("completionist");
  });
});
