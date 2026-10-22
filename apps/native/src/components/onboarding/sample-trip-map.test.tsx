// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_CROPS, sampleTrip } from "@/lib/sample-trip";

import { PinBadge, SampleTripMap } from "./sample-trip-map";

const TRIP = sampleTrip("prague");
const PINS = TRIP.days.flatMap((day) => day.stops.map((stop) => stop.pin));
const FIRST = PINS[0]!;
const LAST = PINS[PINS.length - 1]!;
const route = (day: number) =>
  TRIP.days[day]!.stops.map(
    ({ pin }, index) => `${index === 0 ? "M" : "L"}${pin.x} ${pin.y}`,
  ).join(" ");

type Style = Record<string, unknown> | Style[] | false | null | undefined;
type ViewProps = {
  children?: ReactNode;
  style?: Style;
  accessibilityLabel?: string;
  onLayout?: (event: { nativeEvent: { layout: { width: number } } }) => void;
};

const flatten = (style: Style): Record<string, unknown> =>
  Array.isArray(style)
    ? Object.assign({}, ...style.map(flatten))
    : (style ?? {}) || {};

const mock = vi.hoisted(() => ({
  layout: undefined as ViewProps["onLayout"],
  dark: false,
  view: (props: ViewProps) => {
    if (props.onLayout) mock.layout = props.onLayout;
    const { left, top, backgroundColor } = flatten(props.style);
    return (
      <div
        data-left={left as number | undefined}
        data-top={top as number | undefined}
        data-background={backgroundColor as string | undefined}
        aria-label={props.accessibilityLabel}
      >
        {props.children}
      </div>
    );
  },
  text: ({ children, style }: { children?: ReactNode; style?: Style }) => (
    <span data-color={flatten(style).color as string | undefined}>
      {children}
    </span>
  ),
  canvas: ({ children }: { children?: ReactNode }) => (
    <div data-testid="canvas">{children}</div>
  ),
  group: ({
    children,
    transform,
  }: {
    children?: ReactNode;
    transform: object[];
  }) => (
    <div data-testid="group" data-transform={JSON.stringify(transform)}>
      {children}
    </div>
  ),
  shape: ({ color }: { color: string }) => (
    <i data-testid="shape" data-color={color} />
  ),
  path: ({
    children,
    path,
    color,
  }: {
    children?: ReactNode;
    path: string;
    color: string;
  }) => (
    <i data-testid="path" data-path={path} data-color={color}>
      {children}
    </i>
  ),
  dash: () => <i data-testid="dash" />,
}));

vi.mock("react-native", () => ({ View: mock.view, Text: mock.text }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({
    theme: {
      colors: {
        primary: "#amber",
        onTint: "#ink",
        foreground: "#dark",
        background: "#paper",
        border: "#line",
        muted: "#gray",
      },
    },
    rt: { themeName: mock.dark ? "dark" : "light" },
  }),
}));
vi.mock("@shopify/react-native-skia", () => ({
  Canvas: mock.canvas,
  Group: mock.group,
  Oval: mock.shape,
  RoundedRect: mock.shape,
  Path: mock.path,
  DashPathEffect: mock.dash,
}));
vi.mock("@/lib/appearance", () => ({
  isDarkThemeName: (name: string) => name === "dark" || name === "darkNeutral",
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string, values?: object) =>
    values === undefined ? key : `${key}:${JSON.stringify(values)}`,
  useAppLocale: () => "en",
}));

beforeEach(() => {
  mock.layout = undefined;
  mock.dark = false;
});

const measure = (width: number) =>
  act(() => mock.layout?.({ nativeEvent: { layout: { width } } }));

const CROP = { top: 28, height: 120 };

describe("SampleTripMap", () => {
  it("is described as a map of the sample city and its eight stops", () => {
    render(<SampleTripMap trip={TRIP} crop={SAMPLE_CROPS.reveal} />);
    expect(
      screen.getByLabelText(
        'tripTeaser.mapLabel:{"city":"tripTeaser.cityPrague","places":"8"}',
      ),
    ).toBeTruthy();
  });

  it("draws nothing until the card is measured", () => {
    render(<SampleTripMap trip={TRIP} crop={SAMPLE_CROPS.reveal} />);
    expect(screen.queryByTestId("canvas")).toBeNull();
    expect(screen.queryAllByText(/^[1-8]$/)).toHaveLength(0);
  });

  it("places each pin at the drawing's point, cut to the crop", () => {
    render(<SampleTripMap trip={TRIP} crop={CROP} />);
    measure(340);
    const left = (n: number) =>
      screen
        .getByText(String(n))
        .closest("[data-left]")
        ?.getAttribute("data-left");
    const top = (n: number) =>
      screen
        .getByText(String(n))
        .closest("[data-left]")
        ?.getAttribute("data-top");
    // CROP starts at y 28 and a pin is 22 across, so its corner is 11 short of its center.
    expect([left(1), top(1)]).toEqual([
      String(FIRST.x - 11),
      String(FIRST.y - 28 - 11),
    ]);
    expect([left(8), top(8)]).toEqual([
      String(LAST.x - 11),
      String(LAST.y - 28 - 11),
    ]);
  });

  it("scales the pins' places and the drawing with the card's width", () => {
    render(<SampleTripMap trip={TRIP} crop={CROP} />);
    measure(680);
    const place = screen.getByText("1").closest("[data-left]");
    expect(place?.getAttribute("data-left")).toBe(String(FIRST.x * 2 - 11));
    expect(place?.getAttribute("data-top")).toBe(
      String((FIRST.y - 28) * 2 - 11),
    );
    expect(screen.getByTestId("group").dataset.transform).toBe(
      JSON.stringify([{ scale: 2 }, { translateY: -28 }]),
    );
  });

  it("cuts the map at the sample card's crop", () => {
    render(<SampleTripMap trip={TRIP} crop={SAMPLE_CROPS.reveal} />);
    measure(340);
    const place = screen.getByText("1").closest("[data-left]");
    expect(place?.getAttribute("data-top")).toBe(String(FIRST.y - 10 - 11));
  });

  it("joins each day's stops with a dotted route in that day's color", () => {
    render(<SampleTripMap trip={TRIP} crop={SAMPLE_CROPS.reveal} />);
    measure(340);
    const drawn = (path: string) =>
      screen
        .getAllByTestId("path")
        .find((candidate) => candidate.dataset.path === path);
    expect(drawn(route(0))?.dataset.color).toBe("#amber");
    expect(drawn(route(1))?.dataset.color).toBe("#dark");
    expect(screen.getAllByTestId("dash")).toHaveLength(2);
  });

  it("re-draws when the card is measured again", () => {
    render(<SampleTripMap trip={TRIP} crop={CROP} />);
    measure(340);
    measure(300);
    expect(screen.getByTestId("group").dataset.transform).toBe(
      JSON.stringify([{ scale: 300 / 340 }, { translateY: -28 }]),
    );
  });
});

describe("PinBadge", () => {
  it("shows its number", () => {
    render(<PinBadge number={3} day={0} />);
    expect(screen.getByText("3")).toBeTruthy();
  });

  it.each([
    [0, "#amber", "#ink"],
    [1, "#dark", "#paper"],
  ])("colors day %i's pin %s with %s text", (day, background, text) => {
    const { container } = render(<PinBadge number={2} day={day} />);
    expect(
      container
        .querySelector("[data-background]")
        ?.getAttribute("data-background"),
    ).toBe(background);
    expect(screen.getByText("2").dataset.color).toBe(text);
  });
});
