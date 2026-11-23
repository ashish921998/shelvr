// @vitest-environment jsdom
import { act, fireEvent, render } from "@testing-library/react";
import { forwardRef, type ReactNode, useImperativeHandle } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MapBox } from "@/lib/discover-area";
import type { Opening, StoredView } from "@/lib/map-opening";
import { writeLastView } from "@/lib/map-opening-store";

import { type MapFocus, type MapFrame, PlacesMap } from "./places-map";

type Camera = { coordinates: object; zoom: number };

const mock = vi.hoisted(() => ({
  moveToPlace: vi.fn(() => Promise.resolve()),
  moves: [] as (Camera | "person")[],
  props: {} as Record<string, any>,
  cluster: {} as Record<string, any>,
  clearSelection: vi.fn(),
  findsPerson: false,
}));

vi.mock("@/lib/map-opening-store", () => ({ writeLastView: vi.fn() }));

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
vi.mock("expo-image", () => ({
  Image: { loadAsync: () => Promise.resolve({ width: 150 }) },
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
  t: (key: string, { count, name }: { count?: number; name?: string } = {}) =>
    key === "mapSheet.groupTitle" ? `${name} +${count}` : `${count} places`,
}));

const saved = vi.mocked(writeLastView);

function openingFor(showsUser: boolean, framed: readonly unknown[]): Opening {
  if (showsUser) return { kind: "person" };
  return { kind: framed.length > 0 ? "fit" : "default" };
}

const AUSTIN = [
  { id: "a", name: "Ramen", lat: 30.26, lng: -97.74 },
  { id: "b", name: "Tacos", lat: 30.28, lng: -97.72 },
];
const FOCUS: MapFocus = { lat: 30.27, lng: -97.73, key: 1 };

function map(
  person: {
    locate?: number;
    focus?: MapFocus;
    frame?: MapFrame;
    showsUser?: boolean;
    bottomInset?: number;
    searchOpen?: boolean;
    opening?: Opening;
  } = {},
) {
  return (
    <PlacesMap
      opening={person.opening ?? openingFor(person.showsUser ?? true, AUSTIN)}
      areaPartial={false}
      onArea={vi.fn()}
      pins={AUSTIN}
      anchors={AUSTIN}
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
  saved.mockClear();
  mock.findsPerson = false;
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
        opening={openingFor(showsUser, framed)}
        areaPartial={false}
        onArea={vi.fn()}
        pins={pins}
        anchors={pins}
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
      opening={openingFor(true, refreshed)}
      areaPartial={false}
      onArea={vi.fn()}
      pins={refreshed}
      anchors={refreshed}
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
      opening={openingFor(false, AUSTIN)}
      areaPartial={false}
      onArea={vi.fn()}
      pins={[{ ...AUSTIN[0]!, emoji: "🍜" }, AUSTIN[1]!]}
      anchors={AUSTIN}
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
    title: "Ramen",
    monogram: "🍜",
    tintColor: "#ffffff",
  });
  expect(mock.props.properties.emphasis).toBe("MUTED");
  act(() => mock.props.onMarkerClick({ id: mock.props.markers[0].id }));
  expect(onSelect).toHaveBeenCalledWith("a");
  expect(mock.clearSelection).toHaveBeenCalledWith(undefined);
  expect(mock.props.markers[0].tintColor).toBe("#amber");
  expect(mock.props.markers[1].tintColor).toBe("#ffffff");
});

it("replaces a marker whose own color changes, so a hidden map paints it, but not one that is only picked", () => {
  const onSelect = vi.fn();
  const colored = (tintColor?: string) => (
    <PlacesMap
      opening={openingFor(false, AUSTIN)}
      areaPartial={false}
      onArea={vi.fn()}
      pins={[{ ...AUSTIN[0]!, tintColor }]}
      anchors={AUSTIN}
      framed={AUSTIN}
      showsUser={false}
      height={800}
      topInset={100}
      bottomInset={120}
      onSelect={onSelect}
    />
  );
  const { rerender } = render(colored());
  const white = mock.props.markers[0].id;
  rerender(colored("#muted"));
  const muted = mock.props.markers[0].id;
  expect(muted).not.toBe(white);
  act(() => mock.props.onMarkerClick({ id: muted }));
  expect(onSelect).toHaveBeenCalledWith("a");
  expect(mock.props.markers[0]).toMatchObject({
    id: muted,
    tintColor: "#amber",
  });
  rerender(colored());
  expect(mock.props.markers[0].id).toBe(white);
});

