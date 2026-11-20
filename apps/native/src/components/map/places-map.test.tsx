// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { forwardRef, useImperativeHandle } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MapBox } from "@/lib/discover-area";

import { type MapPin, PlacesMap } from "./places-map";

type LatLng = { lat: number; lng: number };
type Camera =
  | { coordinates: { latitude: number; longitude: number }; zoom: number }
  | undefined;
type MapProps = {
  onCameraMove: (event: {
    coordinates: { latitude?: number; longitude?: number };
    zoom: number;
    tilt: number;
    latitudeDelta: number;
    longitudeDelta: number;
  }) => void;
};

const mock = vi.hoisted(() => ({
  moves: [] as Camera[],
  props: undefined as MapProps | undefined,
}));

vi.mock("expo-maps", () => ({
  AppleMaps: {
    MapColorScheme: { DARK: "dark", LIGHT: "light" },
    View: forwardRef(function MapView(props: MapProps, ref) {
      mock.props = props;
      useImperativeHandle(ref, () => ({
        setCameraPosition: (camera?: Camera) => {
          mock.moves.push(camera);
          return Promise.resolve();
        },
      }));
      return null;
    }),
  },
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}), absoluteFillObject: {} },
  useUnistyles: () => ({
    theme: { colors: { primary: "#amber" }, gap: (n: number) => n * 4 },
    rt: {
      themeName: "light",
      screen: { width: 393, height: 852 },
      insets: { bottom: 34 },
    },
  }),
}));
vi.mock("@/lib/appearance", () => ({ isDarkThemeName: () => false }));
vi.mock("@/lib/i18n", () => ({ formattingLocale: () => "en" }));
vi.mock("@/lib/analytics", () => ({ analytics: { captureError: vi.fn() } }));

const LISBON: MapPin[] = [
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

function openMap(
  anchors: LatLng[] | undefined,
  onArea: (box: MapBox) => void = () => {},
) {
  const props = {
    pins: LISBON,
    framed: LISBON,
    showsUser: true,
    topInset: 100,
    onSelect: () => {},
    onArea,
  };
  const view = render(<PlacesMap {...props} anchors={anchors} />);
  return (next: LatLng[] | undefined) =>
    act(() => view.rerender(<PlacesMap {...props} anchors={next} />));
}

async function restOnPerson(at: LatLng) {
  await act(async () => {
    await Promise.resolve();
    mock.props?.onCameraMove({
      coordinates: { latitude: at.lat, longitude: at.lng },
      zoom: 13,
      tilt: 0,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    });
    vi.advanceTimersByTime(600);
  });
}

const latitudes = () =>
  mock.moves.map((camera) => camera?.coordinates.latitude);

beforeEach(() => {
  mock.moves = [];
  mock.props = undefined;
  vi.useFakeTimers();
  vi.stubEnv("EXPO_OS", "ios");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("PlacesMap opening on the person", () => {
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
});
