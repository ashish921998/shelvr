// @vitest-environment jsdom
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { AllSharedLists } from "@/components/home/all-shared-lists";

type Summary = { _id: string; name: string; cities: string[] };

const mocks = vi.hoisted(() => ({
  lists: {
    data: undefined as Summary[] | undefined,
    isError: false,
    error: null as Error | null,
  },
  cities: [] as { city: string; count: number; cover: string | null }[],
  access: { kind: "pro" } as Record<string, unknown>,
  queryArgs: [] as unknown[],
  width: 402,
  failure: new Error("listSharedLists failed"),
  captureError: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mocks.captureError },
}));
vi.mock("@/components/empty-state", () => ({
  EmptyState: vi.fn(({ title }: { title: string }) => <p>{title}</p>),
}));
vi.mock("@/components/ui/screen-loader", () => ({
  ScreenLoader: vi.fn(() => <p>Loading lists</p>),
}));
vi.mock("@/components/screen-title", () => ({
  ScreenTitle: vi.fn(({ title }: { title: string }) => <h1>{title}</h1>),
}));
vi.mock("@/components/home/shared-lists-section", () => ({
  TILE: 104,
  NewListTile: vi.fn(() => <button>New shared list</button>),
  ListTile: vi.fn(
    ({ list, cover }: { list: Summary; cover: string | null }) => (
      <button>{`${list.name}: ${cover ?? "no cover"}`}</button>
    ),
  ),
}));
vi.mock("@/lib/shared-lists", () => ({ useSharedLists: () => mocks.lists }));
vi.mock("@/lib/free-plan", () => ({ useAccess: () => mocks.access }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mocks.cities }),
}));
vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (_query: unknown, args: unknown) => {
    mocks.queryArgs.push(args);
  },
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ width: mocks.width }),
  View: vi.fn(({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  )),
  ScrollView: vi.fn(
    ({
      children,
      contentContainerStyle,
    }: {
      children: ReactNode;
      contentContainerStyle: unknown[];
    }) => (
      <div
        data-testid="grid"
        data-gap={(contentContainerStyle[1] as { columnGap: number }).columnGap}
      >
        {children}
      </div>
    ),
  ),
}));

beforeEach(() => {
  mocks.queryArgs = [];
  mocks.captureError.mockReset();
  mocks.access = { kind: "pro" };
  mocks.width = 402;
  mocks.cities = [{ city: "Paris", count: 2, cover: "paris.jpg" }];
  mocks.lists = {
    data: [
      { _id: "l1", name: "Date spots", cities: ["paris"] },
      { _id: "l2", name: "Weekend trip", cities: ["Oslo"] },
    ],
    isError: false,
    error: null,
  };
});

it("titles the screen and lists every shared list after the New tile", () => {
  render(<AllSharedLists />);
  expect(screen.getByRole("heading", { name: "Shared lists" })).toBeTruthy();
  expect(screen.getAllByRole("button").map((tile) => tile.textContent)).toEqual(
    ["New shared list", "Date spots: paris.jpg", "Weekend trip: no cover"],
  );
});

it("fits three tiles across the screen", () => {
  render(<AllSharedLists />);
  expect(screen.getByTestId("grid").dataset.gap).toBe("25");
  mocks.width = 375;
  render(<AllSharedLists />);
  expect(screen.getAllByTestId("grid")[1].dataset.gap).toBe("11");
});

it("shows a loader under the title while the lists load", () => {
  mocks.lists = { data: undefined, isError: false, error: null };
  render(<AllSharedLists />);
  expect(screen.getByRole("heading", { name: "Shared lists" })).toBeTruthy();
  expect(screen.getByText("Loading lists")).toBeTruthy();
});

it("says something went wrong when the lists fail to load", () => {
  mocks.lists = { data: undefined, isError: true, error: mocks.failure };
  render(<AllSharedLists />);
  expect(screen.getByText("Something went wrong")).toBeTruthy();
  expect(screen.queryByText("Loading lists")).toBeNull();
  expect(mocks.captureError).toHaveBeenCalledWith(
    "shared_lists_load_failed",
    mocks.failure,
  );
});

it("keeps the lists it has when a later refresh fails", () => {
  mocks.lists = { ...mocks.lists, isError: true, error: mocks.failure };
  render(<AllSharedLists />);
  expect(screen.getByText("Date spots: paris.jpg")).toBeTruthy();
  expect(screen.queryByText("Something went wrong")).toBeNull();
});

it("asks for no city covers while the account cannot browse", () => {
  mocks.access = { kind: "loading" };
  render(<AllSharedLists />);
  expect(mocks.queryArgs).toEqual(["skip"]);
  expect(screen.getByText("Date spots: no cover")).toBeTruthy();
});

it("leaves out the New tile when the account cannot make a list", () => {
  mocks.access = { kind: "locked" };
  render(<AllSharedLists />);
  expect(screen.getAllByRole("button").map((tile) => tile.textContent)).toEqual(
    ["Date spots: no cover", "Weekend trip: no cover"],
  );
});
