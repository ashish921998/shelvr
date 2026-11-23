// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { MapEmpty } from "./map-empty";

const lists = vi.hoisted(() => ({
  result: { data: [] as { _id: string; name: string }[], isPending: false },
}));
vi.mock("@/lib/shared-lists", () => ({ useSharedLists: () => lists.result }));
vi.mock("@/components/shared-list/list-card", () => ({
  SharedListCard: vi.fn(({ list }: { list: { name: string } }) => (
    <span>{list.name}</span>
  )),
}));

vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}), hairlineWidth: 1 },
  useUnistyles: () => ({ theme: { colors: { foreground: "#000" } } }),
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  Pressable: vi.fn(
    ({
      children,
      onPress,
      accessibilityLabel,
    }: {
      children: ReactNode;
      onPress: () => void;
      accessibilityLabel: string;
    }) => (
      <button aria-label={accessibilityLabel} onClick={onPress}>
        {children}
      </button>
    ),
  ),
}));

it("explains the empty map and offers the person's location when it is on", () => {
  const onLocate = vi.fn();
  render(<MapEmpty located onLocate={onLocate} />);
  expect(screen.getByText("map.emptyTitle")).toBeTruthy();
  expect(screen.getByText("map.emptyBody")).toBeTruthy();
  fireEvent.click(screen.getByLabelText("map.showMyLocation"));
  expect(onLocate).toHaveBeenCalledTimes(1);
});

it("has no location button without location permission", () => {
  render(<MapEmpty located={false} onLocate={vi.fn()} />);
  expect(screen.queryByLabelText("map.showMyLocation")).toBeNull();
});

it("shows the person's shared lists in place of the empty message", () => {
  lists.result = {
    data: [
      { _id: "l1", name: "Date spots" },
      { _id: "l2", name: "Tokyo" },
    ],
    isPending: false,
  };
  render(<MapEmpty located={false} onLocate={vi.fn()} />);
  expect(screen.getByText("Date spots")).toBeTruthy();
  expect(screen.getByText("Tokyo")).toBeTruthy();
  expect(screen.queryByText("map.emptyTitle")).toBeNull();
  lists.result = { data: [], isPending: false };
});

it("keeps the location button but no empty message while the lists load", () => {
  lists.result = { data: undefined as never, isPending: true };
  render(<MapEmpty located onLocate={vi.fn()} />);
  expect(screen.queryByText("map.emptyTitle")).toBeNull();
  expect(screen.getByLabelText("map.showMyLocation")).toBeTruthy();
  lists.result = { data: [], isPending: false };
});

it("shows only the lists over Discover places, and nothing when there are none", () => {
  lists.result = {
    data: [{ _id: "l1", name: "Date spots" }],
    isPending: false,
  };
  const { unmount } = render(
    <MapEmpty located={false} listsOnly onLocate={vi.fn()} />,
  );
  expect(screen.getByText("Date spots")).toBeTruthy();
  unmount();
  lists.result = { data: [], isPending: false };
  render(<MapEmpty located={false} listsOnly onLocate={vi.fn()} />);
  expect(screen.queryByText("map.emptyTitle")).toBeNull();
});
