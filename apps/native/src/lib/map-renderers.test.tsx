// @vitest-environment jsdom
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { forwardRef, useImperativeHandle, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CityMap } from "@/components/city/city-map";
import { TripPlannerMap } from "@/components/trip-planner/trip-planner-map";
import { cityPinId } from "@/lib/city-pins";

const mock = vi.hoisted(() => ({
  props: {} as Record<string, any>,
  opened: [] as Record<string, any>[],
  sheet: {} as Record<string, any>,
  move: vi.fn(async () => {}),
  clear: vi.fn(),
}));
vi.mock("expo-maps", () => ({
  AppleMaps: {
    MapColorScheme: { DARK: "dark", LIGHT: "light" },
    View: forwardRef(function NativeMap(props: Record<string, any>, ref) {
      mock.props = props;
      useState(() => mock.opened.push(props));
      useImperativeHandle(ref, () => ({
        setCameraPosition: mock.move,
        selectMarker: mock.clear,
      }));
      return null;
    }),
  },
  GoogleMaps: { View: vi.fn(() => null) },
}));
vi.mock("@/components/map/map-cluster-sheet", () => ({
  MapClusterSheet: vi.fn((props: Record<string, any>) => {
    mock.sheet = props;
    return null;
  }),
}));
vi.mock("@/components/trip-planner/chip", () => ({
  Chip: vi.fn(({ label, onPress }: { label: string; onPress: () => void }) => (
    <button onClick={onPress}>{label}</button>
  )),
}));
vi.mock("@/lib/analytics", () => ({ analytics: { captureError: vi.fn() } }));
vi.mock("@/lib/appearance", () => ({ isDarkThemeName: () => false }));
vi.mock("@/lib/i18n", () => ({
  useAppLocale: () => "en",
  formattingLocale: () => "en",
  t: (key: string, params?: { count?: number; day?: string }) =>
    key === "homePlaces.spotCount"
      ? `${params?.count} places`
      : key === "trip.dayTab"
        ? `Day ${params?.day}`
        : key,
}));
vi.mock("expo-image", () => ({
  Image: { loadAsync: () => Promise.resolve({ width: 150 }) },
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}), absoluteFillObject: {} },
  useUnistyles: () => ({
    theme: {
      gap: (n: number) => n * 8,
      colors: {
        foreground: "#111111",
        frame: "#ffffff",
        primary: "#ffaa00",
        tripDays: ["#cc3300", "#0000aa"],
      },
    },
    rt: { themeName: "light", screen: { width: 390 }, insets: { top: 0 } },
  }),
}));

const cityPins = [
  {
    itemId: "a",
    name: "Alpha",
    lat: 30.26,
    lng: -97.74,
    kinds: [],
    number: 1,
    emoji: "🍽️",
  },
  {
    itemId: "b",
    name: "Beta",
    lat: 30.261,
    lng: -97.739,
    kinds: [],
    number: 2,
    emoji: "☕",
  },
];
const days = [cityPins, [{ name: "Gamma", lat: 31, lng: -98 }]];

