// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { cloneElement, isValidElement, type ReactNode } from "react";
import { Alert, Pressable, View, type ViewProps } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ItemCard, type FeedItem } from "./item-card";

// Every query below goes through the accessibility tree, so the mocks resolve
// role and name the way the platform does rather than echoing whichever prop
// was set: React Native reads `role` ahead of `accessibilityRole`
// (RCTViewComponentView.mm, ReactAccessibilityDelegate.kt) and an
// accessibilityLabel replaces the child text instead of falling back to it.
// An element marked `accessible` is one leaf to the screen reader, so its
// children are hidden from these queries the way iOS hides them.
type A11yProps = {
  children?: ReactNode;
  accessible?: boolean;
  role?: string;
  accessibilityRole?: string;
  accessibilityLabel?: string;
};
vi.mock("react-native", () => {
  const a11yElement = ({
    children,
    accessible,
    role,
    accessibilityRole,
    accessibilityLabel,
  }: A11yProps) => (
    <div role={role ?? accessibilityRole} aria-label={accessibilityLabel}>
      {accessible ? <div aria-hidden>{children}</div> : children}
    </div>
  );
  return {
    View: vi.fn(a11yElement),
    // The card's look lives in render-prop children (see item-card.tsx).
    Pressable: vi.fn(
      ({
        children,
        ...props
      }: Omit<A11yProps, "children"> & {
        children?: ReactNode | ((state: { pressed: boolean }) => ReactNode);
      }) =>
        a11yElement({
          ...props,
          children:
            typeof children === "function"
              ? children({ pressed: false })
              : children,
        }),
    ),
    Text: vi.fn(({ children }: { children?: ReactNode }) => (
      <span>{children}</span>
    )),
    ActivityIndicator: vi.fn(() => null),
    Alert: { alert: vi.fn() },
    Share: { share: vi.fn(), sharedAction: "sharedAction" },
    StyleSheet: { flatten: (style: unknown) => style },
  };
});

// Link spreads its own role="link" onto the element it wraps (expo-router's
// Slot, via @radix-ui/react-slot: `{...slotProps, ...childProps}`), so the card
// has to win that merge to read as a button. Mirroring the spread here is what
// makes the role assertions mean anything.
const routerPush = vi.hoisted(() => vi.fn());
vi.mock("expo-router", () => {
  const Link = ({ children }: { children?: ReactNode }) => <>{children}</>;
  Link.Trigger = ({ children }: { children?: ReactNode }) =>
    isValidElement<A11yProps>(children)
      ? cloneElement(children, { role: "link", ...children.props })
      : children;
  Link.Preview = function LinkPreview() {
    return null;
  };
  Link.Menu = function LinkMenu({ children }: { children?: ReactNode }) {
    return <ul data-testid="link-menu">{children}</ul>;
  };
  Link.MenuAction = function LinkMenuAction({
    title,
    icon,
    destructive,
  }: {
    title: string;
    icon?: string;
    destructive?: boolean;
  }) {
    return (
      <li data-icon={icon} data-destructive={destructive ? "" : undefined}>
        {title}
      </li>
    );
  };
  return { Link, useRouter: () => ({ push: routerPush }) };
});

