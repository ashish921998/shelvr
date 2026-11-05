// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useMapCity } from "./use-map-city";

const places = [
  { lat: 38.72, lng: -9.14, city: "Lisbon" },
  { lat: 38.71, lng: -9.13, city: "Lisbon" },
  { lat: 41.15, lng: -8.61, city: "Porto" },
];

describe("useMapCity", () => {
  it("names the busiest city before the map reports where it is", () => {
    const { result } = renderHook(() => useMapCity(places));
    expect(result.current.city).toBe("Lisbon");
  });

  it("names the city whose places are in view as the map moves", () => {
    const { result } = renderHook(() => useMapCity(places));
    act(() => result.current.onCentreChange({ lat: 41.14, lng: -8.6 }));
    expect(result.current.city).toBe("Porto");
  });

  it("names no city once the map is far from every saved place", () => {
    const { result } = renderHook(() => useMapCity(places));
    act(() => result.current.onCentreChange({ lat: 40.42, lng: -3.7 }));
    expect(result.current.city).toBeUndefined();
    act(() => result.current.onCentreChange({ lat: 38.72, lng: -9.14 }));
    expect(result.current.city).toBe("Lisbon");
  });

  it("renames the city when the places under a still map change", () => {
    const { result, rerender } = renderHook(({ saved }) => useMapCity(saved), {
      initialProps: { saved: places },
    });
    act(() => result.current.onCentreChange({ lat: 41.14, lng: -8.6 }));
    expect(result.current.city).toBe("Porto");
    rerender({ saved: places.filter((place) => place.city !== "Porto") });
    expect(result.current.city).toBeUndefined();
    rerender({ saved: places });
    expect(result.current.city).toBe("Porto");
  });
});
