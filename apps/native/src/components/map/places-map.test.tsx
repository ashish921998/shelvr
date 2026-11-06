// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { forwardRef, useImperativeHandle } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { type MapFocus, PlacesMap } from "./places-map";

type Camera = { coordinates: object; zoom: number };

const mock = vi.hoisted(() => ({
  moves: [] as (Camera | "person")[],
  props: {} as Record<string, any>,
}));

vi.mock("expo-maps", () => ({
  AppleMaps: {
    MapColorScheme: { DARK: "dark", LIGHT: "light" },
    PointOfInterestCategory: {
      LANDMARK: "LANDMARK",
      MUSEUM: "MUSEUM",
      CASTLE: "CASTLE",
      FORTRESS: "FORTRESS",
      PARK: "PARK",
    },
    View: forwardRef(function MapView(props: Record<string, any>, ref) {
      mock.props = props;
      useImperativeHandle(ref, () => ({
        setCameraPosition: (camera?: Camera) => {
          mock.moves.push(camera ?? "person");
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
  expect(mock.moves.filter((move) => move !== "person")).toEqual([
    {
      coordinates: {
        latitude: expect.closeTo(30.27, 2),
        longitude: expect.closeTo(-97.73, 2),
      },
      zoom: expect.closeTo(13.8, 1),
    },
  ]);
});

it.each([
  ["ask for their location", { locate: 1 }, "person"],
  [
    "pick a place from search",
    { focus: FOCUS },
    { coordinates: { latitude: 30.27, longitude: -97.73 }, zoom: 15 },
  ],
])(
  "moves only where the person asks once they %s",
  async (_name, person, request) => {
    const { rerender } = render(map());
    await act(() => vi.advanceTimersByTimeAsync(200));
    const before = mock.moves.length;
    rerender(map(person));
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(new Set(mock.moves.slice(before))).toEqual(new Set([request]));
  },
);

it("draws each place as an emoji tile titled with its name, and tapping one selects it", () => {
  const onSelect = vi.fn();
  render(
    <PlacesMap
      pins={[{ ...AUSTIN[0]!, emoji: "🍜" }, AUSTIN[1]!]}
      framed={AUSTIN}
      showsUser={false}
      height={800}
      topInset={100}
      bottomInset={120}
      onSelect={onSelect}
    />,
  );
  expect(mock.props.annotations[0]).toMatchObject({
    id: "a",
    title: "Ramen",
    text: "🍜",
    backgroundColor: "#ffffff",
  });
  expect(mock.props.properties.emphasis).toBe("MUTED");
  act(() => mock.props.onAnnotationClick({ id: "a" }));
  expect(onSelect).toHaveBeenCalledWith("a");
  expect(mock.props.annotations[0].backgroundColor).toBe("#amber");
  expect(mock.props.annotations[1].backgroundColor).toBe("#ffffff");
});

it("flies out to frame every place when asked to zoom out", async () => {
  const far = [...AUSTIN, { id: "c", name: "Bar", lat: 32.78, lng: -96.8 }];
  const { rerender } = render(map());
  await act(() => vi.advanceTimersByTimeAsync(200));
  const before = mock.moves.length;
  rerender(
    <PlacesMap
      pins={AUSTIN}
      framed={AUSTIN}
      overview={far}
      zoomOut={1}
      showsUser
      height={800}
      topInset={100}
      bottomInset={120}
      onSelect={vi.fn()}
    />,
  );
  await act(() => vi.advanceTimersByTimeAsync(200));
  const move = mock.moves.slice(before).find((m) => m !== "person") as Camera;
  expect(move.zoom).toBeLessThan(9);
});
