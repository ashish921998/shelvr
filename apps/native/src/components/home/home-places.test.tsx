// @vitest-environment jsdom
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UnplacedSaves } from "@/components/home/home-places";

vi.mock("@/components/city/city-cover", () => ({
  CityCover: vi.fn(() => null),
}));
vi.mock("@/lib/entitlement", () => ({
  useEntitlement: vi.fn(),
  usePaywallGuard: vi.fn(),
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
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

describe("unplaced save states", () => {
  it("shows finding places while a save reads, and nothing once it finishes", () => {
    const { rerender } = render(
      <UnplacedSaves
        saves={[{ _id: "new", status: "processing", title: "New reel" }]}
      />,
    );
    expect(screen.getAllByText("Finding places…")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "New reel, Finding places…" }),
    ).toBeTruthy();

    rerender(
      <UnplacedSaves
        saves={[{ _id: "new", status: "ready", title: "New reel", cities: [] }]}
      />,
    );
    expect(screen.queryByText("Finding places…")).toBeNull();
    expect(screen.queryByText("New reel")).toBeNull();
  });

  it("leaves failed and placeless saves off Home's list", () => {
    render(
      <UnplacedSaves
        saves={[
          { _id: "pending", status: "processing", title: "Pending reel" },
          { _id: "failed", status: "failed", title: "Failed reel" },
          { _id: "empty", status: "ready", title: "Empty reel" },
        ]}
      />,
    );
    expect(screen.getByText("Pending reel")).toBeTruthy();
    expect(screen.queryByText("Failed reel")).toBeNull();
    expect(screen.queryByText("Empty reel")).toBeNull();
  });

  it("expands processing saves", () => {
    render(
      <UnplacedSaves
        saves={Array.from({ length: 6 }, (_, index) => ({
          _id: String(index),
          status: "processing",
          title: `Pending ${index}`,
        }))}
      />,
    );
    expect(screen.queryByText("Pending 5")).toBeNull();
    fireEvent.click(screen.getByText("+ 1 more"));
    expect(screen.getByText("Pending 5")).toBeTruthy();
  });
});
