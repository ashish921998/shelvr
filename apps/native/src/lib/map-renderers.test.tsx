// @vitest-environment jsdom
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { type ReactNode, forwardRef, useImperativeHandle } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CityMap } from "@/components/city/city-map";
import { TripPlannerMap } from "@/components/trip-planner/trip-planner-map";
import { cityPinId } from "@/lib/city-pins";

const mock = vi.hoisted(() => ({
  props: {} as Record<string, any>,
  sheet: {} as Record<string, any>,
  move: vi.fn(async () => {}),
  clear: vi.fn(),
}));
vi.mock("expo-maps", () => ({
  AppleMaps: {
    MapColorScheme: { DARK: "dark", LIGHT: "light" },
    View: forwardRef(function NativeMap(props: Record<string, any>, ref) {
      mock.props = props;
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
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  ScrollView: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )),
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
  expect(
    mock.props.markers.find((marker: { id: string }) => marker.id === "0:1"),
  ).toMatchObject({ title: "Beta", monogram: "2", tintColor: "#cc3300" });
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
  expect(mock.props.markers.map((marker: { id: string }) => marker.id)).toEqual(
    ["1:0", "1:1", "stay"],
  );
  expect(mock.props.polylines.map((line: { id: string }) => line.id)).toEqual([
    "route-1",
  ]);
  rerender(map(null));
  expect(mock.props.properties).toBeUndefined();
  expect(mock.props.markers.map((marker: { id: string }) => marker.id)).toEqual(
    ["0:0", "0:1", "1:0", "1:1", "stay"],
  );
  expect(mock.props.polylines.map((line: { id: string }) => line.id)).toEqual([
    "route-0",
    "route-1",
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
  act(() => mock.props.onMarkerClick({ id: "0:1" }));
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