vi.mock("react-native-reanimated", async () => {
  const { View } = await import("react-native");
  return {
    default: { View },
    FadeIn: { duration: () => ({ easing: () => ({}) }) },
    FadeOut: { duration: () => ({ easing: () => ({}) }) },
    ZoomOut: {
      springify: () => ({ damping: () => ({ stiffness: () => ({}) }) }),
    },
    useReducedMotion: () => true,
  };
});
vi.mock("@/lib/motion", () => ({
  motion: {
    duration: { feedback: 120, state: 180, enter: 250, exit: 200 },
    easing: { out: {} },
    scale: { pressed: 0.97, enter: 0.95 },
  },
  REDUCED_FADE_IN: {},
  REDUCED_FADE_OUT: {},
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({
    theme: {
      colors: {
        faint: "gray",
        foreground: "black",
        danger: "red",
        primary: "orange",
      },
    },
  }),
}));
vi.mock("expo-image", () => ({ Image: vi.fn(() => null) }));
vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: vi.fn(async () => "0123456789abcdef0123"),
}));
vi.mock("expo-haptics", () => ({
  notificationAsync: vi.fn(),
  NotificationFeedbackType: { Success: "success" },
}));
vi.mock("convex/react", () => ({ useMutation: () => vi.fn() }));
vi.mock("@/lib/share/share-store", () => ({
  forgetDeletedSharedItem: vi.fn(),
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn(), itemAction: vi.fn() },
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/glass", () => ({
  GlassView: vi.fn(({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  )),
}));
// ActionMenu itself stays real, so the ellipsis control keeps its own label
// here; only the native menu host is stubbed.
vi.mock("@expo/ui/community/menu", () => ({
  MenuView: vi.fn(({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  )),
}));

const base: FeedItem = {
  _id: "item-1" as FeedItem["_id"],
  type: "link",
  status: "ready",
  tags: [],
};
/** Finds the card the way a screen reader would: a button with this name. */
function card(item: Partial<FeedItem>, name: string) {
  render(<ItemCard item={{ ...base, ...item }} />);
  return screen.getByRole("button", { name });
}

it("reads a card out by its title", () => {
  expect(card({ title: "Miso soup recipe" }, "Miso soup recipe")).toBeTruthy();
});

it.each([undefined, "", "   ", "\n\t"])(
  "skips a %j title for the next thing that names the card",
  (title) => {
    expect(
      card({ title, note: "Weeknight dinners" }, "Weeknight dinners"),
    ).toBeTruthy();
    expect(
      card(
        { title, url: "https://www.seriouseats.com/miso" },
        "seriouseats.com",
      ),
    ).toBeTruthy();
  },
);

it("says a card is still processing when nothing else names it", () => {
  expect(
    card({ status: "processing", title: "  " }, "Still working on it"),
  ).toBeTruthy();
});

it("names a failed card by what went wrong rather than calling it untitled", () => {
  expect(
    card(
      { status: "failed", failureReason: "not_found", title: "" },
      "Page not found",
    ),
  ).toBeTruthy();
});

it("calls a ready card with no title, note or link untitled", () => {
  expect(card({ type: "image", title: "   " }, "Untitled item")).toBeTruthy();
});

it("stays a button even though Link marks the trigger a link", () => {
  card({ title: "Miso soup recipe" }, "Miso soup recipe");
  expect(screen.queryByRole("link")).toBeNull();
});

// Reachability is a separate question from rendering: the card is one
// accessibility element, so this control is folded into it (its actions reach
// the screen reader as the card's accessibility actions, tested below). This
// asserts only that labelling the card did not drop either set of actions.
it("still renders the save-actions control and the long-press menu", () => {
  render(
    <ItemCard
      item={{ ...base, title: "Miso soup recipe", url: "https://example.com" }}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Save actions", hidden: true }),
  ).toBeTruthy();
  const menu = screen.getByTestId("link-menu").textContent;
  expect(menu).toContain("Share");
  expect(menu).toContain("Change spaces");
  expect(menu).toContain("Delete");
});

describe("on iOS", () => {
  // expo-router wraps the trigger in zero-size native views there, which hide
  // anything below them from VoiceOver and XCTest, so the cell carries the card.
  const os = process.env.EXPO_OS;
  afterEach(() => {
    process.env.EXPO_OS = os;
  });

  function renderOnIos(item: Partial<FeedItem>) {
    process.env.EXPO_OS = "ios";
    vi.mocked(View).mockClear();
    render(<ItemCard item={{ ...base, ...item }} />);
  }

  /** The props of the one View the screen reader sees as the card. */
  function cellProps(name: string) {
    const call = vi
      .mocked(View)
      .mock.calls.find(([props]) => props.accessibilityLabel === name);
    if (!call) throw new Error(`no View labelled ${name}`);
    return call[0];
  }

  it("reads the card from the cell, as one button, with its fixture id", () => {
    renderOnIos({ title: "Miso soup recipe", fixtureKey: "ramen" });
    expect(
      screen.getAllByRole("button", { name: "Miso soup recipe" }),
    ).toHaveLength(1);
    expect(screen.queryByRole("link")).toBeNull();
    const props = cellProps("Miso soup recipe");
    expect(props.accessible).toBe(true);
    expect(props.testID).toBe("fixture-item-ramen");
  });

  it("opens the save when VoiceOver activates the card", () => {
    renderOnIos({ title: "Miso soup recipe" });
    routerPush.mockClear();
    cellProps("Miso soup recipe").onAccessibilityTap?.();
    expect(routerPush).toHaveBeenCalledWith({
      pathname: "/item/[id]",
      params: { id: "item-1" },
    });
  });
});

// The card's actions reach the screen reader from a different host on each
// platform (see item-card.tsx), so each platform is pinned explicitly rather
// than left to whatever EXPO_OS the test run happens to have.
describe.each([
  { os: "ios", host: View, other: Pressable },
  { os: "android", host: Pressable, other: View },
] as const)("screen reader actions on $os", ({ os, host, other }) => {
  const original = process.env.EXPO_OS;
  beforeEach(() => {
    process.env.EXPO_OS = os;
    vi.clearAllMocks();
  });
  afterEach(() => {
    process.env.EXPO_OS = original;
  });

  /** The props of the one element the screen reader reads as the card. */
  function hostProps(name: string) {
    const labelled = (calls: { accessibilityLabel?: string }[][]) =>
      calls.filter(([props]) => props.accessibilityLabel === name);
    expect(labelled(vi.mocked(other).mock.calls)).toEqual([]);
    const call = labelled(vi.mocked(host).mock.calls).at(-1);
    if (!call) throw new Error(`no ${os} host labelled ${name}`);
    return call[0] as ViewProps;
  }

  it("lists the menu actions under ids that don't change with the language", () => {
    render(
      <ItemCard
        item={{
          ...base,
          title: "Miso soup recipe",
          url: "https://example.com",
        }}
      />,
    );
    expect(hostProps("Miso soup recipe").accessibilityActions).toEqual([
      { name: "share", label: "Share" },
      { name: "changeSpaces", label: "Change spaces" },
      { name: "delete", label: "Delete" },
    ]);
  });

  it("runs the action the screen reader picked", () => {
    render(<ItemCard item={{ ...base, title: "Miso soup recipe" }} />);
    hostProps("Miso soup recipe").onAccessibilityAction?.({
      nativeEvent: { actionName: "delete" },
    } as never);
    expect(Alert.alert).toHaveBeenCalledExactlyOnceWith(
      "Delete this save?",
      expect.any(String),
      expect.any(Array),
    );
  });

  it("ignores an action name it does not know", () => {
    render(<ItemCard item={{ ...base, title: "Miso soup recipe" }} />);
    hostProps("Miso soup recipe").onAccessibilityAction?.({
      nativeEvent: { actionName: "Delete" },
    } as never);
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});

// The long-press menu is built from the same list as the screen reader's
// actions, so the two always offer the same things in the same order.
it.each([
  {
    kind: "a saved card",
    item: { url: "https://example.com" },
    source: undefined,
    menu: [
      ["Share", "square.and.arrow.up", false],
      ["Change spaces", "tray.and.arrow.up", false],
      ["Delete", "trash", true],
    ],
  },
  {
    kind: "a processing card with no link",
    item: { status: "processing" as const },
    source: undefined,
    menu: [["Delete", "trash", true]],
  },
  {
    kind: "a suggested card",
    item: { suggested: true },
    source: { from: "space" as const, spaceId: "space-1" },
    menu: [
      ["Add to space", "plus", false],
      ["Dismiss suggestion", "xmark", true],
    ],
  },
])(
  "long-press menu for $kind matches its actions",
  ({ item, source, menu }) => {
    render(
      <ItemCard
        item={{ ...base, title: "Miso soup recipe", ...item }}
        source={source}
      />,
    );
    const entries = [
      ...screen.getByTestId("link-menu").querySelectorAll("li"),
    ].map((li) => [
      li.textContent,
      li.dataset.icon,
      li.dataset.destructive !== undefined,
    ]);
    expect(entries).toEqual(menu);
  },
);
