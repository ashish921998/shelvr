// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { forwardRef, useImperativeHandle, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { samplePlan } from "@/lib/sample-trip";

import { SampleAppleMap } from "./sample-apple-map";

type Layout = (event: { nativeEvent: { layout: object } }) => void;
type Camera = { coordinates: { latitude: number } };
type Pin = { text: string; backgroundColor: string; coordinates: object };
type MapProps = { annotations: Pin[]; cameraPosition: { coordinates: object } };

const mock = vi.hoisted(() => ({
  props: undefined as MapProps | undefined,
  moves: [] as Camera[],
  layout: undefined as Layout | undefined,
  view: ({
    children,
    onLayout,
  }: {
    children?: ReactNode;
    onLayout?: Layout;
  }) => {
    if (onLayout) mock.layout = onLayout;
    return <div>{children}</div>;
  },
}));

vi.mock("react-native", () => ({ View: mock.view }));
vi.mock("expo-maps", () => ({
  AppleMaps: {
    MapColorScheme: { DARK: "dark", LIGHT: "light" },
    View: forwardRef(function MapView(props: MapProps, ref) {
      mock.props = props;
      useImperativeHandle(ref, () => ({
        setCameraPosition: (camera: Camera) => {
          mock.moves.push(camera);
          return Promise.resolve();
        },
      }));
      return null;
    }),
  },
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}), absoluteFill: {} },
  useUnistyles: () => ({
    theme: {
      colors: {
        primary: "#amber",
        onTint: "#ink",
        foreground: "#dark",
        background: "#paper",
      },
    },
    rt: { themeName: "light" },
  }),
}));
vi.mock("@/lib/appearance", () => ({
  isDarkThemeName: (name: string) => name === "dark",
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  formattingLocale: () => "en",
  useAppLocale: () => "en",
}));
vi.mock("@/lib/analytics", () => ({ analytics: { captureError: vi.fn() } }));

const TRIP = samplePlan("trip", "barcelona");
const STOPS = TRIP.days.flatMap((day) => day.stops);

const measure = (width: number, height: number) =>
  act(() => mock.layout?.({ nativeEvent: { layout: { width, height } } }));

beforeEach(() => {
  mock.props = undefined;
  mock.moves = [];
});
afterEach(() => vi.restoreAllMocks());

describe("SampleAppleMap", () => {
  it("waits for its size before drawing the map", () => {
    render(<SampleAppleMap trip={TRIP} />);
    expect(mock.props).toBeUndefined();
  });

  it("numbers every stop in order, and shows only the dropped ones", () => {
    render(<SampleAppleMap trip={TRIP} visible={2} />);
    measure(340, 170);
    const pins = mock.props!.annotations;
    expect(pins.map((pin) => pin.text)).toEqual(["1", "2"]);
    expect(pins[0]!.backgroundColor).toBe("#amber");
  });

  it("frames the pins the way the city page does, below its middle when the top is padded more", () => {
    render(<SampleAppleMap trip={TRIP} />);
    measure(402, 340);
    const { latitude } = mock.props!.cameraPosition.coordinates as {
      latitude: number;
    };
    const lats = STOPS.map((stop) => stop.at.lat);
    const mid = (Math.min(...lats) + Math.max(...lats)) / 2;
    // The camera sits north of the pins' middle, which puts them below the map's centre.
    expect(latitude).toBeGreaterThan(mid);
  });

  it("moves the camera when the map's size changes", () => {
    render(<SampleAppleMap trip={TRIP} />);
    measure(402, 170);
    const before = mock.moves.length;
    measure(402, 400);
    expect(mock.moves.length).toBeGreaterThan(before);
  });
});
