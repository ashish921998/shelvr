// @vitest-environment jsdom
// The veiled stops draw the trip's locked rows with Skia and blur them as one
// picture. Nothing is drawn until the block has a width and its fonts; then
// every row's text and badge land where the open rows would put them.
import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleRows } from "@/lib/sample-trip";
import { VeiledStops } from "./veiled-stops";

type Style = { height?: number } | undefined;
type LayoutEvent = { nativeEvent: { layout: { width: number } } };

const mock = vi.hoisted(() => ({
  fontsReady: true,
  layout: undefined as ((event: LayoutEvent) => void) | undefined,
  view: ({
    children,
    style,
    onLayout,
  }: {
    children?: ReactNode;
    style?: Style;
    onLayout?: (event: LayoutEvent) => void;
  }) => {
    if (onLayout) mock.layout = onLayout;
    return (
      <div data-testid="block" data-height={style?.height}>
        {children}
      </div>
    );
  },
  font: (size: number) => ({
    getSize: () => size,
    measureText: (text: string) => ({ width: text.length * 7 }),
  }),
  canvas: ({ children }: { children?: ReactNode }) => (
    <div data-testid="canvas">{children}</div>
  ),
  group: ({ children, layer }: { children?: ReactNode; layer?: ReactNode }) => (
    <div data-testid="group">
      <div data-testid="layer">{layer}</div>
      {children}
    </div>
  ),
  paint: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  blur: ({ blur }: { blur: number }) => (
    <i data-testid="blur" data-blur={blur} />
  ),
  rect: ({ y, color }: { y: number; color: string }) => (
    <i data-testid="divider" data-y={y} data-color={color} />
  ),
  circle: ({
    cx,
    cy,
    r,
    color,
  }: {
    cx: number;
    cy: number;
    r: number;
    color: string;
  }) => (
    <i
      data-testid="badge"
      data-cx={cx}
      data-cy={cy}
      data-r={r}
      data-color={color}
    />
  ),
  words: ({
    text,
    x,
    y,
    color,
  }: {
    text: string;
    x: number;
    y: number;
    color: string;
  }) => (
    <span data-testid="words" data-x={x} data-y={y} data-color={color}>
      {text}
    </span>
  ),
}));

// The native asset loader normally handles the font requires; Node has none.
vi.hoisted(async () => {
  const { createRequire } = await import("node:module");
  const load = createRequire(import.meta.url);
  for (const extension of [".otf", ".ttf"]) {
    load.extensions[extension] = (module) => {
      module.exports = "font-asset";
    };
  }
});
vi.mock("react-native", () => ({ View: mock.view }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({
    theme: {
      colors: {
        border: "#line",
        muted: "#gray",
        foreground: "#ink",
        primaryText: "#brown",
      },
      fonts: { bold: "Satoshi-Bold" },
      type: {
        label: { fontFamily: "Satoshi-Medium", fontSize: 13 },
        header: { fontFamily: "CrimsonProRoman-Regular", fontSize: 19 },
        caption: { fontFamily: "Satoshi-Regular", fontSize: 13 },
      },
    },
  }),
}));
vi.mock("@shopify/react-native-skia", () => ({
  Canvas: mock.canvas,
  Group: mock.group,
  Paint: mock.paint,
  Blur: mock.blur,
  Rect: mock.rect,
  Circle: mock.circle,
  Text: mock.words,
  useFont: (_: unknown, size: number) =>
    mock.fontsReady ? mock.font(size) : null,
}));
vi.mock("@/components/onboarding/sample-trip-map", () => ({
  usePinColors: () => (day: number) =>
    day === 0
      ? { background: "#amber", text: "#onamber" }
      : { background: "#dark", text: "#ondark" },
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string, values?: object) =>
    values === undefined ? key : `${key}:${JSON.stringify(values)}`,
  useAppLocale: () => "en",
}));

// What the locked card veils: everything after day one's header and first stop.
const LOCKED = sampleRows().slice(2);

beforeEach(() => {
  mock.fontsReady = true;
  mock.layout = undefined;
});

const measure = (width: number) =>
  act(() => mock.layout?.({ nativeEvent: { layout: { width } } }));
const word = (text: string) => screen.getByText(text);
const num = (element: HTMLElement, name: string) =>
  Number(element.dataset[name]);

