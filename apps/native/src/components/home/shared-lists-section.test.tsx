// @vitest-environment jsdom
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { SharedListsSection } from "@/components/home/shared-lists-section";
import type { useSharedLists } from "@/lib/shared-lists";

type Lists = Pick<
  ReturnType<typeof useSharedLists>,
  "status" | "error" | "isError" | "isSuccess" | "refetch"
> & { data: unknown[] | undefined };

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  captureError: vi.fn(),
  refetch: vi.fn(),
  failure: new Error("listSharedLists failed"),
  lists: null as Lists | null,
}));

const state = (
  status: Lists["status"],
  data: unknown[] | undefined,
  error: Error | null,
): Lists => ({
  status,
  data,
  error,
  isError: status === "error",
  isSuccess: status === "success",
  refetch: mocks.refetch,
});
const loaded = (data: unknown[]) => state("success", data, null);
const loading = () => state("pending", undefined, null);
const failed = (error: Error, data?: unknown[]) => state("error", data, error);

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
  mocks.refetch.mockReset();
  mocks.lists = loaded([]);
});

it("starts a new shared list", () => {
  render(<SharedListsSection />);
  expect(screen.getByText("Shared lists")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "New shared list" }));
  expect(mocks.push).toHaveBeenCalledWith("/new-shared-list");
});

it("shows a list's name and new badge, and opens it", () => {
  mocks.lists = loaded([list("l1", "Date nights", 3, 2)]);
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
  mocks.lists = loaded([list("l2", "Trips", 1, 0)]);
  render(<SharedListsSection />);
  expect(screen.queryByText(/new$/)).toBeNull();
});

const mine = [
  { city: "Lisbon", count: 2, cover: "lisbon.jpg" },
  { city: "Paris", count: 1, cover: "paris.jpg" },
];

it("uses the viewer's own cover for the list's city, matched ignoring case", () => {
  mocks.lists = loaded([list("l1", "Trip", 3, 0, ["paris"])]);
  const { container } = render(<SharedListsSection cities={mine} />);
  expect(container.querySelector("img")?.getAttribute("src")).toBe("paris.jpg");
  expect(screen.queryByText("📍")).toBeNull();
});

it("falls back to a pin when the viewer has saved none of the list's cities", () => {
  mocks.lists = loaded([list("l1", "Trip", 3, 0, ["Oslo"])]);
  const { container } = render(<SharedListsSection cities={mine} />);
  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByText("📍")).toBeTruthy();
});

it("still offers Start while lists load", () => {
  mocks.lists = loading();
  render(<SharedListsSection />);
  expect(screen.getByRole("button", { name: "New shared list" })).toBeTruthy();
  expect(screen.queryByText("Something went wrong")).toBeNull();
});

it("says beside the New tile when the lists fail to load, and reports it", () => {
  mocks.lists = failed(mocks.failure);
  render(<SharedListsSection />);
  expect(screen.getByRole("button", { name: "New shared list" })).toBeTruthy();
  expect(screen.getByText("Something went wrong")).toBeTruthy();
  expect(screen.getByText("Please try again in a moment.")).toBeTruthy();
  expect(mocks.captureError).toHaveBeenCalledWith(
    "home_shared_lists_load_failed",
    mocks.failure,
  );
});

it("loads the lists again when Retry is pressed after a failure", () => {
  mocks.lists = failed(mocks.failure);
  render(<SharedListsSection />);
  expect(mocks.refetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(mocks.refetch).toHaveBeenCalledTimes(1);
});

it("reports a failure once while the lists stay failed, through a Retry", () => {
  mocks.lists = failed(mocks.failure);
  const { rerender } = render(<SharedListsSection />);
  mocks.lists = failed(new Error("listSharedLists failed on a later read"));
  rerender(<SharedListsSection />);
  mocks.lists = loading();
  rerender(<SharedListsSection />);
  mocks.lists = failed(new Error("listSharedLists failed on Retry"));
  rerender(<SharedListsSection />);
  expect(mocks.captureError).toHaveBeenCalledTimes(1);
  expect(mocks.captureError).toHaveBeenCalledWith(
    "home_shared_lists_load_failed",
    mocks.failure,
  );
});

it("reports a new failure after the lists recover", () => {
  mocks.lists = failed(mocks.failure);
  const { rerender } = render(<SharedListsSection />);
  mocks.lists = loaded([list("l1", "Trip", 3, 0)]);
  rerender(<SharedListsSection />);
  const later = new Error("listSharedLists failed after recovering");
  mocks.lists = failed(later, [list("l1", "Trip", 3, 0)]);
  rerender(<SharedListsSection />);
  expect(mocks.captureError).toHaveBeenCalledTimes(2);
  expect(mocks.captureError).toHaveBeenLastCalledWith(
    "home_shared_lists_load_failed",
    later,
  );
});

it("keeps the lists it has when a later refresh fails", () => {
  mocks.lists = failed(mocks.failure, [list("l1", "Trip", 3, 0)]);
  render(<SharedListsSection />);
  expect(screen.getByText("Trip")).toBeTruthy();
  expect(screen.queryByText("Something went wrong")).toBeNull();
  expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  expect(mocks.captureError).toHaveBeenCalledWith(
    "home_shared_lists_load_failed",
    mocks.failure,
  );
});

it("opens every shared list from See all", () => {
  mocks.lists = loaded([list("l1", "Trip", 3, 0)]);
  render(<SharedListsSection />);
  fireEvent.click(screen.getByRole("button", { name: "See all" }));
  expect(mocks.push).toHaveBeenCalledWith("/shared-lists");
});

it("offers See all only once there is a list", () => {
  render(<SharedListsSection />);
  expect(screen.queryByRole("button", { name: "See all" })).toBeNull();
  mocks.lists = loading();
  render(<SharedListsSection />);
  expect(screen.queryByRole("button", { name: "See all" })).toBeNull();
});
