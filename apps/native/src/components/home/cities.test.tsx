// @vitest-environment jsdom
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { Cities } from "@/components/home/cities";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  cities: undefined as
    | {
        city: string;
        count: number;
        placeCount?: number;
        cover: string | null;
      }[]
    | undefined,
  access: { kind: "pro" } as Record<string, unknown>,
  queryArgs: [] as unknown[],
  failed: false,
  failure: new Error("listCities failed"),
  captureError: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mocks.captureError },
}));

vi.mock("@/components/empty-state", () => ({
  EmptyState: vi.fn(({ title }: { title: string }) => <p>{title}</p>),
}));
vi.mock("@/components/ui/screen-loader", () => ({
  ScreenLoader: vi.fn(() => <p>Loading cities</p>),
}));
vi.mock("@/components/screen-title", () => ({
  ScreenTitle: vi.fn(({ title }: { title: string }) => <h1>{title}</h1>),
}));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("@/lib/free-plan", () => ({ useAccess: () => mocks.access }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: mocks.cities,
    isError: mocks.failed,
    error: mocks.failed ? mocks.failure : null,
  }),
}));
vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (_query: unknown, args: unknown) => {
    mocks.queryArgs.push(args);
  },
}));
vi.mock("expo-image", () => ({
  Image: vi.fn(({ source }: { source: { uri: string } }) => (
    <img alt="" src={source.uri} />
  )),
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ width: 402 }),
  View: vi.fn(({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  )),
  ScrollView: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
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

beforeEach(() => {
  mocks.push.mockReset();
  mocks.queryArgs = [];
  mocks.failed = false;
  mocks.captureError.mockReset();
  mocks.access = { kind: "pro" };
  mocks.cities = [
    { city: "Lisbon", count: 3, placeCount: 8, cover: "lisbon.jpg" },
    { city: "Austin", count: 1, placeCount: 1, cover: null },
  ];
});

it("titles the screen and lists each city with its photo and count", () => {
  const { container } = render(<Cities />);
  expect(screen.getByText("Cities")).toBeTruthy();
  expect(screen.getByText("Lisbon")).toBeTruthy();
  expect(screen.getByText("8 places")).toBeTruthy();
  expect(screen.getByText("1 place")).toBeTruthy();
  expect(container.querySelectorAll("img")).toHaveLength(1);
});

it("opens a city", () => {
  render(<Cities />);
  fireEvent.click(screen.getByRole("button", { name: "Lisbon, 8 places" }));
  expect(mocks.push).toHaveBeenCalledWith({
    pathname: "/city/[name]",
    params: { name: "Lisbon" },
  });
});

it("asks for every city of an account that can browse", () => {
  render(<Cities />);
  expect(mocks.queryArgs).toEqual([{}]);
});

it("shows a loader under the title while the cities load", () => {
  mocks.cities = undefined;
  render(<Cities />);
  expect(screen.getByText("Cities")).toBeTruthy();
  expect(screen.getByText("Loading cities")).toBeTruthy();
});

it("says something went wrong instead of an empty grid when the cities fail", () => {
  mocks.cities = undefined;
  mocks.failed = true;
  render(<Cities />);
  expect(screen.getByText("Cities")).toBeTruthy();
  expect(screen.getByText("Something went wrong")).toBeTruthy();
  expect(screen.queryByText("Loading cities")).toBeNull();
  expect(mocks.captureError).toHaveBeenCalledWith(
    "cities_load_failed",
    mocks.failure,
  );
});

it("keeps the cities it has when a later refresh fails", () => {
  mocks.failed = true;
  render(<Cities />);
  expect(screen.getByText("Lisbon")).toBeTruthy();
  expect(screen.queryByText("Something went wrong")).toBeNull();
});

it("asks for no cities while the account cannot browse", () => {
  mocks.access = { kind: "loading" };
  render(<Cities />);
  expect(mocks.queryArgs).toEqual(["skip"]);
});
