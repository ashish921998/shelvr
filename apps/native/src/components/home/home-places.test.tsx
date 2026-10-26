// @vitest-environment jsdom
import type { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
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
    ({ children, onPress }: { children: ReactNode; onPress: () => void }) => (
      <button onClick={onPress}>{children}</button>
    ),
  ),
}));

describe("unplaced save states", () => {
  it("shows finding places until processing finishes, then shows no place found only without a city", () => {
    const { rerender } = render(
      <UnplacedSaves
        saves={[{ _id: "new", status: "processing", title: "New reel" }]}
      />,
    );
    expect(screen.getAllByText("Finding places…")).toHaveLength(1);
    expect(screen.queryByText("No place found")).toBeNull();

    rerender(
      <UnplacedSaves
        saves={[{ _id: "new", status: "ready", title: "New reel", cities: [] }]}
      />,
    );
    expect(screen.getByText("No place found")).toBeTruthy();
    expect(screen.queryByText("Finding places…")).toBeNull();

    rerender(
      <UnplacedSaves
        saves={[
          {
            _id: "new",
            status: "ready",
            title: "New reel",
            cities: ["New York"],
          },
        ]}
      />,
    );
    expect(screen.queryByText("New reel")).toBeNull();
    expect(screen.queryByText("No place found")).toBeNull();
  });

  it("keeps processing, failed and completed saves under their own headings", () => {
    render(
      <UnplacedSaves
        saves={[
          { _id: "pending", status: "processing", title: "Pending reel" },
          { _id: "failed", status: "failed", title: "Failed reel" },
          { _id: "empty", status: "ready", title: "Empty reel" },
        ]}
      />,
    );
    const emptySection = screen.getByText("No place found").parentElement!;
    expect(within(emptySection).getByText("Empty reel")).toBeTruthy();
    expect(within(emptySection).queryByText("Pending reel")).toBeNull();
    expect(within(emptySection).queryByText("Failed reel")).toBeNull();
    expect(screen.getAllByText("Finding places…")).toHaveLength(1);
    expect(screen.getAllByText("Couldn't read these saves")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Pending reel" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Failed reel" })).toBeTruthy();
  });

  it("expands processing saves without labeling them as missing places", () => {
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
    expect(screen.queryByText("No place found")).toBeNull();
  });
});
