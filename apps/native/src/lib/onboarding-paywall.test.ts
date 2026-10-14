// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOnboardingPaywall } from "./onboarding-paywall";

const state = vi.hoisted(() => ({
  signedIn: true,
  entitlement: { entitled: false, loading: false },
  open: vi.fn<() => Promise<"success" | "cancelled" | "unavailable">>(),
  purchased: vi.fn(),
  declined: vi.fn(),
}));

vi.mock("expo-router", () => ({ useRouter: () => ({}) }));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: state.signedIn }),
}));
vi.mock("@/lib/analytics", () => ({ analytics: { captureError: vi.fn() } }));
vi.mock("@/lib/entitlement", () => ({
  useEntitlement: () => state.entitlement,
  openPaywallKeepingExitOffer: state.open,
}));
vi.mock("@/lib/replay-onboarding", () => ({
  notePurchasedDuringOnboarding: state.purchased,
  noteDeclinedDuringOnboarding: state.declined,
}));

async function ask(entitlement: { entitled: boolean; loading: boolean }) {
  state.entitlement = entitlement;
  const onPro = vi.fn();
  const onDecline = vi.fn();
  const onUnavailable = vi.fn();
  const hook = renderHook(() =>
    useOnboardingPaywall({ onPro, onDecline, onUnavailable }),
  );
  await act(async () => {
    hook.result.current.ask();
    await Promise.resolve();
  });
  return { onPro, onDecline, onUnavailable, hook };
}

describe("useOnboardingPaywall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.signedIn = true;
  });

  it("lets a signed-out account through without a paywall", async () => {
    state.signedIn = false;
    const { onPro } = await ask({ entitled: false, loading: false });
    expect(onPro).toHaveBeenCalledOnce();
    expect(state.open).not.toHaveBeenCalled();
  });

  it("sends a Pro account on without a paywall", async () => {
    const { onPro, onDecline } = await ask({ entitled: true, loading: false });
    expect(onPro).toHaveBeenCalledOnce();
    expect(onDecline).not.toHaveBeenCalled();
    expect(state.open).not.toHaveBeenCalled();
  });

  it("goes on after a purchase", async () => {
    state.open.mockResolvedValue("success");
    const { onPro, onDecline } = await ask({ entitled: false, loading: false });
    await vi.waitFor(() => expect(onPro).toHaveBeenCalledOnce());
    expect(state.purchased).toHaveBeenCalledOnce();
    expect(onDecline).not.toHaveBeenCalled();
  });

  it("leaves for the app when the paywall is closed", async () => {
    state.open.mockResolvedValue("cancelled");
    const { onPro, onDecline } = await ask({ entitled: false, loading: false });
    await vi.waitFor(() => expect(onDecline).toHaveBeenCalledOnce());
    expect(state.declined).toHaveBeenCalledOnce();
    expect(onPro).not.toHaveBeenCalled();
  });

  it("does not count a paywall that could not show as a decline", async () => {
    state.open.mockResolvedValue("unavailable");
    const { onPro, onDecline, onUnavailable } = await ask({
      entitled: false,
      loading: false,
    });
    await vi.waitFor(() => expect(onUnavailable).toHaveBeenCalledOnce());
    expect(state.declined).not.toHaveBeenCalled();
    expect(onDecline).not.toHaveBeenCalled();
    expect(onPro).not.toHaveBeenCalled();
  });

  it("does not count a paywall that threw as a decline", async () => {
    state.open.mockRejectedValue(new Error("not configured"));
    const { onDecline, onUnavailable } = await ask({
      entitled: false,
      loading: false,
    });
    await vi.waitFor(() => expect(onUnavailable).toHaveBeenCalledOnce());
    expect(state.declined).not.toHaveBeenCalled();
    expect(onDecline).not.toHaveBeenCalled();
  });

  it("waits for the entitlement, then shows the paywall once", async () => {
    state.open.mockResolvedValue("cancelled");
    const { onDecline, hook } = await ask({ entitled: false, loading: true });
    expect(state.open).not.toHaveBeenCalled();
    state.entitlement = { entitled: false, loading: false };
    hook.rerender();
    await vi.waitFor(() => expect(onDecline).toHaveBeenCalledOnce());
    hook.rerender();
    expect(state.open).toHaveBeenCalledOnce();
  });
});
