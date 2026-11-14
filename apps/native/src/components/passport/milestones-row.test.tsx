// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MilestonesRow,
  useBadgeAccess,
} from "@/components/passport/milestones-row";
import { type BadgeStamp, badgeTotals } from "@convex/model/badges";

const mocks = vi.hoisted(() => ({
  entitlement: { entitled: true, loading: false },
  guard: vi.fn(),
  capture: vi.fn(),
}));

type Props = {
  children?: ReactNode;
  testID?: string;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

vi.mock("react-native", () => ({
  Pressable: vi.fn(
    ({
      children,
      testID,
      onPress,
      disabled,
      accessibilityLabel,
      accessibilityHint,
    }: Props) => (
      <button
        data-testid={testID}
        aria-label={accessibilityLabel}
        aria-description={accessibilityHint}
        disabled={disabled}
        onClick={onPress}
      >
        {children}
      </button>
    ),
  ),
  ScrollView: vi.fn(({ children }: Props) => <div>{children}</div>),
  Text: vi.fn(({ children }: Props) => <span>{children}</span>),
  View: vi.fn(({ children, testID }: Props) => (
    <div data-testid={testID}>{children}</div>
  )),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => new Proxy({}, { get: () => ({}) }) },
  useUnistyles: () => ({ theme: { colors: {} } }),
}));
vi.mock("@/components/symbol", () => ({
  AppSymbolIcon: vi.fn(({ name }: { name: string }) => (
    <i data-testid={`icon-${name}`} />
  )),
}));
vi.mock("@/lib/entitlement", () => ({
  useEntitlement: () => mocks.entitlement,
  usePaywallGuard: (placement: string) => ({
    guard: (...args: unknown[]) => mocks.guard(placement, ...args),
    loading: false,
  }),
}));
vi.mock("@/lib/analytics", () => ({ analytics: { capture: mocks.capture } }));

function cafes(count: number): BadgeStamp[] {
  return Array.from({ length: count }, (_, index) => ({
    city: index % 2 === 0 ? "Lisbon" : "Porto",
    kinds: ["coffee"],
  }));
}

function row(stamps: BadgeStamp[], locked: boolean) {
  const handlers = { onUnlock: vi.fn(), onShare: vi.fn() };
  render(
    <MilestonesRow
      totals={badgeTotals(stamps, [])}
      locked={locked}
      {...handlers}
    />,
  );
  return handlers;
}

const chips = () =>
  screen.getAllByRole("button").map((chip) => chip.getAttribute("data-testid"));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.entitlement = { entitled: true, loading: false };
});

afterEach(cleanup);

describe("MilestonesRow", () => {
  it("shows earned badges then the next one with its progress", () => {
    row(cafes(3), false);
    expect(screen.getByText("Milestones")).toBeTruthy();
    expect(chips()).toEqual(["badge-firstStamp", "badge-coffeeCrawler"]);
    expect(screen.getByText("3 of 5 cafés")).toBeTruthy();
    expect(screen.getByText("1 place stamped")).toBeTruthy();
  });

  it("shares an earned badge", () => {
    const { onShare } = row(cafes(3), false);
    const earned = screen.getByTestId("badge-firstStamp");
    expect(earned.getAttribute("aria-label")).toBe(
      "First stamp, 1 place stamped",
    );
    expect(earned.getAttribute("aria-description")).toBe("Shares this badge");
    fireEvent.click(earned);
    expect(onShare).toHaveBeenCalledWith("firstStamp");
  });

  it("keeps the next badge greyed and not pressable", () => {
    const { onShare, onUnlock } = row(cafes(3), false);
    const next = screen.getByTestId("badge-coffeeCrawler");
    expect((next as HTMLButtonElement).disabled).toBe(true);
    expect(next.getAttribute("aria-description")).toBeNull();
    fireEvent.click(next);
    expect(onShare).not.toHaveBeenCalled();
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it("starts a new passport at the first stamp", () => {
    row([], false);
    expect(chips()).toEqual(["badge-firstStamp"]);
    expect(screen.getByText("0 of 1 place")).toBeTruthy();
  });

  it("swaps the next badge as soon as one is earned", () => {
    row(cafes(5), false);
    expect(chips()).toContain("badge-coffeeCrawler");
    expect(screen.getByText("5 cafés stamped")).toBeTruthy();
    expect(screen.queryByText(/of 5 cafés/)).toBeNull();
  });

  it("greys every badge for a free user and opens the paywall on tap", () => {
    const { onShare, onUnlock } = row(cafes(5), true);
    expect(chips()).toHaveLength(12);
    expect(screen.getAllByTestId("icon-lock")).toHaveLength(12);
    expect(screen.queryByTestId("icon-square.and.arrow.up")).toBeNull();
    const coffee = screen.getByTestId("badge-coffeeCrawler");
    expect(coffee.getAttribute("aria-description")).toBe(
      "Earn badges with Shelvr Pro",
    );
    fireEvent.click(coffee);
    fireEvent.click(screen.getByTestId("badge-globetrotter"));
    expect(onUnlock).toHaveBeenCalledTimes(2);
    expect(onShare).not.toHaveBeenCalled();
  });
});

describe("useBadgeAccess", () => {
  it("locks a free user and opens the paywall with the badge surface", async () => {
    mocks.entitlement = { entitled: false, loading: false };
    const { result } = renderHook(() => useBadgeAccess());
    expect(result.current.locked).toBe(true);
    await act(async () => result.current.unlock());
    expect(mocks.capture).toHaveBeenCalledWith("passport_paywall_opened", {
      surface: "badge",
    });
    expect(mocks.guard).toHaveBeenCalledWith("passport");
  });

  it("leaves a Pro user unlocked, and waits while the plan loads", () => {
    expect(renderHook(() => useBadgeAccess()).result.current.locked).toBe(
      false,
    );
    mocks.entitlement = { entitled: false, loading: true };
    expect(renderHook(() => useBadgeAccess()).result.current.locked).toBe(
      false,
    );
  });
});
