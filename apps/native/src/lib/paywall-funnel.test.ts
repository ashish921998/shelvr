// @vitest-environment jsdom
// The paywall funnel's session memory: purchase -> entitlement activation
// (including the webhook-wins race), blocked action -> resume, and the
// sign-out drop. The memory is module-level by design — the sheet, the guard,
// and the entitlement query live in different call sites — so each test
// re-imports a fresh copy; the only mocked boundary is analytics.
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  capture: vi.fn(),
}));

vi.mock("react-native", () => ({ NativeModules: {} }));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mock.capture },
}));

async function loadFunnel() {
  vi.resetModules();
  return await import("./paywall-funnel");
}

type Status = "trialing" | "pro" | "lifetime" | null;

/** Mounts the activation observer the way `useEntitlementSync` does. */
function observer(funnel: Awaited<ReturnType<typeof loadFunnel>>) {
  return renderHook(
    (status: Status) => funnel.useEntitlementActivation(status),
    { initialProps: null as Status },
  );
}

beforeEach(() => {
  mock.capture.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("entitlement activation", () => {
  it("fires immediately when the entitlement row already became visible", async () => {
    const funnel = await loadFunnel();
    const { rerender } = observer(funnel);
    // The webhook and the query won the race with the native purchase
    // promise: the row is visible before recordAccess runs.
    rerender("pro");
    funnel.recordAccess("purchase");
    expect(mock.capture).toHaveBeenCalledWith("entitlement_activated", {
      status: "pro",
      source: "purchase",
      delay_ms: expect.any(Number),
    });
    expect(mock.capture).toHaveBeenCalledTimes(1);
    expect(funnel.hasActiveEntitlement()).toBe(true);
  });

  it("arms a pending activation and fires it when the row lands", async () => {
    const funnel = await loadFunnel();
    const { rerender } = observer(funnel);
    funnel.recordAccess("restore");
    expect(mock.capture).not.toHaveBeenCalled();
    rerender("trialing");
    expect(mock.capture).toHaveBeenCalledWith("entitlement_activated", {
      status: "trialing",
      source: "restore",
      delay_ms: expect.any(Number),
    });
    // One event per recorded access, not one per later status change.
    rerender("pro");
    expect(mock.capture).toHaveBeenCalledTimes(1);
  });

  it("drops the memory on sign-out so an armed purchase never reports", async () => {
    const funnel = await loadFunnel();
    const { rerender } = observer(funnel);
    funnel.recordAccess("purchase");
    funnel.forgetPaywallFunnel();
    expect(funnel.hasActiveEntitlement()).toBe(false);
    // The next account's entitled status never completes the armed purchase.
    rerender("pro");
    expect(mock.capture).not.toHaveBeenCalled();
  });
});

describe("blocked action resume", () => {
  it("reports one resume at the same placement, then clears the memory", async () => {
    const funnel = await loadFunnel();
    funnel.recordBlockedAction("add", true);
    funnel.resumeBlockedAction("add");
    expect(mock.capture).toHaveBeenCalledWith(
      "paywall_blocked_action_resumed",
      {
        placement: "add",
        delay_ms: expect.any(Number),
        purchased_since_block: true,
      },
    );
    // The memory is one action deep: a second pass reports nothing new.
    funnel.resumeBlockedAction("add");
    expect(mock.capture).toHaveBeenCalledTimes(1);
  });

  it("ignores a resume at a different placement", async () => {
    const funnel = await loadFunnel();
    funnel.recordBlockedAction("tidy", false);
    funnel.resumeBlockedAction("add");
    expect(mock.capture).not.toHaveBeenCalled();
  });

  it("ignores a block older than the resume window", async () => {
    vi.useFakeTimers();
    const funnel = await loadFunnel();
    funnel.recordBlockedAction("home", false);
    vi.setSystemTime(Date.now() + 31 * 60 * 1000);
    funnel.resumeBlockedAction("home");
    expect(mock.capture).not.toHaveBeenCalled();
  });
});

describe("activeProductId", () => {
  it("resolves empty when RevenueCat's customer info read stalls", async () => {
    vi.useFakeTimers();
    vi.doMock("@/lib/revenuecat-module", () => ({
      getPurchases: () => ({
        getCustomerInfo: () => new Promise(() => {}),
      }),
    }));
    const funnel = await loadFunnel();
    const read = funnel.activeProductId();
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(read).resolves.toEqual({});
    vi.doUnmock("@/lib/revenuecat-module");
  });
});

describe("paywall offering reads", () => {
  const trial = (periodUnit: string, periodNumberOfUnits: number) => ({
    price: 0,
    periodUnit,
    periodNumberOfUnits,
  });
  const offering = (
    ...intros: (ReturnType<typeof trial> | { price: number } | null)[]
  ) => ({
    current: {
      identifier: "default",
      availablePackages: intros.map((introPrice, index) => ({
        product: { identifier: `product_${index}`, introPrice },
      })),
    },
  });
  const load = async (rc: object) => {
    vi.doMock("@/lib/revenuecat-module", () => ({
      getPurchases: () => ({ INTRO_ELIGIBILITY_STATUS: {}, ...rc }),
    }));
    return await loadFunnel();
  };

  afterEach(() => vi.doUnmock("@/lib/revenuecat-module"));

  it("keeps the offering id when the eligibility read fails", async () => {
    const funnel = await load({
      getOfferings: async () => offering(trial("DAY", 7), null),
      checkTrialOrIntroductoryPriceEligibility: async () => {
        throw new Error("offline");
      },
    });
    await expect(funnel.readPaywallContext()).resolves.toEqual({
      offering_id: "default",
    });
  });

  it("returns the offering with the trial its packages share", async () => {
    const current = offering(trial("WEEK", 2), null);
    const funnel = await load({ getOfferings: async () => current });
    await expect(funnel.readPaywallOffering()).resolves.toEqual({
      offering: current.current,
      trial: { unit: "WEEK", count: 2 },
    });
  });

  it("returns no offering or trial when the offerings read stalls", async () => {
    vi.useFakeTimers();
    const funnel = await load({ getOfferings: () => new Promise(() => {}) });
    const read = funnel.readPaywallOffering();
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(read).resolves.toEqual({});
  });

  it("reports no trial length when packages disagree or none is free", async () => {
    const funnel = await loadFunnel();
    expect(
      funnel.singleTrialPeriod([
        { introPrice: trial("DAY", 7) },
        { introPrice: trial("DAY", 3) },
      ]),
    ).toBeUndefined();
    expect(
      funnel.singleTrialPeriod([
        {
          introPrice: {
            price: 0.99,
            periodUnit: "WEEK",
            periodNumberOfUnits: 1,
          },
        },
        { introPrice: null },
      ]),
    ).toBeUndefined();
    expect(
      funnel.singleTrialPeriod([
        { introPrice: trial("DAY", 7) },
        { introPrice: trial("DAY", 7) },
        { introPrice: null },
      ]),
    ).toEqual({ unit: "DAY", count: 7 });
  });
});