beforeEach(() => {
  vi.stubEnv("EXPO_OS", "ios");
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllEnvs());

it("keeps every city/shared-list place reachable and splits their marker as the map zooms in", () => {
  const select = vi.fn();
  render(
    <CityMap
      pins={cityPins}
      selected={null}
      height={800}
      coveredBottom={400}
      onSelect={select}
    />,
  );
  expect(mock.props.markers).toHaveLength(1);
  act(() => mock.props.onMarkerClick({ id: mock.props.markers[0].id }));
  expect(mock.clear).toHaveBeenCalledWith(undefined);
  expect(mock.sheet.pins.map((pin: { name: string }) => pin.name)).toEqual([
    "Alpha",
    "Beta",
  ]);
  act(() => mock.sheet.onSelect(cityPinId(cityPins[1]!)));
  expect(select).toHaveBeenCalledWith(cityPinId(cityPins[1]!));
  act(() => mock.props.onCameraMove({ zoom: 16 }));
  expect(mock.props.markers.map((pin: { title: string }) => pin.title)).toEqual(
    ["Alpha", "Beta"],
  );
});

it("badges only a visited city place, leaves its pin color alone and still selects it", async () => {
  const select = vi.fn();
  render(
    <CityMap
      pins={cityPins}
      visited={new Set([cityPinId(cityPins[0]!)])}
      selected={null}
      height={800}
      coveredBottom={400}
      onSelect={select}
    />,
  );
  await act(async () => {});
  expect(mock.props.annotations).toEqual([]);
  act(() => mock.props.onCameraMove({ zoom: 16 }));
  const alpha = mock.props.markers.find(
    (marker: { title: string }) => marker.title === "✓ Alpha",
  );
  expect(alpha.tintColor).toBe("#ffffff");
  expect(mock.props.annotations).toEqual([
    expect.objectContaining({
      title: "✓ Alpha",
      coordinates: alpha.coordinates,
      icon: { width: 150 },
    }),
  ]);
  act(() => mock.props.onMarkerClick({ id: alpha.id }));
  expect(select).toHaveBeenCalledWith(cityPinId(cityPins[0]!));
  expect(mock.clear).toHaveBeenCalledWith(undefined);
});

it("clusters trip stops without changing routes, day colours or stop numbers, and focuses a chosen stop", async () => {
  const selectDay = vi.fn();
  render(
    <TripPlannerMap
      days={days}
      stay={undefined}
      activeDay={0}
      height={330}
      onSelectDay={selectDay}
    />,
  );
  act(() => mock.props.onCameraMove({ zoom: 12 }));
  const group = mock.props.markers.find(
    (marker: { monogram: string }) => marker.monogram === "×2",
  );
  expect(group).toMatchObject({ title: "2 places", tintColor: "#cc3300" });
  expect(mock.props.polylines[0].coordinates).toEqual(
    cityPins.map((pin) => ({ latitude: pin.lat, longitude: pin.lng })),
  );
  act(() => mock.props.onMarkerClick({ id: group.id }));
  expect(mock.sheet.pins.map((pin: { name: string }) => pin.name)).toEqual([
    "Day 1 · 1. Alpha",
    "Day 1 · 2. Beta",
  ]);
  act(() => mock.sheet.onSelect("0:1"));
  expect(selectDay).toHaveBeenCalledWith(0);
  await waitFor(() =>
    expect(mock.move).toHaveBeenCalledWith(
      expect.objectContaining({
        coordinates: expect.objectContaining({ longitude: -97.739 }),
      }),
    ),
  );
  act(() => mock.props.onCameraMove({ zoom: 16 }));
  const beta = mock.props.markers.find(
    (marker: { title: string }) => marker.title === "Beta",
  );
  expect(beta).toMatchObject({
    title: "Beta",
    monogram: "2",
    tintColor: "#cc3300",
  });
  mock.clear.mockClear();
  act(() => mock.props.onMarkerClick({ id: beta.id }));
  expect(mock.clear).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "tripPlanner.allDays" }));
  expect(selectDay).toHaveBeenLastCalledWith(null);
});

it("shows the stay and only the selected day's markers and line, then restores the full trip in Overview", () => {
  const tripDays = [
    cityPins,
    [
      { name: "Gamma", lat: 31, lng: -98 },
      { name: "Delta", lat: 31.01, lng: -98.01 },
    ],
  ];
  const map = (activeDay: number | null) => (
    <TripPlannerMap
      days={tripDays}
      stay={{ name: "Hotel", lat: 30.5, lng: -97.9 }}
      activeDay={activeDay}
      height={330}
      onSelectDay={vi.fn()}
      embedded
    />
  );
  const { rerender } = render(map(1));
  act(() => mock.props.onCameraMove({ zoom: 16 }));
  expect(mock.props.cameraPosition.coordinates.latitude).toBeGreaterThan(31);
  expect(mock.props.cameraPosition.zoom).toBeGreaterThan(10);
  expect(mock.props.properties).toEqual({
    pointsOfInterest: { including: [] },
  });
  const places = () =>
    mock.props.markers.map((marker: { coordinates: { longitude: number } }) =>
      Number(marker.coordinates.longitude.toFixed(3)),
    );
  expect(places()).toEqual([-98, -98.01, -97.9]);
  expect(mock.props.polylines.map((line: { id: string }) => line.id)).toEqual([
    "route-1",
  ]);
  rerender(map(null));
  expect(mock.props.properties).toBeUndefined();
  expect(places()).toEqual([-97.74, -97.739, -98, -98.01, -97.9]);
  expect(mock.props.polylines.map((line: { id: string }) => line.id)).toEqual([
    "route-0",
    "route-1",
  ]);
});

