// @vitest-environment jsdom
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import {
  SaveListRow,
  type SaveListItem,
} from "@/components/home/save-list-row";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  actions: [] as { label: string; onPress: () => void }[],
  surface: undefined as string | undefined,
}));

vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("@/components/ui/action-menu", () => ({
  ActionMenu: vi.fn(
    ({
      actions,
      children,
    }: {
      actions: { label: string; onPress: () => void }[];
      children: ReactNode;
    }) => (
      <div>
        {children}
        {actions.map((action) => (
          <button key={action.label} onClick={action.onPress}>
            {`menu ${action.label}`}
          </button>
        ))}
      </div>
    ),
  ),
}));
vi.mock("@/lib/use-save-actions", () => ({
  useSaveActions: (_save: unknown, surface: string) => {
    mocks.surface = surface;
    return { actions: mocks.actions };
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
  useUnistyles: () => ({ theme: { colors: {} } }),
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children: ReactNode }) => (
    <section>{children}</section>
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

const save = (overrides: Record<string, unknown> = {}) =>
  ({
    _id: "abc",
    status: "ready",
    cities: ["Lisbon"],
    tags: ["dessert"],
    title: "Custard tarts",
    imageUrl: "tarts.jpg",
    ...overrides,
  }) as unknown as SaveListItem;

beforeEach(() => {
  mocks.push.mockReset();
  mocks.actions = [
    { label: "Share", onPress: vi.fn() },
    { label: "Copy link", onPress: vi.fn() },
    { label: "Delete", onPress: vi.fn() },
  ];
});

it("shows the photo, title, and the kind and city with the kind's emoji", () => {
  const { container } = render(<SaveListRow save={save()} />);
  expect(container.querySelector("img")?.getAttribute("src")).toBe("tarts.jpg");
  expect(screen.getByText("Custard tarts")).toBeTruthy();
  expect(screen.getByText("🍰 Desserts · Lisbon")).toBeTruthy();
});

it("opens the save from Home", () => {
  render(<SaveListRow save={save()} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Custard tarts, Desserts · Lisbon" }),
  );
  expect(mocks.push).toHaveBeenCalledWith({
    pathname: "/item/[id]",
    params: { id: "abc", from: "home" },
  });
});

it("shows a save still being read as its host on a blank photo", () => {
  const { container } = render(
    <SaveListRow
      save={save({
        status: "processing",
        cities: undefined,
        title: undefined,
        imageUrl: null,
        url: "https://www.instagram.com/reel/xyz",
      })}
    />,
  );
  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByText("instagram.com")).toBeTruthy();
  expect(screen.getByText("Finding places…")).toBeTruthy();
});

it("offers the item page's Share, Copy link and Delete from the menu", () => {
  render(<SaveListRow save={save()} />);
  expect(mocks.surface).toBe("feed");
  for (const action of mocks.actions) {
    fireEvent.click(screen.getByText(`menu ${action.label}`));
    expect(action.onPress).toHaveBeenCalledTimes(1);
  }
});
