// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BeenCityGrid } from "./been-city-grid";

const mocks = vi.hoisted(() => ({
  tag: "en-US",
  dismiss: vi.fn(),
  selection: vi.fn(async () => {}),
}));

vi.mock("expo-localization", () => ({
  getLocales: () => [{ languageTag: mocks.tag }],
  useLocales: () => [{ languageTag: mocks.tag }],
}));
vi.mock("react-native", () => ({
  Keyboard: { dismiss: mocks.dismiss },
  View: vi.fn(({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  )),
  Text: vi.fn(({ children }: { children?: ReactNode }) => (
    <span>{children}</span>
  )),
  ScrollView: vi.fn(({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  )),
  TextInput: vi.fn(
    ({
      value,
      placeholder,
      onChangeText,
    }: {
      value: string;
      placeholder: string;
      onChangeText: (text: string) => void;
    }) => (
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChangeText(event.target.value)}
      />
    ),
  ),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: () => new Proxy({}, { get: () => ({}) }),
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
    }: {
      children?: ReactNode;
      onPress: () => void;
      accessibilityLabel: string;
      accessibilityState: { checked: boolean };
      testID: string;
    }) => (
      <button
        type="button"
        role="checkbox"
        aria-checked={accessibilityState.checked}
        aria-label={accessibilityLabel}
        data-testid={testID}
        onClick={onPress}
      >
        {children}
      </button>
    ),
  ),
}));

const tiles = () => screen.queryAllByRole("checkbox");
const names = () => tiles().map((tile) => tile.getAttribute("aria-label"));

beforeEach(() => {
  mocks.tag = "en-US";
  mocks.dismiss.mockClear();
  mocks.selection.mockClear();
});

describe("BeenCityGrid", () => {
  it("lists every city as a checkbox sorted by name, with the picked ones checked", () => {
    render(<BeenCityGrid picked={["madrid", "lisbon"]} onToggle={vi.fn()} />);
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
    render(<BeenCityGrid picked={[]} onToggle={vi.fn()} />);
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
    render(<BeenCityGrid picked={[]} onToggle={onToggle} />);
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
});
