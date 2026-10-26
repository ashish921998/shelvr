// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HomeSearch } from "./home-search";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  query: vi.fn(),
  captureError: vi.fn(),
  refetch: vi.fn(),
  result: {
    data: [] as { _id: string; title: string; cities: string[] }[],
    isPending: false,
    isError: false,
    error: null as Error | null,
  },
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mocks.captureError },
}));
vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (_api: unknown, args: unknown) => {
    mocks.query(args);
    return {};
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ ...mocks.result, refetch: mocks.refetch }),
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/ui/header-icon-button", () => ({
  HeaderIconButton: vi.fn(
    ({ label, onPress }: { label: string; onPress: () => void }) => (
      <button onClick={onPress}>{label}</button>
    ),
  ),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({ theme: { colors: {} } }),
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
  TextInput: vi.fn(
    ({
      value,
      onChangeText,
      accessibilityLabel,
    }: {
      value: string;
      onChangeText: (value: string) => void;
      accessibilityLabel: string;
    }) => (
      <input
        value={value}
        onChange={(event) => onChangeText(event.target.value)}
        aria-label={accessibilityLabel}
      />
    ),
  ),
  Pressable: vi.fn(
    ({ children, onPress }: { children: ReactNode; onPress: () => void }) => (
      <button onClick={onPress}>{children}</button>
    ),
  ),
  ActivityIndicator: vi.fn(
    ({ accessibilityLabel }: { accessibilityLabel: string }) => (
      <span>{accessibilityLabel}</span>
    ),
  ),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.result = { data: [], isPending: false, isError: false, error: null };
});
afterEach(() => vi.useRealTimers());

function type(query: string) {
  fireEvent.change(screen.getByLabelText("Search your saves"), {
    target: { value: query },
  });
}
function settle() {
  act(() => vi.advanceTimersByTime(250));
}
function home() {
  render(
    <HomeSearch>
      <span>Your cities</span>
    </HomeSearch>,
  );
}

it("keeps Home for blank input, debounces trimmed queries, and clears back to Home", () => {
  home();
  expect(screen.getByText("Your cities")).toBeTruthy();
  expect(mocks.query).not.toHaveBeenCalled();
  type("   ");
  settle();
  expect(mocks.query).not.toHaveBeenCalled();
  type(" Lis ");
  expect(screen.queryByText("Your cities")).toBeNull();
  expect(mocks.query).toHaveBeenLastCalledWith("skip");
  type(" Lisbon ");
  settle();
  expect(mocks.query).toHaveBeenLastCalledWith({ query: "Lisbon" });
  expect(screen.getByText("No saves match “Lisbon”.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(screen.getByText("Your cities")).toBeTruthy();
});

it("opens a matching save and hides stale results while the query changes", () => {
  mocks.result.data = [
    { _id: "saved-place", title: "Weekend favourites", cities: ["Lisbon"] },
  ];
  home();
  type("Lisbon");
  settle();
  expect(screen.getByText("Lisbon")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Weekend favourites Lisbon" }),
  );
  expect(mocks.push).toHaveBeenCalledWith({
    pathname: "/item/[id]",
    params: { id: "saved-place", from: "home" },
  });
  type("Tokyo");
  expect(screen.queryByText("Weekend favourites")).toBeNull();
  expect(screen.getByText("Loading")).toBeTruthy();
});

it("reports a search error and offers retry instead of claiming no results", () => {
  mocks.result.isError = true;
  mocks.result.error = new Error("offline");
  home();
  type("Lisbon");
  settle();
  expect(screen.getByText("Couldn't search")).toBeTruthy();
  expect(screen.queryByText("No saves match “Lisbon”.")).toBeNull();
  expect(mocks.captureError).toHaveBeenCalledWith(
    "home_search_failed",
    mocks.result.error,
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(mocks.refetch).toHaveBeenCalled();
});
