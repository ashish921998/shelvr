// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import { SaveRow } from "./save-row";

vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("expo-image", () => ({ Image: vi.fn(() => null) }));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({ theme: { colors: {} } }),
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  )),
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
  Pressable: vi.fn(
    ({
      children,
      onPress,
      accessibilityLabel,
      accessibilityValue,
    }: {
      children: ReactNode;
      onPress: () => void;
      accessibilityLabel?: string;
      accessibilityValue?: { text: string };
    }) => (
      <button
        onClick={onPress}
        aria-label={accessibilityLabel}
        data-value={accessibilityValue?.text}
      >
        {children}
      </button>
    ),
  ),
}));

const item = {
  _id: "item-1" as Id<"items">,
  title: "Austin coffee crawl",
  imageUrl: null,
};

describe("SaveRow", () => {
  it("shows the tally beside the source and reads it as the row's value", () => {
    render(
      <SaveRow
        item={item}
        placeName="Jo's Coffee"
        emoji="☕"
        onPress={vi.fn()}
        tally={{ picks: 1, passes: 0 }}
      />,
    );
    const tally = screen.getByText("✓ 1 · ✕ 0");
    expect(tally.parentElement).toBe(
      screen.getByText("Austin coffee crawl").parentElement,
    );
    const row = screen.getByRole("button", { name: "Jo's Coffee" });
    expect(row.dataset.value).toBe("1 would go, 0 would pass");
  });

  it("shows a tally on a row with no source", () => {
    render(
      <SaveRow
        item={{ _id: item._id, imageUrl: null }}
        placeName="Houndstooth Coffee"
        onPress={vi.fn()}
        tally={{ picks: 1, passes: 1 }}
      />,
    );
    expect(screen.getByText("✓ 1 · ✕ 1")).toBeTruthy();
  });

  it("has no tally and no value without votes", () => {
    render(<SaveRow item={item} placeName="Jo's Coffee" onPress={vi.fn()} />);
    expect(screen.queryByText(/✓/)).toBeNull();
    expect(screen.getByText("Austin coffee crawl")).toBeTruthy();
    const row = screen.getByRole("button", { name: "Jo's Coffee" });
    expect(row.dataset.value).toBeUndefined();
  });
});
