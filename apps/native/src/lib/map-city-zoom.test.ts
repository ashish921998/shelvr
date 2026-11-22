import { expect, it } from "vitest";
import { mapCities } from "./map-cities";
import {
  CITY_ZOOM,
  COUNTRY_ZOOM,
  cityFillingMap,
  flyToCity,
  mapLevel,
  stepUp,
} from "./map-city-zoom";

const lisbon = { lat: 38.72, lng: -9.14, city: "Lisbon" };
const porto = { lat: 41.15, lng: -8.61, city: "Porto" };
const tokyo = { lat: 35.68, lng: 139.7, city: "Tokyo" };
const cities = mapCities([lisbon, porto, tokyo]);

it("names the city only while the camera is close enough for it to fill the map", () => {
  expect(cityFillingMap("Austin", CITY_ZOOM)).toBe("Austin");
  expect(cityFillingMap("Austin", undefined)).toBe("Austin");
  expect(cityFillingMap("Austin", CITY_ZOOM - 1)).toBeUndefined();
  expect(cityFillingMap(undefined, 12)).toBeUndefined();
});

it("reads city, country or world from the camera", () => {
  expect(mapLevel("Lisbon", lisbon, CITY_ZOOM, cities)).toEqual({
    kind: "city",
    city: "Lisbon",
  });
  expect(mapLevel("Lisbon", undefined, undefined, cities).kind).toBe("city");
  expect(mapLevel(undefined, porto, CITY_ZOOM - 1, cities)).toEqual({
    kind: "country",
    country: "PT",
  });
  expect(mapLevel(undefined, porto, COUNTRY_ZOOM - 0.1, cities)).toEqual({
    kind: "world",
  });
  expect(mapLevel(undefined, porto, 4, [])).toEqual({
    kind: "city",
    city: undefined,
  });
});

it("steps from a city to its country, then to every city, then stops", () => {
  const toCountry = stepUp({ kind: "city", city: "lisbon" }, cities);
  expect(toCountry?.to).toEqual({ kind: "country", country: "PT" });
  expect(toCountry?.places.map((place) => place)).toHaveLength(2);
  expect(toCountry?.minZoom).toBe(COUNTRY_ZOOM);
  expect(toCountry!.maxZoom!).toBeLessThan(CITY_ZOOM);
  const toWorld = stepUp({ kind: "country", country: "PT" }, cities);
  expect(toWorld?.to).toEqual({ kind: "world" });
  expect(toWorld?.places).toHaveLength(3);
  expect(toWorld!.maxZoom!).toBeLessThan(COUNTRY_ZOOM);
  expect(stepUp({ kind: "world" }, cities)).toBeUndefined();
});

it("steps a city with no known country straight to every city, and offers nothing off any city", () => {
  const sea = mapCities([lisbon, { lat: 30, lng: -45, city: "Sea" }]);
  expect(stepUp({ kind: "city", city: "Sea" }, sea)?.to).toEqual({
    kind: "world",
  });
  expect(stepUp({ kind: "city" }, cities)).toBeUndefined();
  expect(stepUp({ kind: "city", city: "Lisbon" }, [])).toBeUndefined();
});

it("flies into a city close enough to read as that city", () => {
  const [city] = mapCities([lisbon, { ...lisbon, lat: 38.73 }]);
  expect(flyToCity(city!)).toEqual({
    places: city!.places,
    minZoom: CITY_ZOOM,
  });
});
