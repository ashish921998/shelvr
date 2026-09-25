// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { cloneElement, isValidElement, type ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { ItemCard, type FeedItem } from "./item-card";

// Every query below goes through the accessibility tree, so the mocks resolve
// role and name the way the platform does rather than echoing whichever prop
// was set: React Native reads `role` ahead of `accessibilityRole`
// (RCTViewComponentView.mm, ReactAccessibilityDelegate.kt) and an
// accessibilityLabel replaces the child text instead of falling back to it.
type A11yProps = {
  children?: ReactNode;
  role?: string;
  accessibilityRole?: string;
  accessibilityLabel?: string;
};
// The drawn layer is decoration: it is hidden from the accessibility tree,
// so these queries render nothing for it rather than pulling Skia into jsdom.
vi.mock("@/components/ink/ink-icon", () => ({ InkIcon: vi.fn(() => null) }));
vi.mock("@/components/ink/ink-thread", () => ({
  InkSpinner: vi.fn(() => null),
  ThreadLoop: vi.fn(() => null),
}));

vi.mock("react-native", () => {
  const a11yElement = ({
    children,
    role,
    accessibilityRole,
    accessibilityLabel,
  }: A11yProps) => (
    <div role={role ?? accessibilityRole} aria-label={accessibilityLabel}>
      {children}
    </div>
  );
  return {
    View: vi.fn(a11yElement),
    Pressable: vi.fn(a11yElement),
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
  Link.MenuAction = function LinkMenuAction({ title }: { title: string }) {
    return <li>{title}</li>;
  };
  return { Link, useRouter: () => ({ push: vi.fn() }) };
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

// Reachability is a separate question from rendering: iOS folds this control
// into the card, because Pressable is an accessibility element by default. That
// was true before the card carried a label too, and is not what this asserts —
// only that labelling the card did not drop either set of actions.
it("still renders the save-actions control and the long-press menu", () => {
  render(
    <ItemCard
      item={{ ...base, title: "Miso soup recipe", url: "https://example.com" }}
    />,
  );
  expect(screen.getByRole("button", { name: "Save actions" })).toBeTruthy();
  const menu = screen.getByTestId("link-menu").textContent;
  expect(menu).toContain("Share");
  expect(menu).toContain("Change spaces");
  expect(menu).toContain("Delete");
});
