// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { MapFilterChips } from "./map-filter-chips";

vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/components/glass", () => ({
  hasLiquidGlass: false,
  GlassView: vi.fn(),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}), hairlineWidth: 1 },
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

it("lists All then each filter, and a second tap on the selected filter returns to All", () => {
  const onSelect = vi.fn();
  const { rerender } = render(
    <MapFilterChips
      kinds={["dessert", "dateNight"]}
      selected={null}
      onSelect={onSelect}
    />,
  );
  expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
    "map.filterAll",
    "map.kindDessert",
    "map.kindDateNight",
  ]);
  expect(screen.getByLabelText("map.filterAll").ariaPressed).toBe("true");

  fireEvent.click(screen.getByLabelText("map.kindDateNight"));
  expect(onSelect).toHaveBeenLastCalledWith("dateNight");

  rerender(
    <MapFilterChips
      kinds={["dessert", "dateNight"]}
      selected="dateNight"
      onSelect={onSelect}
    />,
  );
  fireEvent.click(screen.getByLabelText("map.kindDateNight"));
  expect(onSelect).toHaveBeenLastCalledWith(null);
});
