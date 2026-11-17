// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { LibraryRows } from "@/components/home/library-rows";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  navigate: vi.fn(),
  signedIn: true,
  feed: { items: [] as unknown[], canLoadMore: false, loadingMore: false },
  trips: undefined as { count: number; more: boolean } | undefined,
  tripsArgs: [] as unknown[],
  tripError: null as Error | null,
  report: vi.fn(),
}));

vi.mock("@/components/home/home-row", () => ({
  HomeRow: vi.fn(
    ({
      name,
      count,
      onPress,
    }: {
      name: string;
      count?: string | number;
      onPress: () => void;
    }) => (
      <button onClick={onPress}>
        {count === undefined ? name : `${name}, ${count}`}
      </button>
    ),
  ),
}));
vi.mock("@/lib/home-feed", () => ({ useHomeFeed: () => mocks.feed }));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: mocks.signedIn }),
}));
vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (_query: unknown, args: unknown) => {
    mocks.tripsArgs.push(args);
    return {};
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mocks.trips, error: mocks.tripError }),
}));
vi.mock("@/lib/use-report-load-failure", () => ({
  useReportLoadFailure: mocks.report,
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: mocks.push, navigate: mocks.navigate }),
}));

const rows = (count: number) => Array.from({ length: count }, () => ({}));

beforeEach(() => {
  vi.stubGlobal("__DEV__", true);
  mocks.report.mockClear();
  mocks.push.mockReset();
  mocks.navigate.mockReset();
  mocks.signedIn = true;
  mocks.feed = { items: rows(23), canLoadMore: false, loadingMore: false };
  mocks.trips = { count: 3, more: false };
  mocks.tripsArgs = [];
  mocks.tripError = null;
});

afterEach(() => vi.unstubAllGlobals());

it("counts every save and trip once all of them are loaded", () => {
  render(<LibraryRows />);
  expect(screen.getAllByRole("button").map((row) => row.textContent)).toEqual([
    "Trips, 3",
    "Passport",
    "All saves, 23",
    "Collections",
  ]);
});

it.each([
  ["more pages to load", { canLoadMore: true, loadingMore: false }],
  ["a page loading", { canLoadMore: false, loadingMore: true }],
])("shows the saves count as a floor with %s", (_name, feed) => {
  mocks.feed = { items: rows(40), ...feed };
  render(<LibraryRows />);
  expect(screen.getByText("All saves, 40+")).toBeTruthy();
});

it("shows the trips count as a floor while more trips remain", () => {
  mocks.trips = { count: 50, more: true };
  render(<LibraryRows />);
  expect(screen.getByText("Trips, 50+")).toBeTruthy();
});

it("shows no trips count before the first page arrives", () => {
  mocks.trips = undefined;
  render(<LibraryRows />);
  expect(screen.getByText("Trips")).toBeTruthy();
});

it("puts Cities between Trips and All saves, and hides it without cities", () => {
  const { unmount } = render(<LibraryRows cityCount={4} />);
  expect(screen.getAllByRole("button").map((row) => row.textContent)).toEqual([
    "Trips, 3",
    "Passport",
    "Cities, 4",
    "All saves, 23",
    "Collections",
  ]);
  unmount();
  render(<LibraryRows cityCount={0} />);
  expect(screen.queryByText(/Cities/)).toBeNull();
});

it("opens Cities, All saves and the Trips and Passport tabs", () => {
  render(<LibraryRows cityCount={4} />);
  fireEvent.click(screen.getByText("Cities, 4"));
  expect(mocks.push).toHaveBeenCalledWith("/cities");
  fireEvent.click(screen.getByText("All saves, 23"));
  expect(mocks.push).toHaveBeenCalledWith("/saves");
  fireEvent.click(screen.getByText("Trips, 3"));
  expect(mocks.navigate).toHaveBeenCalledWith("/(app)/(tabs)/(trips)");
  fireEvent.click(screen.getByText("Collections"));
  expect(mocks.push).toHaveBeenCalledWith("/collections");
  fireEvent.click(screen.getByText("Passport"));
  expect(mocks.navigate).toHaveBeenCalledWith("/(app)/(tabs)/(passport)");
});

it("keeps Trips and leaves out All saves when there are no saves", () => {
  mocks.feed = { items: [], canLoadMore: false, loadingMore: false };
  render(<LibraryRows />);
  expect(screen.getAllByRole("button").map((row) => row.textContent)).toEqual([
    "Trips, 3",
    "Passport",
    "Collections",
  ]);
  fireEvent.click(screen.getByText("Trips, 3"));
  expect(mocks.navigate).toHaveBeenCalledWith("/(app)/(tabs)/(trips)");
});

it("asks for no trips while signed out", () => {
  mocks.signedIn = false;
  render(<LibraryRows />);
  expect(mocks.tripsArgs).toEqual(["skip"]);
});

it("keeps Trips and Collections usable if the trip count fails", () => {
  mocks.trips = undefined;
  mocks.tripError = new Error("Trip count unavailable");
  render(<LibraryRows />);
  expect(mocks.report).toHaveBeenCalledWith(
    "library_trip_count_failed",
    expect.objectContaining({ error: mocks.tripError }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Trips" }));
  expect(mocks.navigate).toHaveBeenCalledWith("/(app)/(tabs)/(trips)");
  fireEvent.click(screen.getByRole("button", { name: "Collections" }));
  expect(mocks.push).toHaveBeenCalledWith("/collections");
});

it.each([true, false])(
  "reports the undeployed count query only outside dev (dev: %s)",
  (dev) => {
    vi.stubGlobal("__DEV__", dev);
    mocks.trips = undefined;
    mocks.tripError = new Error(
      "Could not find public function for 'tripPlannerData:countTripPlans'.",
    );
    render(<LibraryRows />);
    expect(screen.getByRole("button", { name: "Trips" })).toBeTruthy();
    expect(mocks.report).toHaveBeenCalledWith(
      "library_trip_count_failed",
      expect.objectContaining({ error: dev ? null : mocks.tripError }),
    );
  },
);
