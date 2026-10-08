// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  notePurchasedDuringOnboarding,
  useAwaitingOnboardingPurchase,
} from "./replay-onboarding";

vi.mock("@convex/_generated/api", () => ({ api: {} }));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: false }),
  useMutation: () => vi.fn(),
}));
vi.mock("expo-router", () => ({ useRouter: () => ({}) }));
vi.mock("@/lib/analytics", () => ({ analytics: {} }));
vi.mock("@/lib/onboarding", () => ({ useOnboarding: () => ({}) }));
vi.mock("@/lib/pending-onboarding", () => ({}));
vi.mock("@/lib/entitlement", () => ({}));

describe("useAwaitingOnboardingPurchase", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for a purchase's entitlement, but not forever", () => {
    notePurchasedDuringOnboarding();
    const { result } = renderHook(() => useAwaitingOnboardingPurchase(false));
    expect(result.current).toBe(true);

    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current).toBe(false);
  });

  it("stops waiting once the entitlement lands, and does not wait again if it lapses", () => {
    notePurchasedDuringOnboarding();
    const { result, rerender } = renderHook(
      ({ entitled }) => useAwaitingOnboardingPurchase(entitled),
      { initialProps: { entitled: false } },
    );
    expect(result.current).toBe(true);

    rerender({ entitled: true });
    expect(result.current).toBe(false);

    rerender({ entitled: false });
    expect(result.current).toBe(false);
  });

  it("does not wait when nothing was bought in onboarding", () => {
    const { result } = renderHook(() => useAwaitingOnboardingPurchase(false));
    expect(result.current).toBe(false);
  });
});
