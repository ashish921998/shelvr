// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { MapSharedLists } from "./map-shared-lists";

const lists = vi.hoisted(() => ({
  result: { data: [] as { _id: string; name: string }[], isPending: false },
}));
vi.mock("@/lib/shared-lists", () => ({ useSharedLists: () => lists.result }));
vi.mock("@/components/shared-list/list-card", () => ({
  SharedListCard: vi.fn(({ list }: { list: { name: string } }) => (
    <span>{list.name}</span>
  )),
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
}));

it("shows up to two shared lists over Discover places", () => {
  lists.result = {
    data: [
      { _id: "l1", name: "Date spots" },
      { _id: "l2", name: "Tokyo" },
      { _id: "l3", name: "Lisbon" },
    ],
    isPending: false,
  };
  render(<MapSharedLists />);
  expect(screen.getByText("Date spots")).toBeTruthy();
  expect(screen.getByText("Tokyo")).toBeTruthy();
  expect(screen.queryByText("Lisbon")).toBeNull();
});

it.each([
  ["has no lists", { data: [], isPending: false }],
  ["is still loading them", { data: undefined as never, isPending: true }],
])("draws nothing when the person %s", (_, result) => {
  lists.result = result;
  const { container } = render(<MapSharedLists />);
  expect(container.innerHTML).toBe("");
});
