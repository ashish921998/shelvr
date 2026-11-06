// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { forwardRef, useImperativeHandle } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LatLng } from "@convex/model/trip";
import { PlacesMap, type MapPin } from "./places-map";

type Camera = {
  coordinates: { latitude: number; longitude: number };
  zoom: number;
};
type Marker = {
  id: string;
  title: string;
  coordinates: { latitude: number; longitude: number };
  monogram?: string;
  systemImage?: string;
  tintColor?: string;
};
type MapProps = {
  markers: Marker[];
  cameraPosition?: Camera;
  onCameraMove: (event: {
    coordinates: { latitude?: number; longitude?: number };
  }) => void;
};

const mock = vi.hoisted(() => ({
  props: undefined as MapProps | undefined,
  moves: [] as (Camera | undefined)[],
  ui: {
    theme: {
      colors: { primary: "#amber", keep: "#green" },
      gap: (n: number) => n * 8,
    },
    rt: {
      themeName: "light",
      screen: { width: 393, height: 852 },
      insets: { top: 59, bottom: 34 },
    },
  },
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
  GoogleMaps: { View: vi.fn(() => null) },
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({ map: {} }), absoluteFillObject: {} },
  useUnistyles: () => mock.ui,
}));
vi.mock("@/lib/appearance", () => ({ isDarkThemeName: () => false }));
vi.mock("@/lib/analytics", () => ({ analytics: { captureError: vi.fn() } }));

const LISBON = { lat: 38.7223, lng: -9.1393 };
const MADRID = { lat: 40.4168, lng: -3.7038 };
const corners = ({ lat, lng }: LatLng): LatLng[] => [
  { lat: lat - 0.2, lng: lng - 0.2 },
  { lat: lat + 0.2, lng: lng + 0.2 },
];
const beenPin = (id: string, name: string, at: LatLng): MapPin => ({
  id: `been:${id}`,
  name,
  ...at,
  been: true,
});
const BEEN_LISBON = beenPin("lisbon", "Lisbon", LISBON);
const BEEN_MADRID = beenPin("madrid", "Madrid", MADRID);
const SAVED_IN_LISBON: MapPin = {
  id: "item-1:Time Out Market",
  name: "Time Out Market",
  lat: LISBON.lat + 0.01,
  lng: LISBON.lng,
  emoji: "🍽️",
};

function draw(
  props: Partial<{
    pins: MapPin[];
    framed: LatLng[];
    showsUser: boolean;
  }>,
) {
  return (
    <PlacesMap
      pins={props.pins ?? []}
      framed={props.framed ?? []}
      showsUser={props.showsUser ?? false}
      topInset={180}
      onSelect={vi.fn()}
    />
  );
}

function firstCameraFor(framed: LatLng[]): Camera {
  const view = render(draw({ pins: [BEEN_MADRID], framed }));
  const camera = mock.props?.cameraPosition;
  view.unmount();
  if (!camera) throw new Error("no first camera");
  return camera;
}

const restOn = ({ lat, lng }: LatLng) =>
  act(() =>
    mock.props?.onCameraMove({
      coordinates: { latitude: lat, longitude: lng },
    }),
  );

beforeEach(() => {
  vi.stubEnv("EXPO_OS", "ios");
  vi.useFakeTimers();
  mock.props = undefined;
  mock.moves = [];
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("PlacesMap markers", () => {
  it("draws a Been city as a green check mark named for the city, and a place with its emoji", () => {
    render(draw({ pins: [BEEN_LISBON, SAVED_IN_LISBON], framed: [] }));
    const [been, place] = mock.props?.markers ?? [];
    expect(been).toEqual({
      id: "been:lisbon",
      coordinates: { latitude: LISBON.lat, longitude: LISBON.lng },
      title: "Lisbon",
      systemImage: "checkmark",
      tintColor: "#green",
    });
    expect(been).not.toHaveProperty("monogram");
    expect(place).toMatchObject({
      id: SAVED_IN_LISBON.id,
      title: "Time Out Market",
      monogram: "🍽️",
      tintColor: "#amber",
    });
    expect(place).not.toHaveProperty("systemImage");
  });

  it("frames plain points for the first camera when it cannot open on the person", () => {
    render(draw({ pins: [BEEN_LISBON], framed: corners(LISBON) }));
    const camera = mock.props?.cameraPosition;
    expect(camera?.coordinates.longitude).toBeCloseTo(LISBON.lng, 6);
    expect(camera?.zoom).toBeGreaterThan(3);
    expect(mock.moves).toEqual([]);
  });
});

describe("PlacesMap refit", () => {
  it("moves to a new framing when only a Been city sits at the centre", () => {
    const madrid = firstCameraFor(corners(MADRID));
    const view = render(draw({ pins: [BEEN_LISBON], framed: corners(LISBON) }));
    restOn(LISBON);
    view.rerender(
      draw({ pins: [BEEN_LISBON, BEEN_MADRID], framed: corners(MADRID) }),
    );
    expect(mock.moves).toEqual([madrid]);
  });

  it("holds still when a saved place sits at the centre", () => {
    const view = render(
      draw({ pins: [SAVED_IN_LISBON, BEEN_LISBON], framed: corners(LISBON) }),
    );
    restOn(LISBON);
    view.rerender(
      draw({
        pins: [SAVED_IN_LISBON, BEEN_LISBON, BEEN_MADRID],
        framed: corners(MADRID),
      }),
    );
    expect(mock.moves).toEqual([]);
  });
});

describe("PlacesMap opening check", () => {
  async function openOnPerson(pins: MapPin[]) {
    render(draw({ pins, framed: corners(MADRID), showsUser: true }));
    await act(async () => {});
    expect(mock.moves).toEqual([undefined]);
    restOn(LISBON);
    act(() => vi.advanceTimersByTime(600));
  }

  it("frames the Been cities when the person stands by a Been city", async () => {
    const madrid = firstCameraFor(corners(MADRID));
    await openOnPerson([BEEN_LISBON, BEEN_MADRID]);
    expect(mock.moves).toEqual([undefined, madrid]);
  });

  it("stays on the person when one of their saved places is near", async () => {
    await openOnPerson([SAVED_IN_LISBON, BEEN_MADRID]);
    expect(mock.moves).toEqual([undefined]);
  });
});
