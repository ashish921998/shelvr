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
  reduced: false,
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

vi.mock("react-native", () => ({
  PixelRatio: { get: () => 3 },
  View: mock.view,
}));
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
vi.mock("react-native-reanimated", () => ({
  useReducedMotion: () => mock.reduced,
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
const DAY_ONE = TRIP.days[0]!.stops;
const DAY_TWO = TRIP.days[1]!.stops;

const measure = () =>
  act(() =>
    mock.layout?.({ nativeEvent: { layout: { width: 340, height: 170 } } }),
  );

beforeEach(() => {
  vi.useFakeTimers();
  mock.props = undefined;
  mock.moves = [];
  mock.reduced = false;
});
afterEach(() => vi.useRealTimers());

describe("SampleAppleMap", () => {
  it("waits for its size before drawing the map", () => {
    render(<SampleAppleMap trip={TRIP} />);
    expect(mock.props).toBeUndefined();
  });

  it("numbers the stops across days, in each day's color", () => {
    render(<SampleAppleMap trip={TRIP} />);
    measure();
    const pins = mock.props!.annotations;
    expect(pins.map((pin) => pin.text)).toEqual(
      [...DAY_ONE, ...DAY_TWO].map((_, index) => String(index + 1)),
    );
    expect(pins[0]!.backgroundColor).toBe("#amber");
    expect(pins[DAY_ONE.length]!.backgroundColor).toBe("#dark");
  });

  it("opens on the first day and moves on to the next", () => {
    render(<SampleAppleMap trip={TRIP} />);
    measure();
    const dayOneLat =
      DAY_ONE.reduce((sum, stop) => sum + stop.at.lat, 0) / DAY_ONE.length;
    const dayTwoLat =
      DAY_TWO.reduce((sum, stop) => sum + stop.at.lat, 0) / DAY_TWO.length;
    const first = mock.props!.cameraPosition.coordinates as {
      latitude: number;
    };
    const near = (a: number, b: number) =>
      Math.abs(a - b) < Math.abs(dayOneLat - dayTwoLat) / 2;
    expect(near(first.latitude, dayOneLat)).toBe(true);
    act(() => vi.advanceTimersByTime(3500));
    expect(near(mock.moves.at(-1)!.coordinates.latitude, dayTwoLat)).toBe(true);
  });

  it("stays on the first day when motion is reduced", () => {
    mock.reduced = true;
    render(<SampleAppleMap trip={TRIP} />);
    measure();
    const moved = mock.moves.length;
    act(() => vi.advanceTimersByTime(10_000));
    expect(mock.moves).toHaveLength(moved);
  });
});
