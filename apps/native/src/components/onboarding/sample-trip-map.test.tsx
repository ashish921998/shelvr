// @vitest-environment jsdom
// The sample map lays itself out at the card's width: nothing is drawn until
// the card is measured, then every pin lands where the drawing puts it, scaled
// to the card and cut to the crop.
import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_CROPS } from "@/lib/sample-trip";
import { PinBadge, SampleTripMap } from "./sample-trip-map";

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
    const { left, top, shadowColor } = flatten(props.style);
    return (
      <div
        data-left={left as number | undefined}
        data-top={top as number | undefined}
        data-shadow={shadowColor as string | undefined}
        aria-label={props.accessibilityLabel}
      >
        {props.children}
      </div>
    );
  },
  text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
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
  path: ({ children, path }: { children?: ReactNode; path: string }) => (
    <i data-testid="path" data-path={path}>
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

describe("SampleTripMap", () => {
  it("is described as a map of the sample city and its five stops", () => {
    render(<SampleTripMap crop={SAMPLE_CROPS.locked} />);
    expect(
      screen.getByLabelText(
        'tripTeaser.mapLabel:{"city":"tripTeaser.city","places":"5"}',
      ),
    ).toBeTruthy();
  });

  it("draws nothing until the card is measured", () => {
    render(<SampleTripMap crop={SAMPLE_CROPS.locked} />);
    expect(screen.queryByTestId("canvas")).toBeNull();
    expect(screen.queryAllByText(/^[1-5]$/)).toHaveLength(0);
  });

  it("places each pin at the drawing's point, cut to the crop", () => {
    render(<SampleTripMap crop={SAMPLE_CROPS.locked} />);
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
    // Pin 1 sits at (250, 76) on the drawing; the locked crop starts at y 28
    // and a pin is 22 across, so its corner is 11 short of its center.
    expect([left(1), top(1)]).toEqual(["239", "37"]);
    // Pin 5 sits at (96, 122).
    expect([left(5), top(5)]).toEqual(["85", "83"]);
  });

  it("scales the pins' places and the drawing with the card's width", () => {
    render(<SampleTripMap crop={SAMPLE_CROPS.locked} />);
    measure(680);
    const place = screen.getByText("1").closest("[data-left]");
    expect(place?.getAttribute("data-left")).toBe(String(250 * 2 - 11));
    expect(place?.getAttribute("data-top")).toBe(String((76 - 28) * 2 - 11));
    expect(screen.getByTestId("group").dataset.transform).toBe(
      JSON.stringify([{ scale: 2 }, { translateY: -28 }]),
    );
  });

  it("starts the open card's crop higher", () => {
    render(<SampleTripMap crop={SAMPLE_CROPS.reveal} />);
    measure(340);
    const place = screen.getByText("1").closest("[data-left]");
    expect(place?.getAttribute("data-top")).toBe(String(76 - 10 - 11));
  });

  it("joins each day's stops with a dotted route in that day's color", () => {
    render(<SampleTripMap crop={SAMPLE_CROPS.locked} />);
    measure(340);
    const paths = screen
      .getAllByTestId("path")
      .map((path) => path.dataset.path);
    expect(paths).toContain("M250 76 L232 124 L188 92");
    expect(paths).toContain("M118 56 L96 122");
    expect(screen.getAllByTestId("dash")).toHaveLength(2);
  });

  it("re-draws when the card is measured again", () => {
    render(<SampleTripMap crop={SAMPLE_CROPS.locked} />);
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

  it("shows no number when veiled", () => {
    render(<PinBadge number={3} day={0} veiled />);
    expect(screen.queryByText("3")).toBeNull();
  });

  it.each([
    [0, "#amber"],
    [1, "#dark"],
  ])("glows in its own color when veiled, day %i", (day, color) => {
    const { container } = render(<PinBadge number={2} day={day} veiled />);
    expect(
      container.querySelector("[data-shadow]")?.getAttribute("data-shadow"),
    ).toBe(color);
  });
});
