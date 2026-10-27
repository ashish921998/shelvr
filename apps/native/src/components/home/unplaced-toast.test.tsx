// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReviewSave } from "@/components/home/review-saves";
import { UnplacedToast } from "@/components/home/unplaced-toast";

const mock = vi.hoisted(() => ({
  items: undefined as unknown[] | undefined,
  retry: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/lib/home-feed", () => ({
  useHomeFeed: () => ({ items: mock.items }),
}));
vi.mock("@/lib/fix-save", () => ({
  useFixSave: () => ({ retry: mock.retry, remove: vi.fn() }),
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: mock.push }) }));
vi.mock("react-native-reanimated", () => ({
  default: {
    View: vi.fn(({ children }: { children: ReactNode }) => (
      <div role="alert">{children}</div>
    )),
  },
  FadeInDown: {},
  FadeOutDown: {},
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));
vi.mock("react-native", () => ({
  AccessibilityInfo: { announceForAccessibility: vi.fn() },
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
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

const link = (status: ReviewSave["status"], extra: Partial<ReviewSave> = {}) =>
  ({
    _id: "save",
    _creationTime: 0,
    type: "link",
    status,
    url: "https://www.timeout.com/lisbon",
    ...extra,
  }) as ReviewSave;

function feed(items: unknown[] | undefined, rerender?: () => void) {
  mock.items = items;
  rerender?.();
}

describe("UnplacedToast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("stays quiet for saves that had already failed when the app opened", () => {
    feed([link("failed")]);
    render(<UnplacedToast />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says so when a save it watched reading fails, and Retry reruns it", () => {
    feed([link("processing")]);
    const view = render(<UnplacedToast />);
    feed([link("failed")], () => view.rerender(<UnplacedToast />));
    expect(screen.getByText("Couldn't find places in that link")).toBeTruthy();
    expect(screen.getByText("timeout.com")).toBeTruthy();
    fireEvent.click(screen.getByText("Retry"));
    expect(mock.retry).toHaveBeenCalledWith(link("failed"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("offers View for a save that finished without a place, which Retry can't fix", () => {
    feed([link("processing")]);
    const view = render(<UnplacedToast />);
    feed([link("ready", { cities: [] })], () =>
      view.rerender(<UnplacedToast />),
    );
    fireEvent.click(screen.getByText("View"));
    expect(mock.push).toHaveBeenCalledWith({
      pathname: "/item/[id]",
      params: { id: "save", from: "home" },
    });
  });

  it("stays quiet for a note or photo, which the toast's link copy doesn't fit", () => {
    feed([link("processing", { type: "note" })]);
    const view = render(<UnplacedToast />);
    feed([link("ready", { type: "note", cities: [] })], () =>
      view.rerender(<UnplacedToast />),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("stays quiet when the save lands in a city", () => {
    feed([link("processing")]);
    const view = render(<UnplacedToast />);
    feed([link("ready", { cities: ["Lisbon"] })], () =>
      view.rerender(<UnplacedToast />),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("goes away on its own", () => {
    vi.useFakeTimers();
    feed([link("processing")]);
    const view = render(<UnplacedToast />);
    feed([link("failed")], () => view.rerender(<UnplacedToast />));
    expect(screen.getByRole("alert")).toBeTruthy();
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