it("draws nearby places as one place pin named after the first and keeps them all reachable", () => {
  const onSelect = vi.fn();
  render(
    <PlacesMap
      opening={openingFor(false, AUSTIN)}
      areaPartial={false}
      onArea={vi.fn()}
      pins={AUSTIN}
      anchors={AUSTIN}
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
    title: "Ramen +1",
    tintColor: "#ffffff",
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

it("flies to a shared city's places once for each save", async () => {
  const NYC = [
    { lat: 40.71, lng: -74.0 },
    { lat: 40.76, lng: -73.98 },
  ];
  const { rerender } = render(map());
  await act(() => vi.advanceTimersByTimeAsync(200));
  const before = mock.moves.length;
  rerender(map({ frame: { key: "save-1", places: NYC } }));
  await act(() => vi.advanceTimersByTimeAsync(200));
  const moves = mock.moves.slice(before).filter((m) => m !== "person");
  expect(moves).toHaveLength(1);
  const centre = (moves[0] as Camera).coordinates as {
    latitude: number;
    longitude: number;
  };
  expect(centre.latitude).toBeGreaterThan(40.71);
  expect(centre.latitude).toBeLessThan(40.76);
  const refreshed = mock.moves.length;
  rerender(map({ frame: { key: "save-1", places: [...NYC] } }));
  await act(() => vi.advanceTimersByTimeAsync(200));
  expect(mock.moves.length).toBe(refreshed);
  rerender(map({ frame: { key: "save-2", places: NYC } }));
  await act(() => vi.advanceTimersByTimeAsync(200));
  expect(mock.moves.length).toBe(refreshed + 1);
});

it.each([
  ["as the Map opens", true],
  ["after the Map framed the saved places", false],
])(
  "stays on a city shared %s when the space under the map grows",
  async (_name, sharedAtOpen) => {
    const shared: MapFrame = {
      key: "save-1",
      places: [{ lat: 40.71, lng: -74.0 }],
    };
    const opened = (bottomInset: number, frame?: MapFrame) =>
      map({ showsUser: false, bottomInset, frame });
    const { rerender } = render(opened(120, sharedAtOpen ? shared : undefined));
    rerender(opened(120, shared));
    await act(() => vi.advanceTimersByTimeAsync(200));
    rerender(opened(320, shared));
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(mock.moves).toEqual([
      expect.objectContaining({
        coordinates: {
          latitude: expect.closeTo(40.71, 0),
          longitude: expect.closeTo(-74, 0),
        },
      }),
    ]);
  },
);

it("stays on the person who turned location on when the space under the map grows", async () => {
  mock.findsPerson = true;
  const { rerender } = render(map({ showsUser: false, bottomInset: 120 }));
  rerender(map({ showsUser: true, bottomInset: 120 }));
  act(() =>
    mock.props.onCameraMove({
      coordinates: { latitude: 30.26, longitude: -97.74 },
      zoom: 14,
    }),
  );
  await act(() => vi.advanceTimersByTimeAsync(5000));
  rerender(map({ showsUser: true, bottomInset: 320 }));
  await act(() => vi.advanceTimersByTimeAsync(200));
  expect(mock.moves).toEqual(["person"]);
});

it.each([
  ["refits to a taller strip", undefined, 2, 30.2],
  [
    "stays on a shared city",
    { key: "save-1", places: [{ lat: 40.71, lng: -74.0 }] },
    2,
    40.71,
  ],
])(
  "%s that arrives before the first framing finishes",
  async (_name, frame, moves, latitude) => {
    const opened = (framed: typeof AUSTIN, bottom: number, at?: MapFrame) => (
      <PlacesMap
        opening={openingFor(false, framed)}
        areaPartial={false}
        onArea={vi.fn()}
        pins={framed}
        framed={framed}
        anchors={framed}
        showsUser={false}
        height={800}
        topInset={100}
        bottomInset={bottom}
        frame={at}
        onSelect={vi.fn()}
      />
    );
    const { rerender } = render(opened([], 120));
    let finish = () => {};
    mock.moveToPlace.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    rerender(opened(AUSTIN, 120));
    rerender(opened(AUSTIN, frame ? 120 : 320, frame));
    await act(async () => finish());
    rerender(opened(AUSTIN, 320, frame));
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(mock.moves).toHaveLength(moves);
    const last = mock.moves.at(-1) as Camera & {
      coordinates: { latitude: number };
    };
    expect(last.coordinates.latitude).toBeCloseTo(latitude, 0);
  },
);

it.each([
  [
    "a save and a Discover place",
    {
      id: "discover:a",
      name: "Monument",
      source: "discover",
      tintColor: "#muted",
    },
    { id: "jd7b", name: "Ramen", source: "own" },
    "Ramen +1",
    "#ffffff",
    false,
  ],
  [
    "a visited save and a Discover place",
    {
      id: "discover:a",
      name: "Monument",
      source: "discover",
      tintColor: "#muted",
    },
    {
      id: "jd7b",
      name: "Ramen",
      title: "✓ Ramen",
      source: "own",
      visited: true,
    },
    "Ramen +1",
    "#ffffff",
    false,
  ],
  [
    "a visited and an unvisited save",
    { id: "a", name: "Ramen", title: "✓ Ramen", visited: true },
    { id: "b", name: "Tacos" },
    "Ramen +1",
    "#ffffff",
    false,
  ],
  [
    "two visited saves",
    { id: "a", name: "Ramen", title: "✓ Ramen", visited: true },
    { id: "b", name: "Tacos", title: "✓ Tacos", visited: true },
    "✓ Ramen +1",
    "#ffffff",
    true,
  ],
] as const)(
  "says only what is true of every place in a pin grouping %s",
  async (_name, one, other, title, tintColor, badged) => {
    render(
      <PlacesMap
        opening={openingFor(false, AUSTIN)}
        areaPartial={false}
        onArea={vi.fn()}
        pins={[
          { ...one, lat: 30.26, lng: -97.74 },
          { ...other, lat: 30.2601, lng: -97.7401 },
        ]}
        anchors={AUSTIN}
        framed={AUSTIN}
        showsUser={false}
        height={800}
        topInset={100}
        bottomInset={120}
        onSelect={vi.fn()}
      />,
    );
    expect(mock.props.markers[0]).toMatchObject({ title, tintColor });
    await act(async () => {});
    expect(mock.props.annotations).toHaveLength(badged ? 1 : 0);
  },
);

it("flies out to frame every place when asked to zoom out", async () => {
  const far = [...AUSTIN, { id: "c", name: "Bar", lat: 32.78, lng: -96.8 }];
  const { rerender } = render(map());
  await act(() => vi.advanceTimersByTimeAsync(200));
  const before = mock.moves.length;
  rerender(
    <PlacesMap
      opening={openingFor(true, AUSTIN)}
      areaPartial={false}
      onArea={vi.fn()}
      pins={AUSTIN}
      anchors={AUSTIN}
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
      opening={openingFor(false, pins)}
      areaPartial={false}
      onArea={vi.fn()}
      pins={pins}
      anchors={pins}
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
  rerender(noLocation(AUSTIN.slice(0, 1), 170));
  await act(() => vi.advanceTimersByTimeAsync(200));
  expect(mock.moves).toHaveLength(2);
});

it.each([
  ["refits", false, 1],
  ["keeps the area the person moved to", true, 0],
])(
  "%s when the sheet covers more of the map after the first framing",
  async (_name, touchedFirst, refits) => {
    const opened = (bottomInset: number) => (
      <PlacesMap
        opening={openingFor(false, AUSTIN)}
        areaPartial={false}
        onArea={vi.fn()}
        pins={AUSTIN}
        framed={AUSTIN}
        anchors={AUSTIN}
        showsUser={false}
        height={800}
        topInset={100}
        bottomInset={bottomInset}
        onSelect={vi.fn()}
      />
    );
    const { getByTestId, rerender } = render(opened(120));
    const first = mock.props.cameraPosition as Camera;
    expect(first).toBeDefined();
    if (touchedFirst) fireEvent.touchStart(getByTestId("map-touch"));
    rerender(opened(320));
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(mock.moves).toHaveLength(refits);
    if (refits) {
      const refit = mock.moves[0] as Camera & {
        coordinates: { latitude: number };
      };
      expect(refit.coordinates.latitude).toBeLessThan(
        (first.coordinates as { latitude: number }).latitude,
      );
    }
  },
);

it("leaves the map alone when Search changes the room under it, open or closed", async () => {
  const opened = (bottomInset: number, searchOpen: boolean) =>
    map({ showsUser: false, bottomInset, searchOpen });
  const { rerender } = render(opened(228, false));
  rerender(opened(178, true));
  rerender(opened(98, true));
  rerender(opened(98, false));
  rerender(opened(228, false));
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(mock.moves).toEqual([]);
});

it("drops a pending sheet refit once the person touches the map", async () => {
  const opened = (bottomInset: number) => (
    <PlacesMap
      opening={openingFor(false, AUSTIN)}
      areaPartial={false}
      onArea={vi.fn()}
      pins={AUSTIN}
      framed={AUSTIN}
      anchors={AUSTIN}
      showsUser={false}
      height={800}
      topInset={100}
      bottomInset={bottomInset}
      onSelect={vi.fn()}
    />
  );
  const { getByTestId, rerender } = render(opened(120));
  mock.moveToPlace.mockRejectedValueOnce(new Error("map is mounting"));
  rerender(opened(320));
  await act(() => vi.advanceTimersByTimeAsync(10));
  expect(mock.moves).toHaveLength(1);
  fireEvent.touchStart(getByTestId("map-touch"));
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(mock.moves).toHaveLength(1);
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
        opening={openingFor(true, pins)}
        areaPartial={false}
        onArea={vi.fn()}
        pins={pins}
        anchors={pins}
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
      opening={openingFor(true, pins)}
      areaPartial={false}
      onArea={vi.fn()}
      pins={pins}
      anchors={pins}
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
      opening={openingFor(true, pins)}
      areaPartial={false}
      onArea={vi.fn()}
      pins={pins}
      anchors={pins}
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
      opening={openingFor(false, AUSTIN)}
      areaPartial={false}
      onArea={vi.fn()}
      pins={AUSTIN}
      anchors={AUSTIN}
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

type LatLng = { lat: number; lng: number };

const LISBON = [
  { id: "a", name: "Manteigaria", lat: 38.71, lng: -9.14 },
  { id: "b", name: "Ramiro", lat: 38.72, lng: -9.13 },
];
const PARIS = { lat: 48.857, lng: 2.352 };
const CASCAIS = { lat: 38.6979, lng: -9.4215 };

const holds = (box: MapBox | undefined, at: LatLng) =>
  box !== undefined &&
  box.south <= at.lat &&
  at.lat <= box.north &&
  box.west <= at.lng &&
  at.lng <= box.east;

const latitudes = () =>
  mock.moves.map((move) =>
    move === "person"
      ? undefined
      : (move.coordinates as { latitude: number }).latitude,
  );

function areaMap(
  overrides: {
    anchors?: LatLng[];
    areaPartial?: boolean;
    locate?: number;
    showsUser?: boolean;
    height?: number;
    onArea?: (box: MapBox) => void;
  } = {},
) {
  return (
    <PlacesMap
      opening={openingFor(overrides.showsUser ?? true, LISBON)}
      pins={LISBON}
      framed={LISBON}
      anchors={undefined}
      showsUser
      areaPartial={false}
      height={800}
      topInset={100}
      bottomInset={120}
      onSelect={vi.fn()}
      onArea={vi.fn()}
      {...overrides}
    />
  );
}

function openMap(
  anchors: LatLng[] | undefined,
  onArea: (box: MapBox) => void = () => {},
  areaPartial = false,
) {
  const view = render(areaMap({ anchors, onArea, areaPartial }));
  return (next: LatLng[] | undefined) =>
    act(() => view.rerender(areaMap({ anchors: next, onArea, areaPartial })));
}

async function restOnPerson(at: LatLng) {
  await act(async () => {
    await Promise.resolve();
    mock.props.onCameraMove({
      coordinates: { latitude: at.lat, longitude: at.lng },
      zoom: 13,
      tilt: 0,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    });
    vi.advanceTimersByTime(600);
  });
}

describe("opening on the person while Discover loads by area", () => {
  beforeEach(() => {
    mock.findsPerson = true;
  });

  it("waits for the area's places, then stays when one is near", async () => {
    const answer = openMap(undefined);
    await restOnPerson(PARIS);
    expect(latitudes()).toEqual([undefined]);
    answer([PARIS]);
    expect(latitudes()).toEqual([undefined]);
  });

  it("moves on to the busiest city once the area answers with nothing near", async () => {
    const answer = openMap(undefined);
    await restOnPerson(PARIS);
    answer([]);
    expect(latitudes()).toEqual([undefined, expect.closeTo(38.7, 0)]);
  });

  it("stays on the person when the area answer may leave a nearer place out", async () => {
    const answer = openMap(undefined, () => {}, true);
    await restOnPerson(PARIS);
    answer([]);
    expect(latitudes()).toEqual([undefined]);
  });

  it("judges by the person's own places as soon as the camera rests", async () => {
    openMap([LISBON[0]]);
    await restOnPerson(PARIS);
    expect(latitudes()).toEqual([undefined, expect.closeTo(38.7, 0)]);
  });

  it("leaves the person where they are when the area answers too late", async () => {
    const answer = openMap(undefined);
    await restOnPerson(PARIS);
    act(() => vi.advanceTimersByTime(3000));
    answer([]);
    expect(latitudes()).toEqual([undefined]);
  });

  it("asks for the places within reach of the person, not only those on screen", async () => {
    const areas: MapBox[] = [];
    const answer = openMap(undefined, (box) => areas.push(box));
    await restOnPerson(CASCAIS);
    expect(holds(areas.at(-1), LISBON[0])).toBe(true);
    answer([LISBON[0]]);
    expect(latitudes()).toEqual([undefined]);
    await restOnPerson({ lat: CASCAIS.lat, lng: CASCAIS.lng + 0.2 });
    expect(holds(areas.at(-1), LISBON[0])).toBe(false);
  });

  it("goes back to the person on every locate press, and the opening check no longer moves away", async () => {
    const view = render(areaMap());
    await restOnPerson(PARIS);
    view.rerender(areaMap({ locate: 1 }));
    view.rerender(areaMap({ locate: 2 }));
    view.rerender(areaMap({ anchors: [], locate: 2 }));
    expect(latitudes()).toEqual([undefined, undefined, undefined]);
  });

  it("drops a still-retrying opening move once locate is pressed", async () => {
    mock.findsPerson = false;
    const view = render(areaMap());
    await act(async () => {
      await Promise.resolve();
    });
    mock.findsPerson = true;
    view.rerender(areaMap({ locate: 1 }));
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    expect(latitudes()).toEqual([undefined, undefined]);
  });

  it("asks for the opening area once without location, even when the map's size changes", () => {
    const onArea = vi.fn();
    const view = render(areaMap({ anchors: LISBON, showsUser: false, onArea }));
    expect(onArea).toHaveBeenCalledTimes(1);
    view.rerender(
      areaMap({ anchors: LISBON, showsUser: false, onArea, height: 400 }),
    );
    expect(onArea).toHaveBeenCalledTimes(1);
  });
});

describe("a touch while the map is still opening", () => {
  beforeEach(() => {
    mock.findsPerson = true;
  });

  it("still reaches the person when a touch lands before the opening move does", async () => {
    mock.findsPerson = false;
    const view = render(areaMap());
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.touchStart(view.getByTestId("map-touch"));
    mock.findsPerson = true;
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    expect(latitudes()).toEqual([undefined, undefined]);
  });
});
function restAt(
  onCameraMove: (event: object) => void,
  latitude: number,
  longitude: number,
  zoom = 13,
) {
  act(() => {
    onCameraMove({
      coordinates: { latitude, longitude },
      zoom,
      tilt: 0,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
    });
  });
}

describe("remembering where the person left the map", () => {
  const NEAR: StoredView = { lat: 30.4, lng: -97.7, zoom: 13 };
  it("opens on the last view and stays there when the space under the map grows", async () => {
    const opening: Opening = { kind: "last", view: NEAR };
    const { rerender } = render(
      map({ showsUser: false, opening, bottomInset: 120 }),
    );
    expect(mock.props.cameraPosition).toEqual({
      coordinates: { latitude: 30.4, longitude: -97.7 },
      zoom: 13,
    });
    rerender(map({ showsUser: false, opening, bottomInset: 320 }));
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(mock.moves).toEqual([]);
  });

  it("moves from the person to the last view when it is within 50 km", async () => {
    mock.findsPerson = true;
    render(map({ opening: { kind: "person", restore: NEAR } }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    restAt(mock.props.onCameraMove, 30.27, -97.73);
    await act(() => vi.advanceTimersByTimeAsync(700));
    expect(mock.moves).toEqual([
      "person",
      { coordinates: { latitude: 30.4, longitude: -97.7 }, zoom: 13 },
    ]);
  });

  it("stays with the person when the last view is farther than 50 km", async () => {
    mock.findsPerson = true;
    render(map({ opening: { kind: "person", restore: NEAR } }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    restAt(mock.props.onCameraMove, 38.7, -9.1);
    await act(() => vi.advanceTimersByTimeAsync(700));
    expect(mock.moves).not.toContainEqual(
      expect.objectContaining({ zoom: 13 }),
    );
  });

  it("does not redirect a person who touched the map", async () => {
    mock.findsPerson = true;
    const view = render(map({ opening: { kind: "person", restore: NEAR } }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    fireEvent.touchStart(view.getByTestId("map-touch"));
    restAt(mock.props.onCameraMove, 30.27, -97.73);
    await act(() => vi.advanceTimersByTimeAsync(700));
    expect(mock.moves).toEqual(["person"]);
  });

  it("never saves the opening moves, only where the person leaves the map", async () => {
    mock.findsPerson = true;
    const view = render(map({ opening: { kind: "person", restore: NEAR } }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    restAt(mock.props.onCameraMove, 30.27, -97.73);
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(saved).not.toHaveBeenCalled();

    fireEvent.touchStart(view.getByTestId("map-touch"));
    restAt(mock.props.onCameraMove, 30.3, -97.8, 14);
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(saved).toHaveBeenCalledWith({
      lat: 30.3,
      lng: -97.8,
      zoom: 14,
    });
  });

  it("saves where a search pick leaves the camera", async () => {
    const view = render(map({ showsUser: false }));
    restAt(mock.props.onCameraMove, 30.2, -97.7);
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(saved).not.toHaveBeenCalled();
    view.rerender(map({ showsUser: false, focus: FOCUS }));
    restAt(mock.props.onCameraMove, 30.27, -97.73, 15);
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(saved).toHaveBeenCalledWith({
      lat: 30.27,
      lng: -97.73,
      zoom: 15,
    });
  });
});