it("names every Overview stop on Android, where the marker title is all TalkBack reads", async () => {
  vi.stubEnv("EXPO_OS", "android");
  const { GoogleMaps } = await import("expo-maps");
  render(
    <TripPlannerMap
      days={days}
      stay={undefined}
      activeDay={null}
      height={330}
      onSelectDay={vi.fn()}
    />,
  );
  const markers = vi.mocked(GoogleMaps.View).mock.lastCall?.[0].markers ?? [];
  act(() =>
    vi
      .mocked(GoogleMaps.View)
      .mock.lastCall?.[0].onCameraMove?.({ zoom: 16 } as never),
  );
  const zoomed = vi.mocked(GoogleMaps.View).mock.lastCall?.[0].markers ?? [];
  expect(markers.length).toBeGreaterThan(0);
  expect(zoomed.map((marker) => marker.title)).toEqual([
    "Alpha",
    "Beta",
    "Gamma",
  ]);
});

it("keeps a chosen trip stop in focus after its day's stops are reordered", async () => {
  const map = (stops: typeof cityPins) => (
    <TripPlannerMap
      days={[stops]}
      stay={undefined}
      activeDay={0}
      height={330}
      onSelectDay={vi.fn()}
    />
  );
  const { rerender } = render(map(cityPins));
  act(() => mock.props.onCameraMove({ zoom: 16 }));
  const beta = mock.props.markers.find(
    (marker: { title: string }) => marker.title === "Beta",
  );
  act(() => mock.props.onMarkerClick({ id: beta.id }));
  await waitFor(() =>
    expect(mock.move).toHaveBeenLastCalledWith(
      expect.objectContaining({
        coordinates: expect.objectContaining({ longitude: -97.739 }),
      }),
    ),
  );
  rerender(map([...cityPins].reverse()));
  await waitFor(() =>
    expect(mock.move).toHaveBeenLastCalledWith(
      expect.objectContaining({
        coordinates: expect.objectContaining({ longitude: -97.739 }),
      }),
    ),
  );
  expect(mock.move).not.toHaveBeenLastCalledWith(
    expect.objectContaining({
      coordinates: expect.objectContaining({ longitude: -97.74 }),
    }),
  );
});

it("opens a fresh map on the tapped stop, and another on the whole trip", () => {
  const map = (activeDay: number | null) => (
    <TripPlannerMap
      days={[cityPins]}
      stay={undefined}
      activeDay={activeDay}
      height={330}
      onSelectDay={(day) => rerender(map(day))}
      embedded
    />
  );
  const { rerender } = render(map(null));
  act(() => mock.props.onCameraMove({ zoom: 16 }));
  mock.opened.length = 0;
  const beta = mock.props.markers[1];
  act(() => mock.props.onMarkerClick({ id: beta.id }));
  expect(mock.opened[0]?.cameraPosition.coordinates.longitude).toBeCloseTo(
    -97.739,
    5,
  );
  mock.opened.length = 0;
  rerender(map(null));
  expect(mock.opened[0]?.cameraPosition.coordinates.longitude).toBeCloseTo(
    -97.7395,
    5,
  );
});

it("keeps a tapped pin's balloon where nothing else shows the pick", () => {
  render(
    <CityMap pins={cityPins} selected={null} height={800} coveredBottom={40} />,
  );
  act(() => mock.props.onCameraMove({ zoom: 17 }));
  mock.clear.mockClear();
  act(() => mock.props.onMarkerClick({ id: mock.props.markers[0].id }));
  expect(mock.clear).not.toHaveBeenCalled();
});
