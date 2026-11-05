// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { forwardRef, useImperativeHandle } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { type MapFocus, PlacesMap } from "./places-map";

type Camera = { coordinates: object; zoom: number };

const mock = vi.hoisted(() => ({ moves: [] as (Camera | undefined)[] }));

vi.mock("expo-maps", () => ({
  AppleMaps: {
    MapColorScheme: { DARK: "dark", LIGHT: "light" },
    View: forwardRef(function MapView(_props: object, ref) {
      useImperativeHandle(ref, () => ({
        setCameraPosition: (camera?: Camera) => {
          mock.moves.push(camera);
          return camera
            ? Promise.resolve()
            : Promise.reject(new Error("no location yet"));
        },
      }));
      return null;
    }),
  },
  GoogleMaps: { View: vi.fn(() => null) },
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}), absoluteFillObject: {} },
  useUnistyles: () => ({
    theme: { colors: { primary: "#amber" } },
    rt: { themeName: "light", screen: { width: 390 } },
  }),
}));
vi.mock("@/lib/appearance", () => ({ isDarkThemeName: () => false }));
vi.mock("@/lib/analytics", () => ({ analytics: { captureError: vi.fn() } }));
vi.mock("@/lib/i18n", () => ({ formattingLocale: () => "en" }));

const AUSTIN = [
  { id: "a", name: "Ramen", lat: 30.26, lng: -97.74 },
  { id: "b", name: "Tacos", lat: 30.28, lng: -97.72 },
];
const FOCUS: MapFocus = { lat: 30.27, lng: -97.73, key: 1 };

function map(person: { locate?: number; focus?: MapFocus } = {}) {
  return (
    <PlacesMap
      pins={AUSTIN}
      framed={AUSTIN}
      showsUser
      height={800}
      topInset={100}
      bottomInset={120}
      onSelect={vi.fn()}
      {...person}
    />
  );
}

const placedMoves = () => mock.moves.filter((camera) => camera !== undefined);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("EXPO_OS", "ios");
  mock.moves = [];
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it("shows the busiest city when it cannot find the person", async () => {
  render(map());
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(placedMoves()).toHaveLength(1);
});

it.each([
  ["asks for their location", { locate: 1 }, []],
  [
    "picks a place from search",
    { focus: FOCUS },
    [{ coordinates: { latitude: 30.27, longitude: -97.73 }, zoom: 15 }],
  ],
])(
  "never pulls the camera to the city after the person %s",
  async (_name, person, moves) => {
    const { rerender } = render(map());
    await act(() => vi.advanceTimersByTimeAsync(200));
    rerender(map(person));
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(placedMoves()).toEqual(moves);
  },
);
