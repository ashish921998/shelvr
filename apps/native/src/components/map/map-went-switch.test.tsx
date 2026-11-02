// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { haptics } from "@/lib/haptics";
import { MapWentSwitch } from "./map-went-switch";

vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}), hairlineWidth: 1 },
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
  Pressable: vi.fn(
    ({
      children,
      onPress,
      accessibilityState,
    }: {
      children: ReactNode;
      onPress: () => void;
      accessibilityState: { selected: boolean };
    }) => (
      <button aria-pressed={accessibilityState.selected} onClick={onPress}>
        {children}
      </button>
    ),
  ),
}));

it("shows All, Want to go and Went with the chosen one selected", () => {
  render(<MapWentSwitch selected="went" onSelect={vi.fn()} />);
  expect(
    screen.getAllByRole("button").map((b) => [b.textContent, b.ariaPressed]),
  ).toEqual([
    ["map.filterAll", "false"],
    ["passport.wantToGo", "false"],
    ["passport.wentNoDate", "true"],
  ]);
});

it("ticks and switches on a new choice, and does nothing on the chosen one", () => {
  const selection = vi.spyOn(haptics, "selection");
  const onSelect = vi.fn();
  render(<MapWentSwitch selected="all" onSelect={onSelect} />);

  fireEvent.click(screen.getByText("map.filterAll"));
  expect(onSelect).not.toHaveBeenCalled();
  expect(selection).not.toHaveBeenCalled();

  fireEvent.click(screen.getByText("passport.wantToGo"));
  expect(onSelect).toHaveBeenCalledWith("want");
  expect(selection).toHaveBeenCalledTimes(1);
  selection.mockRestore();
});
