// @vitest-environment jsdom
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { SharedListsSection } from "@/components/home/shared-lists-section";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  captureError: vi.fn(),
  failure: new Error("listSharedLists failed"),
  lists: { data: [] } as {
    data: unknown[] | undefined;
    isError?: boolean;
    error?: Error;
  },
}));

vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mocks.captureError },
}));

vi.mock("expo-image", () => ({
  Image: vi.fn(({ source }: { source: { uri: string } }) => (
    <img alt="" src={source.uri} />
  )),
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("@/lib/shared-lists", () => ({
  useSharedLists: () => mocks.lists,
  withLine: () => "Only you so far",
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({ theme: { colors: {} } }),
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  )),
  ScrollView: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
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

const list = (
  id: string,
  name: string,
  placeCount: number,
  newCount: number,
  cities: string[] = [],
) => ({
  _id: id,
  name,
  placeCount,
  newCount,
  cities,
  members: [],
});

beforeEach(() => {
  mocks.push.mockReset();
  mocks.captureError.mockReset();
  mocks.lists = { data: [] };
});

it("starts a new shared list", () => {
  render(<SharedListsSection />);
  expect(screen.getByText("Shared lists")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "New shared list" }));
  expect(mocks.push).toHaveBeenCalledWith("/new-shared-list");
});

it("shows a list's name and new badge, and opens it", () => {
  mocks.lists = { data: [list("l1", "Date nights", 3, 2)] };
  render(<SharedListsSection />);
  expect(screen.getByText("Date nights")).toBeTruthy();
  expect(screen.getByText("2 new")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", {
      name: "Date nights, Only you so far · 3 places, 2 new",
    }),
  );
  expect(mocks.push).toHaveBeenCalledWith({
    pathname: "/shared-list/[id]",
    params: { id: "l1" },
  });
});

it("omits the new badge when nothing is new", () => {
  mocks.lists = { data: [list("l2", "Trips", 1, 0)] };
  render(<SharedListsSection />);
  expect(screen.queryByText(/new$/)).toBeNull();
});

const mine = [
  { city: "Lisbon", count: 2, cover: "lisbon.jpg" },
  { city: "Paris", count: 1, cover: "paris.jpg" },
];

it("uses the viewer's own cover for the list's city, matched ignoring case", () => {
  mocks.lists = { data: [list("l1", "Trip", 3, 0, ["paris"])] };
  const { container } = render(<SharedListsSection cities={mine} />);
  expect(container.querySelector("img")?.getAttribute("src")).toBe("paris.jpg");
  expect(screen.queryByText("📍")).toBeNull();
});

it("falls back to a pin when the viewer has saved none of the list's cities", () => {
  mocks.lists = { data: [list("l1", "Trip", 3, 0, ["Oslo"])] };
  const { container } = render(<SharedListsSection cities={mine} />);
  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByText("📍")).toBeTruthy();
});

it("still offers Start while lists load", () => {
  mocks.lists = { data: undefined };
  render(<SharedListsSection />);
  expect(screen.getByRole("button", { name: "New shared list" })).toBeTruthy();
  expect(screen.queryByText("Something went wrong")).toBeNull();
});

it("says beside the New tile when the lists fail to load, and reports it", () => {
  mocks.lists = { data: undefined, isError: true, error: mocks.failure };
  render(<SharedListsSection />);
  expect(screen.getByRole("button", { name: "New shared list" })).toBeTruthy();
  expect(screen.getByText("Something went wrong")).toBeTruthy();
  expect(screen.getByText("Please try again in a moment.")).toBeTruthy();
  expect(mocks.captureError).toHaveBeenCalledWith(
    "home_shared_lists_load_failed",
    mocks.failure,
  );
});

it("keeps the lists it has when a later refresh fails", () => {
  mocks.lists = {
    data: [list("l1", "Trip", 3, 0)],
    isError: true,
    error: mocks.failure,
  };
  render(<SharedListsSection />);
  expect(screen.getByText("Trip")).toBeTruthy();
  expect(screen.queryByText("Something went wrong")).toBeNull();
  expect(mocks.captureError).toHaveBeenCalledWith(
    "home_shared_lists_load_failed",
    mocks.failure,
  );
});

it("opens every shared list from See all", () => {
  mocks.lists = { data: [list("l1", "Trip", 3, 0)] };
  render(<SharedListsSection />);
  fireEvent.click(screen.getByRole("button", { name: "See all" }));
  expect(mocks.push).toHaveBeenCalledWith("/shared-lists");
});

it("offers See all only once there is a list", () => {
  render(<SharedListsSection />);
  expect(screen.queryByRole("button", { name: "See all" })).toBeNull();
  mocks.lists = { data: undefined };
  render(<SharedListsSection />);
  expect(screen.queryByRole("button", { name: "See all" })).toBeNull();
});
