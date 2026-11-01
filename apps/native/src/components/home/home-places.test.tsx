// @vitest-environment jsdom
import type { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HomePlaces, UnplacedSaves } from "@/components/home/home-places";

const mocks = vi.hoisted(() => ({
  cities: [] as {
    city: string;
    count: number;
    placeCount?: number;
    cover: string | null;
  }[],
  start: vi.fn(),
  busy: null as "date" | "trip" | null,
}));

vi.mock("@/components/city/city-cover", () => ({
  CityCover: vi.fn(({ entry }: { entry: { city: string } }) => (
    <span>{entry.city}</span>
  )),
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/ui/prompt-sheet", () => ({
  PromptSheet: vi.fn(
    ({
      visible,
      title,
      children,
      onDismiss,
    }: {
      visible: boolean;
      title: string;
      children: ReactNode;
      onDismiss?: () => void;
    }) => (
      <>
        {visible ? (
          <div data-testid="sheet">
            <h1>{title}</h1>
            {children}
          </div>
        ) : null}
        <button onClick={onDismiss}>dismissed</button>
      </>
    ),
  ),
}));
vi.mock("@/lib/city-plan", () => ({
  useCityPlan: () => ({ busy: mocks.busy, start: mocks.start }),
}));
vi.mock("@/lib/entitlement", () => ({
  useEntitlement: () => ({ entitled: true }),
  usePaywallGuard: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mocks.cities }),
}));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: vi.fn() }));
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

describe("plan tiles", () => {
  const entry = (city: string, placeCount?: number) => ({
    city,
    count: 2,
    placeCount,
    cover: null,
  });

  beforeEach(() => {
    mocks.start.mockReset();
    mocks.busy = null;
    vi.unstubAllEnvs();
  });

  it("shows no tiles when no city has a mapped place", () => {
    mocks.cities = [entry("Rome", 0)];
    render(<HomePlaces />);
    expect(screen.queryByText("Plan a date")).toBeNull();
    expect(screen.queryByText("Plan a trip")).toBeNull();
  });

  it("starts the plan directly when one city is plannable", () => {
    mocks.cities = [entry("Lisbon", 3), entry("Rome", 0)];
    render(<HomePlaces />);
    fireEvent.click(
      screen.getByRole("button", { name: "Plan a date, In Lisbon" }),
    );
    expect(mocks.start).toHaveBeenCalledWith("date", "Lisbon");
    fireEvent.click(
      screen.getByRole("button", { name: "Plan a trip, In Lisbon" }),
    );
    expect(mocks.start).toHaveBeenCalledWith("trip", "Lisbon");
  });

  it("treats a city with no place count as plannable", () => {
    mocks.cities = [entry("Lisbon")];
    render(<HomePlaces />);
    expect(
      screen.getByRole("button", { name: "Plan a date, In Lisbon" }),
    ).toBeTruthy();
  });

  it("offers only cities with places in the picker and starts after it closes", () => {
    mocks.cities = [entry("Lisbon", 3), entry("Austin", 5), entry("Rome", 0)];
    render(<HomePlaces />);
    fireEvent.click(
      screen.getByRole("button", { name: "Plan a trip, Pick a city" }),
    );
    const sheet = within(screen.getByTestId("sheet"));
    expect(sheet.getByText("Plan a trip")).toBeTruthy();
    expect(sheet.queryByText("Rome")).toBeNull();
    fireEvent.click(sheet.getByRole("button", { name: "Austin, 5 places" }));
    expect(mocks.start).toHaveBeenCalledWith("trip", "Austin");
    expect(screen.queryByTestId("sheet")).toBeNull();
  });

  it("waits for the sheet to dismiss on iOS before starting", () => {
    vi.stubEnv("EXPO_OS", "ios");
    mocks.cities = [entry("Lisbon", 3), entry("Austin", 5)];
    render(<HomePlaces />);
    fireEvent.click(
      screen.getByRole("button", { name: "Plan a date, Pick a city" }),
    );
    fireEvent.click(
      within(screen.getByTestId("sheet")).getByRole("button", {
        name: "Lisbon, 3 places",
      }),
    );
    expect(mocks.start).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("dismissed"));
    expect(mocks.start).toHaveBeenCalledWith("date", "Lisbon");
  });

  it("disables both tiles while a plan is starting", () => {
    mocks.busy = "date";
    mocks.cities = [entry("Lisbon", 3)];
    render(<HomePlaces />);
    const tile = screen.getByRole("button", { name: "Plan a trip, In Lisbon" });
    expect((tile as HTMLButtonElement).disabled).toBe(true);
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

  it("shows the share tip only for a single city", () => {
    mocks.cities = [{ city: "Lisbon", count: 1, placeCount: 1, cover: null }];
    const { unmount } = render(<HomePlaces />);
    expect(screen.getByText(/Share a reel or TikTok to Shelvr/)).toBeTruthy();
    unmount();
    mocks.cities = [
      { city: "Lisbon", count: 1, placeCount: 1, cover: null },
      { city: "Rome", count: 1, placeCount: 1, cover: null },
    ];
    render(<HomePlaces />);
    expect(screen.queryByText(/Share a reel or TikTok to Shelvr/)).toBeNull();
  });
});
