// @vitest-environment jsdom
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { SharedListsSection } from "@/components/home/shared-lists-section";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  lists: { data: [] as unknown[] | undefined },
}));

vi.mock("@/components/shared-list/member-avatars", () => ({
  MemberAvatars: vi.fn(() => null),
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
) => ({
  _id: id,
  name,
  placeCount,
  newCount,
  members: [],
});

beforeEach(() => {
  mocks.push.mockReset();
  mocks.lists = { data: [] };
});

it("starts a new shared list", () => {
  render(<SharedListsSection />);
  expect(screen.getByText("Shared lists")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Start a shared list" }));
  expect(mocks.push).toHaveBeenCalledWith("/new-shared-list");
});

it("shows a list's name, place count and new badge, and opens it", () => {
  mocks.lists = { data: [list("l1", "Date nights", 3, 2)] };
  render(<SharedListsSection />);
  expect(screen.getByText("Date nights")).toBeTruthy();
  expect(screen.getByText("3 places")).toBeTruthy();
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
  expect(screen.getByText("1 place")).toBeTruthy();
  expect(screen.queryByText(/new$/)).toBeNull();
});

it("still offers Start while lists load", () => {
  mocks.lists = { data: undefined };
  render(<SharedListsSection />);
  expect(
    screen.getByRole("button", { name: "Start a shared list" }),
  ).toBeTruthy();
});
