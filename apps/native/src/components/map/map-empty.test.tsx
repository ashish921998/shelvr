// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { MapEmpty } from "./map-empty";

vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}), hairlineWidth: 1 },
  useUnistyles: () => ({ theme: { colors: { foreground: "#000" } } }),
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  Pressable: vi.fn(
    ({
      children,
      onPress,
      accessibilityLabel,
    }: {
      children: ReactNode;
      onPress: () => void;
      accessibilityLabel: string;
    }) => (
      <button aria-label={accessibilityLabel} onClick={onPress}>
        {children}
      </button>
    ),
  ),
}));

it("explains the empty map and offers the person's location when it is on", () => {
  const onLocate = vi.fn();
  render(<MapEmpty located onLocate={onLocate} />);
  expect(screen.getByText("map.emptyTitle")).toBeTruthy();
  expect(screen.getByText("map.emptyBody")).toBeTruthy();
  fireEvent.click(screen.getByLabelText("map.showMyLocation"));
  expect(onLocate).toHaveBeenCalledTimes(1);
});

it("has no location button without location permission", () => {
  render(<MapEmpty located={false} onLocate={vi.fn()} />);
  expect(screen.queryByLabelText("map.showMyLocation")).toBeNull();
});
