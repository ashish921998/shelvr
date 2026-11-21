// @vitest-environment jsdom
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { HomePlaces, UnplacedSaves } from "@/components/home/home-places";

const mocks = vi.hoisted(() => ({
  cities: [] as {
    city: string;
    count: number;
    placeCount?: number;
    cover: string | null;
  }[],
  push: vi.fn(),
  access: { kind: "pro", syncing: false } as Record<string, unknown>,
}));

vi.mock("@/components/city/city-cover", () => ({
  CityCover: vi.fn(({ entry }: { entry: { city: string } }) => (
    <span>{entry.city}</span>
  )),
}));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("@/lib/free-plan", () => ({
  useAccess: () => mocks.access,
  useSaveGuard: () => ({ guard: vi.fn(), loading: false }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mocks.cities }),
}));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: vi.fn() }));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
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
  ScrollView: vi.fn(({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  )),
  Pressable: vi.fn(
    ({
      children,
      onPress,
      accessibilityLabel,
      disabled,
    }: {
      children: ReactNode;
      onPress: () => void;
      accessibilityLabel?: string;
      disabled?: boolean;
    }) => (
      <button
        onClick={onPress}
        aria-label={accessibilityLabel}
        disabled={disabled}
      >
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

  it("names an untitled save that is still reading by its site, not its URL", () => {
    render(
      <UnplacedSaves
        saves={[
          {
            _id: "new",
            status: "processing",
            url: "https://www.timeout.com/lisbon/restaurants",
          },
        ]}
      />,
    );
    expect(screen.getByText("timeout.com")).toBeTruthy();
    expect(screen.queryByText(/https:/)).toBeNull();
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

describe("city cards", () => {
  it("names a city's status for screen readers, including no place yet", () => {
    mocks.cities = [
      { city: "Lisbon", count: 2, placeCount: 3, cover: null },
      { city: "Tokyo", count: 3, placeCount: 0, cover: null },
    ];
    render(<HomePlaces />);
    expect(
      screen.getByRole("button", { name: "Lisbon, 3 places" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Tokyo, 3 saves, no place yet" }),
    ).toBeTruthy();
  });

  it("shows the first four cities in order and opens the full grid", () => {
    mocks.cities = ["Houston", "Kyoto", "Austin", "Lisbon", "Rome"].map(
      (city) => ({ city, count: 1, placeCount: 1, cover: null }),
    );
    render(<HomePlaces />);
    expect(screen.getByText("Your cities")).toBeTruthy();
    expect(
      screen.getAllByRole("button").map((button) => button.textContent),
    ).toEqual(["+ 1 more", "Houston", "Kyoto", "Austin", "Lisbon"]);
    fireEvent.click(screen.getByRole("button", { name: "+ 1 more" }));
    expect(mocks.push).toHaveBeenCalledWith("/cities");
    fireEvent.click(screen.getByRole("button", { name: "Kyoto, 1 place" }));
    expect(mocks.push).toHaveBeenCalledWith({
      pathname: "/city/[name]",
      params: { name: "Kyoto" },
    });
  });
});
