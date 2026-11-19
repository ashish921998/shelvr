// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { MapKindRow } from "./map-kind-row";

vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));
vi.mock("react-native", () => ({
  ScrollView: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )),
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
  Pressable: vi.fn(
    ({
      children,
      onPress,
      accessibilityLabel,
      accessibilityState,
    }: {
      children: ReactNode;
      onPress: () => void;
      accessibilityLabel: string;
      accessibilityState: { selected: boolean };
    }) => (
      <button
        aria-label={accessibilityLabel}
        aria-pressed={accessibilityState.selected}
        onClick={onPress}
      >
        {children}
      </button>
    ),
  ),
}));

it("shows each kind's emoji over its name and toggles the one tapped", () => {
  const onSelect = vi.fn();
  render(
    <MapKindRow
      kinds={["food", "drinks", "stay"]}
      selected={["drinks"]}
      onSelect={onSelect}
    />,
  );
  expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
    "🍽️map.kindFood",
    "🍸map.kindDrinks",
    "🛏️map.kindStay",
  ]);
  expect(screen.getByLabelText("map.kindDrinks").ariaPressed).toBe("true");
  expect(screen.getByLabelText("map.kindFood").ariaPressed).toBe("false");

  fireEvent.click(screen.getByLabelText("map.kindDrinks"));
  expect(onSelect).toHaveBeenLastCalledWith("drinks");
  fireEvent.click(screen.getByLabelText("map.kindStay"));
  expect(onSelect).toHaveBeenLastCalledWith("stay");
});
