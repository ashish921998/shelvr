// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { LibraryRows } from "@/components/home/library-rows";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  navigate: vi.fn(),
  signedIn: true,
  feed: { items: [] as unknown[], canLoadMore: false, loadingMore: false },
  trips: { results: [] as unknown[], status: "Exhausted" },
  tripsArgs: [] as unknown[],
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
  usePaginatedQuery: (_query: unknown, args: unknown) => {
    mocks.tripsArgs.push(args);
    return mocks.trips;
  },
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: mocks.push, navigate: mocks.navigate }),
}));

const rows = (count: number) => Array.from({ length: count }, () => ({}));

beforeEach(() => {
  mocks.push.mockReset();
  mocks.navigate.mockReset();
  mocks.signedIn = true;
  mocks.feed = { items: rows(23), canLoadMore: false, loadingMore: false };
  mocks.trips = { results: rows(3), status: "Exhausted" };
  mocks.tripsArgs = [];
});

it("counts every save and trip once all of them are loaded", () => {
  render(<LibraryRows />);
  expect(screen.getAllByRole("button").map((row) => row.textContent)).toEqual([
    "Trips, 3",
    "All saves, 23",
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
  mocks.trips = { results: rows(50), status: "CanLoadMore" };
  render(<LibraryRows />);
  expect(screen.getByText("Trips, 50+")).toBeTruthy();
});

it("shows no trips count before the first page arrives", () => {
  mocks.trips = { results: [], status: "LoadingFirstPage" };
  render(<LibraryRows />);
  expect(screen.getByText("Trips")).toBeTruthy();
});

it("puts Cities between Trips and All saves, and hides it without cities", () => {
  const { unmount } = render(<LibraryRows cityCount={4} />);
  expect(screen.getAllByRole("button").map((row) => row.textContent)).toEqual([
    "Trips, 3",
    "Cities, 4",
    "All saves, 23",
  ]);
  unmount();
  render(<LibraryRows cityCount={0} />);
  expect(screen.queryByText(/Cities/)).toBeNull();
});

it("opens Cities, All saves and the Trips tab", () => {
  render(<LibraryRows cityCount={4} />);
  fireEvent.click(screen.getByText("Cities, 4"));
  expect(mocks.push).toHaveBeenCalledWith("/cities");
  fireEvent.click(screen.getByText("All saves, 23"));
  expect(mocks.push).toHaveBeenCalledWith("/saves");
  fireEvent.click(screen.getByText("Trips, 3"));
  expect(mocks.navigate).toHaveBeenCalledWith("/(app)/(tabs)/(trips)");
});

it("asks for no trips while signed out", () => {
  mocks.signedIn = false;
  render(<LibraryRows />);
  expect(mocks.tripsArgs).toEqual(["skip"]);
});