describe("VeiledStops", () => {
  it("draws nothing until it has been measured", () => {
    render(<VeiledStops rows={LOCKED} />);
    expect(screen.queryByTestId("canvas")).toBeNull();
    measure(340);
    expect(screen.getByTestId("canvas")).toBeTruthy();
  });

  it("draws nothing until every font has loaded", () => {
    mock.fontsReady = false;
    const { rerender } = render(<VeiledStops rows={LOCKED} />);
    measure(340);
    expect(screen.queryByTestId("canvas")).toBeNull();
    mock.fontsReady = true;
    rerender(<VeiledStops rows={LOCKED} />);
    expect(screen.getByTestId("canvas")).toBeTruthy();
  });

  it("is as tall as the open rows it stands in for", () => {
    // Four stops of 44 and one day header of 64.
    render(<VeiledStops rows={LOCKED} />);
    expect(screen.getByTestId("block").dataset.height).toBe("240");
  });

  it("blurs every row as one picture", () => {
    render(<VeiledStops rows={LOCKED} />);
    measure(340);
    expect(screen.getAllByTestId("group")).toHaveLength(1);
    expect(screen.getByTestId("blur").dataset.blur).toBe("5");
    expect(
      screen.getByTestId("layer").contains(screen.getByTestId("blur")),
    ).toBe(true);
  });

  it("writes each stop's name, time of day and number", () => {
    render(<VeiledStops rows={LOCKED} />);
    measure(340);
    for (const name of [
      "Café Louvre",
      "Charles Bridge",
      "Prague Castle",
      "Petřín Lookout Tower",
    ]) {
      expect(word(name)).toBeTruthy();
    }
    expect(screen.getAllByText("trip.slotMorning")).toHaveLength(1);
    expect(screen.getAllByText("trip.slotAfternoon")).toHaveLength(2);
    expect(screen.getAllByText("trip.slotEvening")).toHaveLength(1);
    for (const number of ["2", "3", "4", "5"]) {
      expect(word(number)).toBeTruthy();
    }
  });

  it("writes the second day's header, in capitals, with its title and count", () => {
    render(<VeiledStops rows={LOCKED} />);
    measure(340);
    expect(word('trip.dayTab:{"day":"2"}'.toLocaleUpperCase())).toBeTruthy();
    expect(word("tripTeaser.dayTwoTitle")).toBeTruthy();
    expect(word('tripTeaser.placeCount:{"count":2}')).toBeTruthy();
  });

  it("draws a divider above every row", () => {
    render(<VeiledStops rows={LOCKED} />);
    measure(340);
    const tops = screen
      .getAllByTestId("divider")
      .map((divider) => num(divider, "y"));
    // Stop 44, stop 44, day header 64, stop 44, stop 44.
    expect(tops).toEqual([0, 44, 88, 152, 196]);
  });

  it("colors each stop's badge as its day's pins", () => {
    render(<VeiledStops rows={LOCKED} />);
    measure(340);
    const colors = screen
      .getAllByTestId("badge")
      .map((badge) => badge.dataset.color);
    expect(colors).toEqual(["#amber", "#amber", "#dark", "#dark"]);
    expect(word("2").dataset.color).toBe("#onamber");
    expect(word("4").dataset.color).toBe("#ondark");
  });

  it("puts each badge at the right edge and centers its number on it", () => {
    render(<VeiledStops rows={LOCKED} />);
    measure(340);
    const [first] = screen.getAllByTestId("badge");
    // 16 of padding and half of the 22 wide badge from the right edge, and
    // the middle of a 44 high row under its 1 high divider.
    expect(num(first, "cx")).toBe(313);
    expect(num(first, "cy")).toBeCloseTo(22.5);
    // The open row's pin shows a disc of 18 inside a 2 wide ring.
    expect(num(first, "r")).toBe(9);
    // The number is one 7 wide character, centered on the badge.
    expect(num(word("2"), "x")).toBeCloseTo(313 - 3.5);
  });

  it("sets a stop's name on its row's middle, after the time of day", () => {
    render(<VeiledStops rows={LOCKED} />);
    measure(340);
    const name = word("Café Louvre");
    expect(num(name, "x")).toBe(16 + 84 + 12);
    // A 16 high glyph sits 0.34 of its size above its baseline.
    expect(num(name, "y")).toBeCloseTo(22.5 + 16 * 0.34);
  });

  it("right-aligns a day's count to the edge", () => {
    render(<VeiledStops rows={LOCKED} />);
    measure(340);
    const text = 'tripTeaser.placeCount:{"count":2}';
    expect(num(word(text), "x")).toBe(340 - 16 - text.length * 7);
  });

  it("draws again at the new width when measured again", () => {
    render(<VeiledStops rows={LOCKED} />);
    measure(340);
    measure(300);
    const [first] = screen.getAllByTestId("badge");
    expect(num(first, "cx")).toBe(300 - 16 - 11);
  });

  it("is empty for no rows", () => {
    render(<VeiledStops rows={[]} />);
    expect(screen.getByTestId("block").dataset.height).toBe("0");
    measure(340);
    expect(screen.queryAllByTestId("words")).toHaveLength(0);
  });
});
