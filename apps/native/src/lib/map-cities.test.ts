import { expect, it } from "vitest";
import { cityCounts, countryAt, mapCities, nearestCity } from "./map-cities";

const lisbon = { lat: 38.72, lng: -9.14, city: "Lisbon" };
const porto = { lat: 41.15, lng: -8.61, city: "Porto" };
const tokyo = { lat: 35.68, lng: 139.7, city: "Tokyo" };

it("finds the country a place lies in, offline", () => {
  expect(countryAt({ lat: 40.75, lng: -73.98 })).toBe("US");
  expect(countryAt(lisbon)).toBe("PT");
  expect(countryAt(tokyo)).toBe("JP");
  expect(countryAt({ lat: 30, lng: -45 })).toBeUndefined();
});

it("groups places by city, whatever the spelling, and skips places with no city", () => {
  const cities = mapCities([
    lisbon,
    { ...lisbon, lng: -9.15, city: " lisbon " },
    { ...lisbon, lat: 38.73 },
    tokyo,
    { lat: 1, lng: 1 },
  ]);
  expect(cities.map((city) => [city.key, city.name, city.country])).toEqual([
    ["lisbon", "Lisbon", "PT"],
    ["tokyo", "Tokyo", "JP"],
  ]);
  expect(cities[0]!.places).toHaveLength(3);
  expect(cities[0]!.lat).toBeCloseTo(38.7233, 3);
});

it("gives a city the country most of its places are in", () => {
  const countries: Record<number, string> = { 1: "PT", 2: "PT", 3: "ES" };
  const [city] = mapCities(
    [1, 2, 3].map((lat) => ({ lat, lng: 0, city: "Elvas" })),
    (place) => countries[place.lat],
  );
  expect(city!.country).toBe("PT");
  const [unknown] = mapCities(
    [{ lat: 1, lng: 0, city: "Sea" }],
    () => undefined,
  );
  expect(unknown!.country).toBeUndefined();
});

it("picks the nearest city at any distance", () => {
  const cities = mapCities([lisbon, porto, tokyo]);
  expect(nearestCity(cities, { lat: 40, lng: -8 })?.name).toBe("Porto");
  expect(nearestCity(cities, { lat: 20, lng: 120 })?.name).toBe("Tokyo");
  expect(nearestCity([], { lat: 0, lng: 0 })).toBeUndefined();
});

it("counts the places each city shows, dropping cities with none", () => {
  const cities = mapCities([lisbon, porto, tokyo]);
  expect(
    cityCounts(cities, [lisbon, lisbon, { ...tokyo, city: "TOKYO" }, {}]).map(
      ({ city, count }) => [city.name, count],
    ),
  ).toEqual([
    ["Lisbon", 2],
    ["Tokyo", 1],
  ]);
});
