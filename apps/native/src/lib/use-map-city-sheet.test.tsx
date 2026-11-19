// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { useCityStamps } from "./use-map-city-sheet";

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
vi.mock("react-native-unistyles", () => ({
  useUnistyles: () => ({ theme: { colors: {} } }),
}));

const layout = { hidden: false, mapHeight: 800, barHeight: 80, insetTop: 0 };

function covered(city: string | undefined) {
  const { result } = renderHook(() => useCityStamps(city, [], [], layout));
  return result.current.sheet;
}

it("keeps room for the sheet while the city's saves load, so the first fit clears it", () => {
  mock.query = { data: undefined, isPending: true };
  const sheet = covered("New York");
  expect(sheet.show).toBe(false);
  expect(sheet.coveredBottom).toBeGreaterThan(layout.barHeight);
});

it("gives the room back when the city has no saves or no city is in view", () => {
  mock.query = { data: [], isPending: false };
  expect(covered("New York").coveredBottom).toBe(layout.barHeight);
  mock.query = { data: undefined, isPending: true };
  expect(covered(undefined).coveredBottom).toBe(layout.barHeight);
});
