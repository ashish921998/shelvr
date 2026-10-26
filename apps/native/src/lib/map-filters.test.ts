import { describe, expect, it } from "vitest";
import { busiestCityPlaces, filterPlaces, mapFilters } from "./map-filters";

const place = (kinds: string[], city?: string) => ({ kinds, city });

describe("mapFilters", () => {
  it("offers only the kinds with three or more places, most places first", () => {
    const places = [
      place(["coffee", "dessert"]),
      place(["coffee"]),
      place(["coffee", "dateNight"]),
      place(["dessert", "dateNight"]),
      place(["dessert", "dateNight"]),
      place(["dessert"]),
      place(["food"]),
      place(["food"]),
    ];
    expect(mapFilters(places)).toEqual([
      { kind: "dessert", count: 4 },
      { kind: "coffee", count: 3 },
      { kind: "dateNight", count: 3 },
    ]);
  });

  it("skips a kind this build has no label for and counts a place once per kind", () => {
    const places = [place(["rooftop", "drinks", "drinks"])];
    expect(mapFilters([...places, ...places, ...places])).toEqual([
      { kind: "drinks", count: 3 },
    ]);
  });
});

describe("filterPlaces", () => {
  it("shows everything for All and only matching places for a kind", () => {
    const places = [place(["food"]), place(["coffee"])];
    expect(filterPlaces(places, null)).toEqual(places);
    expect(filterPlaces(places, "coffee")).toEqual([places[1]]);
  });
});

describe("busiestCityPlaces", () => {
  it("frames the city with the most places, ignoring spelling", () => {
    const places = [
      place([], "Paris"),
      place([], "austin"),
      place([], "Austin"),
      place([]),
    ];
    expect(busiestCityPlaces(places)).toEqual([places[1], places[2]]);
  });

  it("frames every place when none has a city", () => {
    const places = [place([]), place([])];
    expect(busiestCityPlaces(places)).toEqual(places);
  });
});
