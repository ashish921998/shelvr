// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { setMapCityInView, useMapCityInView } from "./map-city-in-view";

afterEach(() => setMapCityInView(undefined));

it("gives the city the map last showed to every reader", () => {
  const first = renderHook(() => useMapCityInView());
  const second = renderHook(() => useMapCityInView());
  expect(first.result.current).toBeUndefined();

  act(() => setMapCityInView("Lisbon"));
  expect(first.result.current).toBe("Lisbon");
  expect(second.result.current).toBe("Lisbon");

  act(() => setMapCityInView(undefined));
  expect(first.result.current).toBeUndefined();
});

it("keeps the city after the map stops listening", () => {
  const map = renderHook(() => useMapCityInView());
  act(() => setMapCityInView("Porto"));
  map.unmount();
  expect(renderHook(() => useMapCityInView()).result.current).toBe("Porto");
});
