import { describe, expect, it } from "vitest";
import {
  busiestCityPlaces,
  filterPlaces,
  hasPlaceNear,
  mapFilters,
  searchPlaces,
  topSearchResults,
} from "./map-filters";

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

describe("hasPlaceNear", () => {
  const austin = { lat: 30.2672, lng: -97.7431 };
  const chicago = [{ lat: 41.8781, lng: -87.6298 }];

  it("finds a place within reach of the person", () => {
    expect(hasPlaceNear(austin, [...chicago, { lat: 30.4, lng: -97.7 }])).toBe(
      true,
    );
  });

  it("says no when every place is in another city or the location is unknown", () => {
    expect(hasPlaceNear(austin, chicago)).toBe(false);
    expect(hasPlaceNear(undefined, chicago)).toBe(false);
  });
});

describe("searchPlaces", () => {
  const places = [
    { name: "Ramen Tatsu-Ya", city: "Austin" },
    { name: "Café Rue", city: "Paris" },
    { name: "Best Ramen", city: "Chicago" },
    { name: "Le Bar", city: "Paris" },
  ];

  it("matches names and cities, ignoring case and accents, names starting with the query first", () => {
    expect(searchPlaces(places, "ramen").map((p) => p.name)).toEqual([
      "Ramen Tatsu-Ya",
      "Best Ramen",
    ]);
    expect(searchPlaces(places, "cafe").map((p) => p.name)).toEqual([
      "Café Rue",
    ]);
    expect(searchPlaces(places, "paris bar").map((p) => p.name)).toEqual([
      "Le Bar",
    ]);
  });

  it("finds nothing for a blank or unmatched query", () => {
    expect(searchPlaces(places, "  ")).toEqual([]);
    expect(searchPlaces(places, "sushi")).toEqual([]);
  });

  it("lists at most eight results", () => {
    expect(
      topSearchResults(Array.from({ length: 12 }, (_, i) => i)),
    ).toHaveLength(8);
  });
});
