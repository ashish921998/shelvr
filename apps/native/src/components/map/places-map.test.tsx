// @vitest-environment jsdom
import { act, fireEvent, render } from "@testing-library/react";
import { forwardRef, type ReactNode, useImperativeHandle } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { type MapFocus, PlacesMap } from "./places-map";

type Camera = { coordinates: object; zoom: number };

const mock = vi.hoisted(() => ({
  moveToPlace: vi.fn(() => Promise.resolve()),
  moves: [] as (Camera | "person")[],
  props: {} as Record<string, any>,
  cluster: {} as Record<string, any>,
  stampSheet: {} as Record<string, any>,
  covers: new Map<string, string>(),
  painted: true,
  selectAnnotation: vi.fn(),
  clearSelection: vi.fn(),
  findsPerson: false,
}));

vi.mock("./map-cluster-sheet", () => ({
  MapClusterSheet: vi.fn((props: Record<string, any>) => {
    if (props.title) mock.stampSheet = props;
    else mock.cluster = props;
    return null;
  }),
}));
vi.mock("@/lib/stamp-icons", () => ({
  useStampCovers: () => mock.covers,
  useStampIcons: () => () => (mock.painted ? "stamp-icon" : undefined),
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
        selectAnnotation: mock.selectAnnotation,
        setCameraPosition: (camera?: Camera) => {
          mock.moves.push(camera ?? "person");
          if (camera) return mock.moveToPlace();
          return mock.findsPerson
            ? Promise.resolve()
            : Promise.reject(new Error("no location yet"));
        },
      }));
      return null;
    }),
  },
  GoogleMaps: { View: vi.fn(() => null) },
}));
vi.mock("react-native", () => ({
  View: vi.fn(
    ({
      children,
      onTouchStart,
    }: {
      children: ReactNode;
      onTouchStart?: () => void;
    }) => (
      <div data-testid="map-touch" onTouchStart={onTouchStart}>
        {children}
      </div>
    ),
  ),
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
  t: (key: string, { count }: { count?: number } = {}) =>
    key === "trip.revealSaves" ? `${count} saves` : `${count} places`,
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
  mock.findsPerson = false;
  mock.clearSelection.mockClear();
  mock.selectAnnotation.mockClear();
  mock.covers = new Map();
  mock.painted = true;
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

it.each([false, true])(
  "keeps the current area when a filter matches another city, with opening location=%s",
  async (showsUser) => {
    const sanFrancisco = [{ id: "sf", name: "Park", lat: 37.77, lng: -122.43 }];
    const all = [...sanFrancisco, ...AUSTIN];
    const onSelect = vi.fn();
    const renderMap = (
      pins: typeof all,
      framed: typeof all,
      filterRevision = 0,
    ) => (
      <PlacesMap
        pins={pins}
        framed={framed}
        showsUser={showsUser}
        height={800}
        topInset={100}
        bottomInset={120}
        onSelect={onSelect}
        filterRevision={filterRevision}
      />
    );
    const { rerender } = render(renderMap(all, sanFrancisco));
    await act(() => vi.advanceTimersByTimeAsync(200));
    act(() =>
      mock.props.onCameraMove({
        coordinates: { latitude: 37.77, longitude: -122.43 },
        zoom: 14,
      }),
    );
    const before = mock.moves.length;
    const initialCamera = mock.props.cameraPosition;

    rerender(renderMap(AUSTIN, AUSTIN, 1));
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(mock.moves.slice(before)).toEqual([]);
    expect(mock.props.cameraPosition).toBe(initialCamera);

    rerender(renderMap(all, sanFrancisco, 2));
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(mock.moves.slice(before)).toEqual([]);
  },
);

it("keeps initial saved-city positioning when loaded visits refresh the places", async () => {
  const { rerender } = render(map());
  await act(() => vi.advanceTimersByTimeAsync(200));
  const refreshed = AUSTIN.map((pin) => ({ ...pin }));
  rerender(
    <PlacesMap
      pins={refreshed}
      framed={refreshed}
      showsUser
      height={800}
      topInset={100}
      bottomInset={120}
      onSelect={vi.fn()}
    />,
  );
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(mock.moves.filter((move) => move !== "person")).toEqual([
    expect.objectContaining({
      coordinates: {
        latitude: expect.closeTo(30.27, 2),
        longitude: expect.closeTo(-97.73, 2),
      },
    }),
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
  expect(mock.props.annotations).toEqual([]);
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

it("frames the first saved places once when the map opened empty without location", async () => {
  const noLocation = (pins: typeof AUSTIN, bottomInset = 120) => (
    <PlacesMap
      pins={pins}
      framed={pins}
      showsUser={false}
      height={800}
      topInset={100}
      bottomInset={bottomInset}
      onSelect={vi.fn()}
    />
  );
  const { rerender } = render(noLocation([]));
  expect(mock.props.cameraPosition).toBeUndefined();
  mock.moveToPlace.mockRejectedValueOnce(new Error("map is mounting"));
  rerender(noLocation(AUSTIN));
  await act(() => vi.advanceTimersByTimeAsync(10));
  rerender(noLocation(AUSTIN, 170));
  await act(() => vi.advanceTimersByTimeAsync(200));
  expect(mock.moves).toHaveLength(2);
  expect(mock.moves[1]).not.toEqual(mock.moves[0]);
  rerender(noLocation(AUSTIN.slice(0, 1)));
  await act(() => vi.advanceTimersByTimeAsync(200));
  expect(mock.moves).toHaveLength(2);
});

it.each([
  ["far from the person", AUSTIN, 1],
  ["near the person", [{ id: "c", name: "Chai", lat: 28.61, lng: 77.21 }], 0],
])(
  "frames places that arrive %s after the map opened on them with none",
  async (_name, arrived, framedMoves) => {
    mock.findsPerson = true;
    const located = (pins: typeof AUSTIN) => (
      <PlacesMap
        pins={pins}
        framed={pins}
        showsUser
        height={800}
        topInset={100}
        bottomInset={120}
        onSelect={vi.fn()}
      />
    );
    const { rerender } = render(located([]));
    await act(() => vi.advanceTimersByTimeAsync(10));
    act(() =>
      mock.props.onCameraMove({
        coordinates: { latitude: 28.6, longitude: 77.2 },
        zoom: 13,
      }),
    );
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(mock.moves).toEqual(["person"]);
    rerender(located(arrived));
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(
      mock.moves.slice(1).filter((move) => move !== "person"),
    ).toHaveLength(framedMoves);
    rerender(located([...arrived, ...AUSTIN]));
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(mock.moves.slice(1)).toHaveLength(framedMoves);
  },
);

it("keeps the area the person panned to when their first places arrive", async () => {
  mock.findsPerson = true;
  const located = (pins: typeof AUSTIN) => (
    <PlacesMap
      pins={pins}
      framed={pins}
      showsUser
      height={800}
      topInset={100}
      bottomInset={120}
      onSelect={vi.fn()}
    />
  );
  const pan = (latitude: number, longitude: number) =>
    act(() =>
      mock.props.onCameraMove({
        coordinates: { latitude, longitude },
        zoom: 13,
      }),
    );
  const { getByTestId, rerender } = render(located([]));
  await act(() => vi.advanceTimersByTimeAsync(10));
  pan(28.6, 77.2);
  await act(() => vi.advanceTimersByTimeAsync(5000));
  fireEvent.touchStart(getByTestId("map-touch"));
  pan(19.07, 72.88);
  rerender(located(AUSTIN));
  await act(() => vi.advanceTimersByTimeAsync(200));
  expect(mock.moves).toEqual(["person"]);
});

it("frames the first places when the map moved without the person touching it", async () => {
  mock.findsPerson = true;
  const located = (pins: typeof AUSTIN) => (
    <PlacesMap
      pins={pins}
      framed={pins}
      showsUser
      height={800}
      topInset={100}
      bottomInset={120}
      onSelect={vi.fn()}
    />
  );
  const { rerender } = render(located([]));
  await act(() => vi.advanceTimersByTimeAsync(5000));
  act(() =>
    mock.props.onCameraMove({
      coordinates: { latitude: 0.4, longitude: 0.2 },
      zoom: 13,
    }),
  );
  rerender(located(AUSTIN));
  await act(() => vi.advanceTimersByTimeAsync(200));
  expect(mock.moves).toEqual([
    "person",
    {
      coordinates: {
        latitude: expect.closeTo(30.27, 2),
        longitude: expect.closeTo(-97.73, 2),
      },
      zoom: expect.any(Number),
    },
  ]);
});

it("keeps the chosen area when location access is turned off later", async () => {
  const { rerender } = render(map());
  await act(() => vi.advanceTimersByTimeAsync(5000));
  const before = mock.moves.length;
  rerender(
    <PlacesMap
      pins={AUSTIN}
      framed={AUSTIN}
      showsUser={false}
      height={800}
      topInset={100}
      bottomInset={120}
      onSelect={vi.fn()}
    />,
  );
  await act(() => vi.advanceTimersByTimeAsync(200));
  expect(mock.moves.slice(before)).toEqual([]);
});

const reel = (itemId: string, newest: number, lng = -97.74) => ({
  id: `stamp:${itemId}`,
  itemId,
  lat: 30.26,
  lng,
  cover: `https://cdn.example/${itemId}.jpg`,
  count: 2,
  title: itemId,
  places: [`${itemId}:30.26:${lng}`],
  pins: [{ name: itemId, lat: 30.26, lng }],
  newest,
});

function loaded(...itemIds: string[]) {
  mock.covers = new Map(
    itemIds.map((itemId) => [`https://cdn.example/${itemId}.jpg`, itemId]),
  );
}

it("opens a lone reel's save from its stamp", () => {
  loaded("tacos");
  const onSelectStamp = vi.fn();
  render(
    <PlacesMap
      pins={AUSTIN}
      framed={AUSTIN}
      showsUser
      height={800}
      topInset={100}
      bottomInset={120}
      onSelect={vi.fn()}
      stamps={[reel("tacos", 1)]}
      stampColors={{ frame: "#fff", badge: "#000", onBadge: "#fff" }}
      onSelectStamp={onSelectStamp}
    />,
  );
  expect(mock.props.annotations).toEqual([
    expect.objectContaining({ id: "stamp:tacos", icon: "stamp-icon" }),
  ]);
  act(() => mock.props.onAnnotationClick({ id: "stamp:tacos" }));
  expect(onSelectStamp).toHaveBeenCalledWith("tacos");
  expect(mock.selectAnnotation).toHaveBeenCalledWith(undefined);
});

it("keeps a reel's first place as a dot until its stamp is drawn", () => {
  const place = { id: "p", name: "tacos", lat: 30.26, lng: -97.74 };
  const renderMap = () => (
    <PlacesMap
      pins={[place]}
      framed={[place]}
      showsUser
      height={800}
      topInset={100}
      bottomInset={120}
      onSelect={vi.fn()}
      stamps={[reel("tacos", 1)]}
      stampColors={{ frame: "#fff", badge: "#000", onBadge: "#fff" }}
    />
  );
  const { rerender } = render(renderMap());
  expect(mock.props.annotations).toEqual([]);
  expect(mock.props.markers.map((marker: { id: string }) => marker.id)).toEqual(
    ["p"],
  );
  loaded("tacos");
  mock.painted = false;
  rerender(renderMap());
  expect(mock.props.annotations).toEqual([]);
  expect(mock.props.markers.map((marker: { id: string }) => marker.id)).toEqual(
    ["p"],
  );
  mock.painted = true;
  rerender(renderMap());
  expect(mock.props.annotations).toHaveLength(1);
  expect(mock.props.markers).toEqual([]);
});

it("lists stamped reels too close to tell apart, newest first, and opens the one picked", () => {
  loaded("old", "new");
  const onSelectStamp = vi.fn();
  render(
    <PlacesMap
      pins={AUSTIN}
      framed={AUSTIN}
      showsUser
      height={800}
      topInset={100}
      bottomInset={120}
      onSelect={vi.fn()}
      stamps={[reel("old", 1), reel("new", 2, -97.7401)]}
      stampColors={{ frame: "#fff", badge: "#000", onBadge: "#fff" }}
      onSelectStamp={onSelectStamp}
    />,
  );
  expect(mock.props.annotations).toHaveLength(1);
  act(() => mock.props.onAnnotationClick({ id: mock.props.annotations[0].id }));
  expect(onSelectStamp).not.toHaveBeenCalled();
  expect(mock.stampSheet.title).toBe("2 saves");
  expect(mock.stampSheet.pins.map((pin: { id: string }) => pin.id)).toEqual([
    "new",
    "old",
  ]);
  act(() => mock.stampSheet.onSelect("old"));
  expect(onSelectStamp).toHaveBeenCalledWith("old");
});
