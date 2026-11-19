// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { useMapCitySheet } from "./use-map-city-sheet";

const mock = vi.hoisted(() => ({
  query: { data: undefined as unknown[] | undefined, isPending: true },
}));

vi.mock("@tanstack/react-query", () => ({ useQuery: () => mock.query }));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: vi.fn() }));
vi.mock("@convex/_generated/api", () => ({ api: { items: {} } }));
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
