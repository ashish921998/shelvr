// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import type { SharedListPlace } from "@/lib/shared-lists";
import { ListPlaceRow } from "./list-place-row";

type PressableProps = {
  children: ReactNode | ((state: { pressed: boolean }) => ReactNode);
  onPress?: () => void;
  testID?: string;
  accessibilityLabel?: string;
};

type MenuAction = { id?: string; label: string; onPress: () => void };

vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
  Pressable: vi.fn(
    ({ children, onPress, testID, accessibilityLabel }: PressableProps) => (
      <button
        type="button"
        aria-label={accessibilityLabel}
        data-testid={testID}
        onClick={onPress}
      >
        {typeof children === "function"
          ? children({ pressed: false })
          : children}
      </button>
    ),
  ),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({
    theme: { colors: { foreground: "foreground", muted: "muted" } },
  }),
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("@/components/ui/action-menu", () => ({
  ActionMenu: vi.fn(({ actions }: { actions: MenuAction[] }) => (
    <div>
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          data-testid="menu-action"
          onClick={action.onPress}
        >
          {`menu:${action.id}:${action.label}`}
        </button>
      ))}
    </div>
  )),
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
}));
vi.mock("@/lib/shared-lists", () => ({ savedByLine: () => "From Instagram" }));

const CONTRAMAR: SharedListPlace = {
  _id: "p1" as Id<"sharedListPlaces">,
  name: "Contramar",
  lat: 19.4194,
  lng: -99.1698,
  city: "Mexico City",
  addedByYou: true,
  addedAt: 1,
  isNew: false,
  postUrl: "https://www.instagram.com/reel/C0abc123/",
};

const handlers = {
  onPress: vi.fn(),
  onPlaceDetails: vi.fn(),
  onOpenPost: vi.fn(),
  onVisited: vi.fn(),
  onRemove: vi.fn(),
};

function row(
  selected: boolean,
  { withPost = true }: { withPost?: boolean } = {},
) {
  render(
    <ListPlaceRow
      place={CONTRAMAR}
      emoji="🍽️"
      selected={selected}
      onPress={handlers.onPress}
      onPlaceDetails={handlers.onPlaceDetails}
      {...(withPost ? { onOpenPost: handlers.onOpenPost } : {})}
      onVisited={handlers.onVisited}
      onRemove={handlers.onRemove}
    />,
  );
}

function menu() {
  return screen
    .getAllByTestId("menu-action")
    .map((button) => button.textContent?.split(":")[1]);
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => cleanup());

describe("ListPlaceRow and a post link", () => {
  it("puts the post button before the place card button on a selected row", () => {
    row(true);
    const post = screen.getByTestId("list-place-post");
    expect(post.getAttribute("aria-label")).toBe(
      "creatorMaps.openPostFor:Contramar",
    );
    const details = screen.getByLabelText("cityMap.placeDetails:Contramar");
    expect(
      post.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.click(post);
    expect(handlers.onOpenPost).toHaveBeenCalledTimes(1);
    expect(handlers.onPlaceDetails).not.toHaveBeenCalled();
  });

  it("offers the post in the menu between We went and Remove", () => {
    row(true);
    expect(menu()).toEqual(["visited", "post", "remove"]);
    fireEvent.click(screen.getByText("menu:post:creatorMaps.openPost"));
    expect(handlers.onOpenPost).toHaveBeenCalledTimes(1);
  });

  it("keeps the post in the menu but shows no button on a row not selected", () => {
    row(false);
    expect(screen.queryByTestId("list-place-post")).toBeNull();
    expect(menu()).toEqual(["visited", "post", "remove"]);
  });

  it("stays as before without a post", () => {
    row(true, { withPost: false });
    expect(screen.queryByTestId("list-place-post")).toBeNull();
    expect(menu()).toEqual(["visited", "remove"]);
    expect(
      screen.getByLabelText("cityMap.placeDetails:Contramar"),
    ).toBeTruthy();
  });
});
