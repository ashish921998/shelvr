// @vitest-environment jsdom
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import type { Id } from "@convex/_generated/dataModel";
import { HomePlaces, HomePlacesEmptyCard } from "@/components/home/home-places";
import type { ReviewSave } from "@/components/home/review-saves";

const mocks = vi.hoisted(() => ({
  cities: [] as
    | {
        city: string;
        count: number;
        placeCount?: number;
        cover: string | null;
      }[]
    | undefined,
  push: vi.fn(),
  guard: vi.fn(async (action?: () => void) => {
    action?.();
    return true;
  }),
  access: { kind: "pro", syncing: false } as Record<string, unknown>,
}));

vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("@/components/ui/button", () => ({
  Button: vi.fn(
    ({ title, onPress }: { title: string; onPress: () => void }) => (
      <button onClick={onPress}>{title}</button>
    ),
  ),
}));
vi.mock("@/components/home/review-saves", () => ({
  ReviewSaves: vi.fn(({ saves }: { saves: ReviewSave[] }) =>
    saves.length > 0 ? <span>Review row</span> : null,
  ),
}));
vi.mock("@/components/home/library-rows", () => ({
  LibraryRows: vi.fn(({ cityCount }: { cityCount?: number }) => (
    <span>{`Library rows, cities ${cityCount}`}</span>
  )),
}));
vi.mock("@/components/home/shared-lists-section", () => ({
  SharedListsSection: vi.fn(({ cities }: { cities?: { city: string }[] }) => (
    <span>{`Shared lists, ${cities?.map((c) => c.city).join("+")}`}</span>
  )),
}));
vi.mock("@/lib/free-plan", () => ({
  useAccess: () => mocks.access,
  useSaveGuard: () => ({ guard: mocks.guard, loading: false }),
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
}));

const failed: ReviewSave = {
  _id: "failed" as Id<"items">,
  _creationTime: 0,
  type: "link",
  status: "failed",
};
const lisbon = { city: "Lisbon", count: 2, placeCount: 1, cover: null };

beforeEach(() => {
  mocks.push.mockReset();
  mocks.guard.mockClear();
  mocks.access = { kind: "pro", syncing: false };
  mocks.cities = [lisbon];
});

it("gives the library rows the city count and the shared lists the cities", () => {
  render(<HomePlaces saves={[failed]} />);
  expect(screen.getByText("Library rows, cities 1")).toBeTruthy();
  expect(screen.getByText("Review row")).toBeTruthy();
  expect(screen.getByText("Shared lists, Lisbon")).toBeTruthy();
});

it("has no plan rows or city grid any more", () => {
  render(<HomePlaces saves={[]} />);
  expect(screen.queryByText("Plan a date")).toBeNull();
  expect(screen.queryByText("Your cities")).toBeNull();
  expect(screen.queryByText("Lisbon")).toBeNull();
});

it("still shows the rows and shared lists before the cities load", () => {
  mocks.cities = undefined;
  render(<HomePlaces saves={[failed]} />);
  expect(screen.getByText("Library rows, cities undefined")).toBeTruthy();
  expect(screen.getByText("Review row")).toBeTruthy();
  expect(screen.getByText("Shared lists, undefined")).toBeTruthy();
});

it("hides the cities while the account's access is still loading", () => {
  mocks.access = { kind: "loading" };
  render(<HomePlaces saves={[]} />);
  expect(screen.getByText("Library rows, cities undefined")).toBeTruthy();
});

it("pitches saving places when the account has no city", () => {
  mocks.cities = [];
  render(<HomePlaces saves={[]} />);
  expect(screen.getByText("Add a spot")).toBeTruthy();
});

it("pitches saving places and opens Add through the save guard", () => {
  render(<HomePlacesEmptyCard />);
  expect(screen.getByText("Save places from TikTok or Instagram")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Add a spot" }));
  expect(mocks.guard).toHaveBeenCalledTimes(1);
  expect(mocks.push).toHaveBeenCalledWith("/add");
});

it("does not open Add when the guard refuses", () => {
  mocks.guard.mockImplementationOnce(async () => false);
  render(<HomePlacesEmptyCard />);
  fireEvent.click(screen.getByRole("button", { name: "Add a spot" }));
  expect(mocks.push).not.toHaveBeenCalled();
});
