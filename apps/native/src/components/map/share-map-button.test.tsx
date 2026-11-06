// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { ShareMapButton } from "./share-map-button";

vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({
    theme: {
      colors: { foreground: "#000" },
      control: { pressRetentionOffset: 12 },
    },
  }),
}));
vi.mock("react-native", () => ({
  Pressable: vi.fn(
    ({
      children,
      onPress,
      testID,
      accessibilityLabel,
    }: {
      children: ReactNode;
      onPress: () => void;
      testID?: string;
      accessibilityLabel?: string;
    }) => (
      <button
        type="button"
        data-testid={testID}
        aria-label={accessibilityLabel}
        onClick={onPress}
      >
        {children}
      </button>
    ),
  ),
}));

it("names the map share action and hands the tap back", () => {
  const onPress = vi.fn();
  render(<ShareMapButton onPress={onPress} />);
  const button = screen.getByRole("button", { name: "publicMap.open" });
  expect(button.dataset.testid).toBe("map-share-button");
  fireEvent.click(button);
  expect(onPress).toHaveBeenCalledTimes(1);
});
