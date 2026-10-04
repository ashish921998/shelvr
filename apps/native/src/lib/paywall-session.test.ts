import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  push: vi.fn(),
  recordAccess: vi.fn(),
}));

vi.mock("expo-router", () => ({ router: { push: mock.push } }));
vi.mock("@/lib/paywall-funnel", () => ({ recordAccess: mock.recordAccess }));

async function load() {
  vi.resetModules();
  return import("./paywall-session");
}

beforeEach(() => {
  mock.push.mockReset();
  mock.recordAccess.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("paywall session", () => {
  it("opens the route and resolves with how the screen closed", async () => {
    const session = await load();
    const result = session.presentPaywallScreen({
      placement: "share",
      attemptId: "a1",
    });
    expect(mock.push).toHaveBeenCalledWith("/(app)/paywall");
    const owner = session.claimPaywallRequest();
    expect(owner).toMatchObject({ placement: "share", attemptId: "a1" });
    expect(session.isPaywallScreenOpen()).toBe(true);
    session.finishPaywall("PURCHASED", owner);
    await expect(result).resolves.toBe("PURCHASED");
    expect(session.isPaywallScreenOpen()).toBe(false);
    // The caller records access for its own request.
    expect(mock.recordAccess).not.toHaveBeenCalled();
  });

  it("stops counting a closed screen as open while its purchase is pending", async () => {
    const session = await load();
    const result = session.presentPaywallScreen({
      placement: "share",
      attemptId: "a1",
    });
    const owner = session.claimPaywallRequest();
    session.leavePaywallScreen(owner);
    expect(session.isPaywallScreenOpen()).toBe(false);
    // The request still waits for the purchase to report.
    session.finishPaywall("PURCHASED", owner);
    await expect(result).resolves.toBe("PURCHASED");
  });

  it("settles a request once", async () => {
    const session = await load();
    const result = session.presentPaywallScreen({
      placement: "p",
      attemptId: "a",
    });
    const owner = session.claimPaywallRequest();
    session.finishPaywall("PURCHASED", owner);
    session.finishPaywall("CANCELLED", owner);
    await expect(result).resolves.toBe("PURCHASED");
  });

  it("ignores a stale screen settling a newer request", async () => {
    const session = await load();
    const first = session.presentPaywallScreen({
      placement: "p",
      attemptId: "1",
    });
    const firstOwner = session.claimPaywallRequest();
    session.finishPaywall("CANCELLED", firstOwner);
    await first;
    const second = session.presentPaywallScreen({
      placement: "p",
      attemptId: "2",
    });
    const secondOwner = session.claimPaywallRequest();
    session.finishPaywall("CANCELLED", firstOwner);
    session.finishPaywall("RESTORED", secondOwner);
    await expect(second).resolves.toBe("RESTORED");
  });

  it("reports a request no screen claimed as not presented", async () => {
    vi.useFakeTimers();
    const session = await load();
    const result = session.presentPaywallScreen({
      placement: "p",
      attemptId: "a",
    });
    await vi.advanceTimersByTimeAsync(4000);
    await expect(result).resolves.toBe("NOT_PRESENTED");
  });

  it("reports a navigation that throws as not presented", async () => {
    const session = await load();
    const result = session.presentPaywallScreen({
      placement: "p",
      attemptId: "a",
      navigate: () => {
        throw new Error("no navigator");
      },
    });
    await expect(result).resolves.toBe("NOT_PRESENTED");
  });

  it("lets an open route claim only a request made for it", async () => {
    const session = await load();
    void session.presentPaywallScreen({ placement: "p", attemptId: "pushed" });
    // A screen already open must not take a request that is pushing its own
    // copy of the route.
    expect(session.claimPaywallRequest("adopted")).toBeNull();
    session.finishPaywall("NOT_PRESENTED", session.claimPaywallRequest());

    void session.presentPaywallScreen({
      placement: "paywall_route",
      attemptId: "adopted",
      navigate: () => {},
    });
    expect(session.claimPaywallRequest("adopted")).toMatchObject({
      attemptId: "adopted",
    });
    expect(mock.push).toHaveBeenCalledTimes(1);
  });

  it("refuses a second request while one is open", async () => {
    const session = await load();
    void session.presentPaywallScreen({ placement: "p", attemptId: "1" });
    await expect(
      session.presentPaywallScreen({ placement: "p", attemptId: "2" }),
    ).resolves.toBe("NOT_PRESENTED");
  });

  it("records access itself when nobody is waiting", async () => {
    const session = await load();
    session.finishPaywall("PURCHASED", null);
    session.finishPaywall("RESTORED", null);
    session.finishPaywall("CANCELLED", null);
    expect(mock.recordAccess.mock.calls).toEqual([["purchase"], ["restore"]]);
  });
});

describe("classifyPurchaseError", () => {
  it("sorts RevenueCat purchase errors", async () => {
    const { classifyPurchaseError } = await load();
    expect(classifyPurchaseError({ code: "1" })).toBe("cancelled");
    expect(classifyPurchaseError({ userCancelled: true, code: "2" })).toBe(
      "cancelled",
    );
    expect(classifyPurchaseError({ code: "20" })).toBe("pending");
    expect(classifyPurchaseError({ code: "2" })).toBe("failed");
    expect(classifyPurchaseError(new Error("boom"))).toBe("failed");
    expect(classifyPurchaseError(null)).toBe("failed");
  });
});
