// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { forwardRef, useImperativeHandle } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { type MapFocus, PlacesMap } from "./places-map";

type Camera = { coordinates: object; zoom: number };

const mock = vi.hoisted(() => ({
  moves: [] as (Camera | "person")[],
  props: {} as Record<string, any>,
  cluster: {} as Record<string, any>,
  clearSelection: vi.fn(),
}));

vi.mock("./map-cluster-sheet", () => ({
  MapClusterSheet: vi.fn((props: Record<string, any>) => {
    mock.cluster = props;
    return null;
  }),
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
        selectMarker: mock.clearSelection,
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
    theme: { colors: { primary: "#amber", frame: "#ffffff" } },
    rt: { themeName: "light", screen: { width: 390 } },
  }),
}));
vi.mock("@/lib/appearance", () => ({ isDarkThemeName: () => false }));
vi.mock("@/lib/analytics", () => ({ analytics: { captureError: vi.fn() } }));
vi.mock("@/lib/i18n", () => ({
  formattingLocale: () => "en",
  useAppLocale: () => "en",
  t: (_key: string, { count }: { count: number }) => `${count} places`,
}));

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
  mock.clearSelection.mockClear();
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

it("uses native markers to declutter nearby places, keeping their emoji, title and selection", () => {
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
  act(() =>
    mock.props.onCameraMove({
      coordinates: { latitude: 30.27, longitude: -97.73 },
      zoom: 14,
    }),
  );
  expect(mock.props.annotations).toBeUndefined();
  expect(mock.props.markers[0]).toMatchObject({
    id: "a",
    title: "Ramen",
    monogram: "🍜",
    tintColor: "#ffffff",
  });
  expect(mock.props.properties.emphasis).toBe("MUTED");
  act(() => mock.props.onMarkerClick({ id: "a" }));
  expect(onSelect).toHaveBeenCalledWith("a");
  expect(mock.props.markers[0].tintColor).toBe("#amber");
  expect(mock.props.markers[1].tintColor).toBe("#ffffff");
});

it("keeps all nearby places reachable through the count marker's picker", () => {
  const onSelect = vi.fn();
  render(
    <PlacesMap
      pins={AUSTIN}
      framed={AUSTIN}
      showsUser={false}
      height={800}
      topInset={100}
      bottomInset={120}
      onSelect={onSelect}
    />,
  );
  expect(mock.props.markers).toHaveLength(1);
  expect(mock.props.markers[0]).toMatchObject({
    title: "2 places",
    monogram: "2",
  });
  act(() => mock.props.onMarkerClick({ id: mock.props.markers[0].id }));
  expect(mock.clearSelection).toHaveBeenCalledWith(undefined);
  expect(mock.cluster.pins.map((pin: { id: string }) => pin.id)).toEqual([
    "a",
    "b",
  ]);
  expect(onSelect).not.toHaveBeenCalled();
  act(() => mock.cluster.onSelect("b"));
  expect(onSelect).toHaveBeenCalledWith("b");
  act(() => mock.cluster.onClose());
  expect(mock.cluster.pins).toEqual([]);
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
  const centre = move.coordinates as { latitude: number; longitude: number };
  expect(centre.latitude).toBeGreaterThan(30.28);
  expect(centre.latitude).toBeLessThan(32.78);
  expect(centre.longitude).toBeGreaterThan(-97.74);
  expect(centre.longitude).toBeLessThan(-96.8);
});
