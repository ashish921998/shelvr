// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { useMapCitySheet } from "./use-map-city-sheet";

const mock = vi.hoisted(() => ({
  query: { data: undefined as unknown[] | undefined, isPending: true },
  cities: { data: undefined as unknown[] | undefined },
  cityItemsGcTime: undefined as number | undefined,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { fn: string; gcTime?: number }) => {
    if (options.fn === "cities") return mock.cities;
    mock.cityItemsGcTime = options.gcTime;
    return mock.query;
  },
}));
vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (fn: string) => ({ fn }),
}));
vi.mock("@convex/_generated/api", () => ({
  api: { items: { listCityItems: "cityItems", listCities: "cities" } },
}));
vi.mock("react-native-reanimated", () => ({
  useSharedValue: (value: number) => ({ get: () => value, set: vi.fn() }),
  useAnimatedStyle: (style: () => object) => style(),
}));

const layout = { hidden: false, mapHeight: 800, barHeight: 80, insetTop: 0 };

function covered(city: string | undefined, placesOnMap = 1) {
  const { result } = renderHook(() =>
    useMapCitySheet(city, placesOnMap, layout),
  );
  return result.current.sheet;
}

it("keeps room for the sheet while the city's saves load, so the first fit clears it", () => {
  mock.query = { data: undefined, isPending: true };
  const sheet = covered("New York");
  expect(sheet.show).toBe(false);
  expect(sheet.coveredBottom).toBeGreaterThan(layout.barHeight);
});

it("keeps room for the sheet before any city is in view, so framing the first city clears it", () => {
  mock.query = { data: undefined, isPending: true };
  expect(covered(undefined).coveredBottom).toBeGreaterThan(layout.barHeight);
});

it("gives the room back when the city has no saves or the map has no places", () => {
  mock.query = { data: [], isPending: false };
  expect(covered("New York").coveredBottom).toBe(layout.barHeight);
  mock.query = { data: undefined, isPending: true };
  expect(covered(undefined, 0).coveredBottom).toBe(layout.barHeight);
});

it("keeps the sheet's rest point still when its header measures a sub-pixel apart", () => {
  mock.query = { data: [{ _id: "a" }], isPending: false };
  const { result } = renderHook(() => useMapCitySheet("New York", 1, layout));
  act(() => result.current.sheet.onHeaderHeight(89));
  const rest = result.current.sheet.snaps.middle;
  act(() => result.current.sheet.onHeaderHeight(88.99997));
  expect(result.current.sheet.snaps.middle).toBe(rest);
});

it("counts every save in the city, not only the listed ones", () => {
  mock.query = {
    data: [{ _id: "a", placePins: [{ name: "Tigre", lat: 40.7, lng: -74 }] }],
    isPending: false,
  };
  mock.cities = {
    data: [
      { city: "Austin", count: 3, placeCount: 4 },
      { city: "New York", count: 240, placeCount: 310 },
    ],
  };
  const { result } = renderHook(() => useMapCitySheet("new york", 1, layout));
  expect(result.current.saveCount).toBe(240);
  expect(result.current.placeCount).toBe(310);
  mock.cities = { data: undefined };
  const loading = renderHook(() => useMapCitySheet("New York", 1, layout));
  expect(loading.result.current.saveCount).toBe(1);
  expect(loading.result.current.placeCount).toBe(1);
});

it("lets a city the map has left drop its saves query within a minute", () => {
  mock.query = { data: [], isPending: false };
  covered("New York");
  expect(mock.cityItemsGcTime).toBeLessThanOrEqual(60_000);
});
