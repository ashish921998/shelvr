// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { haptics } from "@/lib/haptics";
import { MapFilterChips } from "./map-filter-chips";

vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
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

it("lists only the filters, and a second tap on the selected one turns it off", () => {
  const onSelect = vi.fn();
  const { rerender } = render(
    <MapFilterChips
      kinds={["dessert", "dateNight"]}
      selected={null}
      onSelect={onSelect}
    />,
  );
  expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
    "🍰 map.kindDessert",
    "💕 map.kindDateNight",
  ]);

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

it.each([
  ["a new filter", null, 1],
  ["turning the selected filter off", "dessert", 1],
] as const)("ticks %s once", (_, selected, ticks) => {
  const selection = vi.spyOn(haptics, "selection");
  render(
    <MapFilterChips
      kinds={["dessert"]}
      selected={selected}
      onSelect={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByLabelText("map.kindDessert"));
  expect(selection).toHaveBeenCalledTimes(ticks);
  selection.mockRestore();
});
