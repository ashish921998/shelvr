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
  PassportCityHead,
  useRingAccess,
} from "@/components/passport/passport-city-head";
import type { PassportSection } from "@/lib/passport";

const mocks = vi.hoisted(() => ({
  entitlement: { entitled: false, loading: false },
  guard: vi.fn(),
  capture: vi.fn(),
}));

type Props = {
  children?: ReactNode;
  testID?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  numberOfLines?: number;
  maxFontSizeMultiplier?: number;
};

vi.mock("react-native", () => ({
  Pressable: vi.fn(
    ({
      children,
      testID,
      onPress,
      accessibilityLabel,
      accessibilityHint,
    }: Props) => (
      <button
        data-testid={testID}
        aria-label={accessibilityLabel}
        aria-description={accessibilityHint}
        onClick={onPress}
      >
        {children}
      </button>
    ),
  ),
  Text: vi.fn(({ children, numberOfLines, maxFontSizeMultiplier }: Props) => (
    <span data-lines={numberOfLines} data-max-scale={maxFontSizeMultiplier}>
      {children}
    </span>
  )),
  View: vi.fn(({ children }: Props) => <div>{children}</div>),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => new Proxy({}, { get: () => ({}) }) },
  useUnistyles: () => ({ theme: { colors: {} } }),
}));
vi.mock("@/components/passport/city-ring", () => ({
  cityRingLabel: (
    { stamped, total }: { stamped: number; total: number },
    city: string,
    locked: boolean,
  ) => (locked ? `locked ${city} ${total}` : `${stamped} of ${total} ${city}`),
  CityRing: vi.fn(
    ({
      stamped,
      total,
      locked,
    }: {
      stamped: number;
      total: number;
      locked?: boolean;
    }) => <i data-testid="ring">{locked ? "locked" : `${stamped}/${total}`}</i>,
  ),
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/lib/entitlement", () => ({
  useEntitlement: () => mocks.entitlement,
  usePaywallGuard: (placement: string) => ({
    guard: (...args: unknown[]) => mocks.guard(placement, ...args),
    loading: false,
  }),
}));
vi.mock("@/lib/use-large-text", () => ({ LARGE_TEXT_SCALE: 1.4 }));
vi.mock("@/lib/analytics", () => ({ analytics: { capture: mocks.capture } }));
vi.mock("@/lib/i18n", () => ({
  useAppLocale: () => "en",
  t: (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
}));

const lisbon: PassportSection = {
  key: "lisbon",
  city: "Lisbon",
  stamps: [],
  completion: { city: "Lisbon", stamped: 7, total: 12 },
};

function head(section: PassportSection, locked: boolean) {
  const handlers = { onOpen: vi.fn(), onUnlock: vi.fn(), onShare: vi.fn() };
  render(<PassportCityHead section={section} locked={locked} {...handlers} />);
  return handlers;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.entitlement = { entitled: false, loading: false };
});

afterEach(cleanup);

describe("PassportCityHead", () => {
  it("shows a Pro user the real ring and opens what is left to stamp", () => {
    const { onOpen, onUnlock } = head(lisbon, false);
    expect(screen.getByTestId("ring").textContent).toBe("7/12");
    expect(
      screen.getByText('passport.ringCount {"visited":7,"total":12}'),
    ).toBeTruthy();
    const ring = screen.getByTestId("passport-city-ring");
    expect(ring.getAttribute("aria-label")).toBe("7 of 12 Lisbon");
    expect(ring.getAttribute("aria-description")).toBe("passport.ringHint");
    fireEvent.click(ring);
    expect(onOpen).toHaveBeenCalledWith("Lisbon");
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it("shows a free user a locked preview with the saved total and unlocks from it", () => {
    const { onOpen, onUnlock } = head(lisbon, true);
    expect(screen.getByTestId("ring").textContent).toBe("locked");
    expect(
      screen.getByText('passport.ringLocked {"count":12,"city":"Lisbon"}'),
    ).toBeTruthy();
    expect(screen.queryByText(/passport.ringCount/)).toBeNull();
    const ring = screen.getByTestId("passport-city-ring");
    expect(ring.getAttribute("aria-label")).toBe("locked Lisbon 12");
    expect(ring.getAttribute("aria-description")).toBe(
      "passport.ringLockedHint",
    );
    fireEvent.click(ring);
    expect(onUnlock).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("offers Share only for a city with stamps", () => {
    const { onShare } = head(
      { ...lisbon, stamps: [{} as PassportSection["stamps"][number]] },
      false,
    );
    fireEvent.click(screen.getByTestId("passport-city-share"));
    expect(onShare).toHaveBeenCalledWith("Lisbon");
    cleanup();
    head(lisbon, false);
    expect(screen.queryByTestId("passport-city-share")).toBeNull();
  });

  it("wraps a long city name and caps the Share label at large text", () => {
    head(
      { ...lisbon, stamps: [{} as PassportSection["stamps"][number]] },
      false,
    );
    expect(screen.getByText("Lisbon").getAttribute("data-lines")).toBe("2");
    expect(
      screen.getByText("common.share").getAttribute("data-max-scale"),
    ).toBe("1.4");
  });

  it("keeps the plain count for stamps with no ring", () => {
    head(
      {
        key: "~elsewhere",
        city: null,
        stamps: [{} as PassportSection["stamps"][number]],
        completion: null,
      },
      false,
    );
    expect(screen.getByText("passport.elsewhere")).toBeTruthy();
    expect(screen.getByText('passport.placesCount {"count":1}')).toBeTruthy();
    expect(screen.queryByTestId("passport-city-ring")).toBeNull();
  });
});

describe("useRingAccess", () => {
  it("locks rings for a free user and opens the Passport paywall from a ring", async () => {
    const { result } = renderHook(() => useRingAccess());
    expect(result.current.locked).toBe(true);
    await act(async () => result.current.unlock());
    expect(mocks.capture).toHaveBeenCalledWith("passport_paywall_opened", {
      surface: "ring",
    });
    expect(mocks.guard).toHaveBeenCalledWith("passport");
  });

  it("does not lock while the plan is loading or for Pro", () => {
    mocks.entitlement = { entitled: false, loading: true };
    expect(renderHook(() => useRingAccess()).result.current.locked).toBe(false);
    mocks.entitlement = { entitled: true, loading: false };
    expect(renderHook(() => useRingAccess()).result.current.locked).toBe(false);
  });
});
