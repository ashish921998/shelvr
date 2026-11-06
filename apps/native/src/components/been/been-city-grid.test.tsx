// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HEADLINE_MAX_SCALE, LARGE_TEXT_SCALE } from "@/lib/use-large-text";
import { BeenCityGrid } from "./been-city-grid";

const mocks = vi.hoisted(() => ({
  tag: "en-US",
  fontScale: 1,
  dismiss: vi.fn(),
  selection: vi.fn(async () => {}),
}));

vi.mock("expo-localization", () => ({
  getLocales: () => [{ languageTag: mocks.tag }],
  useLocales: () => [{ languageTag: mocks.tag }],
}));
vi.mock("react-native", () => ({
  Keyboard: { dismiss: mocks.dismiss },
  useWindowDimensions: () => ({ fontScale: mocks.fontScale }),
  View: vi.fn(({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  )),
  Text: vi.fn(
    ({
      children,
      maxFontSizeMultiplier,
    }: {
      children?: ReactNode;
      maxFontSizeMultiplier?: number;
    }) => <span data-max-scale={maxFontSizeMultiplier}>{children}</span>,
  ),
  ScrollView: vi.fn(
    ({
      children,
      automaticallyAdjustKeyboardInsets,
    }: {
      children?: ReactNode;
      automaticallyAdjustKeyboardInsets?: boolean;
    }) => (
      <div
        data-testid="scroll"
        data-keyboard-insets={automaticallyAdjustKeyboardInsets}
      >
        {children}
      </div>
    ),
  ),
  TextInput: vi.fn(
    ({
      value,
      placeholder,
      onChangeText,
      maxFontSizeMultiplier,
    }: {
      value: string;
      placeholder: string;
      onChangeText: (text: string) => void;
      maxFontSizeMultiplier?: number;
    }) => (
      <input
        value={value}
        placeholder={placeholder}
        data-max-scale={maxFontSizeMultiplier}
        onChange={(event) => onChangeText(event.target.value)}
      />
    ),
  ),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: () => new Proxy({}, { get: (_, name) => ({ name }) }),
    absoluteFill: {},
    absoluteFillObject: {},
  },
  useUnistyles: () => ({
    theme: { colors: { muted: "gray", faint: "gray", onTint: "ink" } },
  }),
}));
vi.mock("expo-image", () => ({ Image: vi.fn(() => null) }));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/lib/haptics", () => ({
  haptics: { selection: mocks.selection },
}));
vi.mock("@/components/onboarding/parts", () => ({
  ScalePressable: vi.fn(
    ({
      children,
      onPress,
      accessibilityLabel,
      accessibilityState,
      testID,
      style,
    }: {
      children?: ReactNode;
      onPress: () => void;
      accessibilityLabel: string;
      accessibilityState: { checked: boolean };
      testID: string;
      style: unknown;
    }) => (
      <button
        type="button"
        role="checkbox"
        aria-checked={accessibilityState.checked}
        aria-label={accessibilityLabel}
        data-testid={testID}
        data-style={JSON.stringify(style)}
        onClick={onPress}
      >
        {children}
      </button>
    ),
  ),
}));

const tiles = () => screen.queryAllByRole("checkbox");
const names = () => tiles().map((tile) => tile.getAttribute("aria-label"));
const grid = (picked: string[] = [], onToggle = vi.fn()) =>
  render(
    <BeenCityGrid
      header={<h1>Where have you been?</h1>}
      picked={picked as never[]}
      onToggle={onToggle}
    />,
  );
const scroll = () => within(screen.getByTestId("scroll"));
const wide = (id: string) =>
  screen
    .getByTestId(`been-city-${id}`)
    .getAttribute("data-style")
    ?.includes('"tileWide"');

beforeEach(() => {
  mocks.tag = "en-US";
  mocks.fontScale = 1;
  mocks.dismiss.mockClear();
  mocks.selection.mockClear();
});

describe("BeenCityGrid", () => {
  it("lists every city as a checkbox sorted by name, with the picked ones checked", () => {
    grid(["madrid", "lisbon"]);
    expect(tiles()).toHaveLength(25);
    const listed = names() as string[];
    expect(listed).toEqual([...listed].sort((a, b) => a.localeCompare(b)));
    expect(listed.slice(0, 3)).toEqual(["Amsterdam", "Austin", "Barcelona"]);
    expect(
      tiles()
        .filter((tile) => tile.getAttribute("aria-checked") === "true")
        .map((tile) => tile.getAttribute("aria-label")),
    ).toEqual(["Lisbon", "Madrid"]);
    expect(screen.getByTestId("been-city-lisbon")).toBeTruthy();
  });

  it("searches French names without accents, and by the English id", () => {
    mocks.tag = "fr-FR";
    grid();
    const search = screen.getByPlaceholderText("Rechercher une ville");
    fireEvent.change(search, { target: { value: "montreal" } });
    expect(names()).toEqual(["Montréal"]);
    fireEvent.change(search, { target: { value: "copenhagen" } });
    expect(names()).toEqual(["Copenhague"]);
    fireEvent.change(search, { target: { value: "zzz" } });
    expect(tiles()).toHaveLength(0);
    expect(
      screen.getByText("Nous n’avons pas encore cette ville."),
    ).toBeTruthy();
  });

  it("closes the keyboard, then plays the haptic, then toggles the city", () => {
    const onToggle = vi.fn();
    grid([], onToggle);
    fireEvent.change(screen.getByPlaceholderText("Search cities"), {
      target: { value: "lis" },
    });
    expect(names()).toEqual(["Lisbon"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Lisbon" }));
    expect(onToggle).toHaveBeenCalledWith("lisbon");
    const [dismissed] = mocks.dismiss.mock.invocationCallOrder;
    const [played] = mocks.selection.mock.invocationCallOrder;
    const [toggled] = onToggle.mock.invocationCallOrder;
    expect(dismissed).toBeLessThan(played);
    expect(played).toBeLessThan(toggled);
  });

  it("keeps the header and search above the scrolling tiles, three to a row", () => {
    grid();
    expect(screen.getByText("Where have you been?")).toBeTruthy();
    expect(scroll().queryByText("Where have you been?")).toBeNull();
    expect(scroll().queryByPlaceholderText("Search cities")).toBeNull();
    expect(wide("lisbon")).toBe(false);
  });

  it("scrolls the header and search with the tiles at the largest text sizes, two to a row", () => {
    mocks.fontScale = 3;
    grid();
    expect(scroll().getByText("Where have you been?")).toBeTruthy();
    expect(scroll().getByPlaceholderText("Search cities")).toBeTruthy();
    expect(wide("lisbon")).toBe(true);
    expect(
      screen.getByTestId("scroll").getAttribute("data-keyboard-insets"),
    ).toBe("true");
  });

  it("stops the names and the search text growing past what a tile and the field hold", () => {
    mocks.fontScale = 3;
    grid();
    expect(
      within(screen.getByTestId("been-city-copenhagen"))
        .getByText("Copenhagen")
        .getAttribute("data-max-scale"),
    ).toBe(String(LARGE_TEXT_SCALE));
    expect(
      screen
        .getByPlaceholderText("Search cities")
        .getAttribute("data-max-scale"),
    ).toBe(String(HEADLINE_MAX_SCALE));
  });
});
