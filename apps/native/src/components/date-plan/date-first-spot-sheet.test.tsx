// @vitest-environment jsdom
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { DateFirstSpotSheet } from "@/components/date-plan/date-first-spot-sheet";

const mocks = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  refetch: vi.fn(),
  captureError: vi.fn(),
  failure: new Error("listDateStarts failed"),
}));

vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mocks.captureError },
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) =>
    ({
      "errors.tryAgain": "Something went wrong. Try again.",
      "common.retry": "Retry",
      "common.loading": "Loading",
    })[key] ?? key,
}));
vi.mock("@/components/ui/prompt-sheet", () => ({
  PromptSheet: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )),
}));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  )),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => mocks.query }));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: () => ({}) }));
vi.mock("@convex/_generated/api", () => ({
  api: { datePlanData: {}, sharedLists: {} },
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({ theme: { colors: { muted: "#999" } } }),
}));
vi.mock("react-native", () => ({
  TextInput: vi.fn(() => <input />),
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  Pressable: vi.fn(
    ({ children, onPress }: { children: ReactNode; onPress: () => void }) => (
      <button onClick={onPress}>{children}</button>
    ),
  ),
  FlatList: vi.fn(
    ({
      data,
      ListEmptyComponent: empty,
    }: {
      data: unknown[];
      ListEmptyComponent: ReactNode;
    }) => <div>{data.length ? null : empty}</div>,
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query = {
    data: undefined,
    isPending: false,
    isSuccess: false,
    isError: true,
    error: mocks.failure,
    refetch: mocks.refetch,
  };
});

const sheet = () => (
  <DateFirstSpotSheet
    visible
    city="Austin"
    onClose={vi.fn()}
    onPick={vi.fn()}
  />
);

it("reports a failed load and retries it from the list", () => {
  render(sheet());
  expect(screen.getByText("Something went wrong. Try again.")).toBeTruthy();
  expect(mocks.captureError).toHaveBeenCalledWith(
    "date_first_spot_load_failed",
    mocks.failure,
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(mocks.refetch).toHaveBeenCalledTimes(1);
});

it("offers no retry while the places load", () => {
  mocks.query = {
    ...mocks.query,
    isPending: true,
    isError: false,
    error: null,
  };
  render(sheet());
  expect(screen.getByText("Loading")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  expect(mocks.captureError).not.toHaveBeenCalled();
});
