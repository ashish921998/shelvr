import { expect, it } from "vitest";
import { canShowAllCities, cityFillingMap, CITY_ZOOM } from "./map-city-zoom";

it("names the city only while the camera is close enough for it to fill the map", () => {
  expect(cityFillingMap("Austin", CITY_ZOOM)).toBe("Austin");
  expect(cityFillingMap("Austin", undefined)).toBe("Austin");
  expect(cityFillingMap("Austin", CITY_ZOOM - 1)).toBeUndefined();
  expect(cityFillingMap(undefined, 12)).toBeUndefined();
});

it("offers the way back only with a city on screen and places outside it", () => {
  const austin = { city: "Austin" };
  const dallas = { city: " dallas " };
  expect(canShowAllCities("Austin", [austin, austin])).toBe(false);
  expect(canShowAllCities("Austin", [austin, dallas])).toBe(true);
  expect(canShowAllCities("Austin", [dallas])).toBe(true);
  expect(canShowAllCities("Austin", [austin, {}])).toBe(false);
  expect(canShowAllCities(undefined, [austin, dallas])).toBe(false);
});
