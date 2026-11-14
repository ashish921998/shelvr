// @vitest-environment jsdom
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { HomeRow } from "@/components/home/home-row";

vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({ theme: { colors: { muted: "#6f6455" } } }),
}));
vi.mock("react-native", () => ({
  Pressable: vi.fn(
    ({
      children,
      onPress,
      accessibilityLabel,
    }: {
      children: ReactNode;
      onPress: () => void;
      accessibilityLabel?: string;
    }) => (
      <button onClick={onPress} aria-label={accessibilityLabel}>
        {children}
      </button>
    ),
  ),
}));

it("puts the count in the title and reads it aloud after a comma", () => {
  const onPress = vi.fn();
  render(<HomeRow icon="airplane" name="Trips" count={2} onPress={onPress} />);
  expect(screen.getByText("Trips (2)")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Trips, 2" }));
  expect(onPress).toHaveBeenCalled();
});

it("keeps a floor count as text", () => {
  render(
    <HomeRow
      icon="bookmark.fill"
      name="All saves"
      count="50+"
      onPress={vi.fn()}
    />,
  );
  expect(screen.getByRole("button", { name: "All saves, 50+" })).toBeTruthy();
});

it("shows the bare name without a count", () => {
  render(<HomeRow icon="airplane" name="Trips" onPress={vi.fn()} />);
  expect(screen.getByText("Trips")).toBeTruthy();
});
