// @vitest-environment jsdom
// The paywall funnel's session memory: purchase -> entitlement activation
// (including the webhook-wins race), blocked action -> resume, and the
// sign-out drop. The memory is module-level by design: the sheet, the guard,
// and the entitlement query live in different call sites, so each test
// re-imports a fresh copy; the only mocked boundary is analytics.
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  capture: vi.fn(),
}));

vi.mock("react-native", () => ({ NativeModules: {} }));
vi.mock("@/lib/pending-onboarding", () => ({
  resolveOnboardingSpaceName: (id: string) => id,
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mock.capture },
}));

async function loadFunnel() {
  vi.resetModules();
  return await import("./paywall-funnel");
}

type Status = "trialing" | "pro" | "lifetime" | null;

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
    rerender("pro");
    expect(mock.capture).toHaveBeenCalledTimes(1);
  });

  it("drops the memory on sign-out so an armed purchase never reports", async () => {
    const funnel = await loadFunnel();
    const { rerender } = observer(funnel);
    funnel.recordAccess("purchase");
    funnel.forgetPaywallFunnel();
    expect(funnel.hasActiveEntitlement()).toBe(false);
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
    funnel.resumeBlockedAction("add");
    expect(mock.capture).toHaveBeenCalledTimes(1);
  });

  it("ignores a resume at a different placement", async () => {
    const funnel = await loadFunnel();
    funnel.recordBlockedAction("map", false);
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

describe("refreshCustomerInfo", () => {
  async function loadWith(rc: object) {
    vi.doMock("@/lib/revenuecat-module", () => ({ getPurchases: () => rc }));
    const funnel = await loadFunnel();
    vi.doUnmock("@/lib/revenuecat-module");
    return funnel;
  }

  it("drops the cached customer before reading it", async () => {
    const calls: string[] = [];
    const funnel = await loadWith({
      invalidateCustomerInfoCache: async () => void calls.push("invalidate"),
      getCustomerInfo: async () => void calls.push("read"),
    });
    await expect(funnel.refreshCustomerInfo()).resolves.toBe(true);
    expect(calls).toEqual(["invalidate", "read"]);
  });

  it("answers false when the read fails", async () => {
    const funnel = await loadWith({
      invalidateCustomerInfoCache: async () => {},
      getCustomerInfo: async () => Promise.reject(new Error("offline")),
    });
    await expect(funnel.refreshCustomerInfo()).resolves.toBe(false);
  });

  it("answers false after 10s when the read stalls", async () => {
    vi.useFakeTimers();
    const funnel = await loadWith({
      invalidateCustomerInfoCache: async () => {},
      getCustomerInfo: () => new Promise(() => {}),
    });
    const read = funnel.refreshCustomerInfo();
    await vi.advanceTimersByTimeAsync(9_999);
    let settled = false;
    void read.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(read).resolves.toBe(false);
  });

  it("keeps a read that landed after the budget, so a retry does not throw it away", async () => {
    vi.useFakeTimers();
    const invalidate = vi.fn(async () => {});
    let reads = 0;
    const funnel = await loadWith({
      invalidateCustomerInfoCache: invalidate,
      getCustomerInfo: () =>
        ++reads === 1
          ? new Promise((resolve) => setTimeout(resolve, 12_000))
          : Promise.resolve({}),
    });
    const first = funnel.refreshCustomerInfo();
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(first).resolves.toBe(false);
    await vi.advanceTimersByTimeAsync(4_000);

    await expect(funnel.refreshCustomerInfo()).resolves.toBe(true);
    expect(invalidate).toHaveBeenCalledOnce();
  });

  it("drops the cache again once the last read is a minute old or the account signs out", async () => {
    vi.useFakeTimers();
    const invalidate = vi.fn(async () => {});
    const funnel = await loadWith({
      invalidateCustomerInfoCache: invalidate,
      getCustomerInfo: async () => ({}),
    });
    await funnel.refreshCustomerInfo();
    vi.setSystemTime(Date.now() + 30_000);
    await funnel.refreshCustomerInfo();
    expect(invalidate).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 30_000);
    await funnel.refreshCustomerInfo();
    expect(invalidate).toHaveBeenCalledTimes(2);

    funnel.forgetPaywallFunnel();
    await funnel.refreshCustomerInfo();
    expect(invalidate).toHaveBeenCalledTimes(3);
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
    all: {},
  });
  const noTrial = { identifier: "weekly_annual_draft", availablePackages: [] };
  const withNoTrial = (current: ReturnType<typeof offering>) => ({
    ...current,
    all: { weekly_annual_draft: noTrial },
  });
  const INTRO_ELIGIBILITY_STATUS = {
    INTRO_ELIGIBILITY_STATUS_UNKNOWN: 0,
    INTRO_ELIGIBILITY_STATUS_INELIGIBLE: 1,
    INTRO_ELIGIBILITY_STATUS_ELIGIBLE: 2,
    INTRO_ELIGIBILITY_STATUS_NO_INTRO_OFFER_EXISTS: 3,
  };
  const answers = (...statuses: number[]) =>
    Object.fromEntries(
      statuses.map((status, index) => [`product_${index}`, { status }]),
    );
  const load = async (rc: object) => {
    vi.doMock("@/lib/revenuecat-module", () => ({
      getPurchases: () => ({ INTRO_ELIGIBILITY_STATUS, ...rc }),
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

  it("shows the no-trial offering to someone who used their trial", async () => {
    const funnel = await load({
      getOfferings: async () => withNoTrial(offering(trial("DAY", 7), null)),
      checkTrialOrIntroductoryPriceEligibility: async () => answers(1, 3),
    });
    await expect(funnel.readPaywallOffering()).resolves.toEqual({
      offering: noTrial,
      eligibility: "ineligible",
    });
  });

  it("keeps the current offering unless the trial is definitely spent", async () => {
    for (const statuses of [
      [2, 3],
      [0, 3],
    ]) {
      const current = withNoTrial(offering(trial("DAY", 7), null));
      const funnel = await load({
        getOfferings: async () => current,
        checkTrialOrIntroductoryPriceEligibility: async () =>
          answers(...statuses),
      });
      await expect(funnel.readPaywallOffering()).resolves.toMatchObject({
        offering: current.current,
        trial: { unit: "DAY", count: 7 },
      });
    }
  });

  it("returns the trial answer it read after identity sync", async () => {
    const current = withNoTrial(offering(trial("DAY", 7), null));
    const funnel = await load({
      getOfferings: async () => current,
      checkTrialOrIntroductoryPriceEligibility: async () => answers(2, 3),
    });
    await expect(funnel.readPaywallOffering()).resolves.toMatchObject({
      offering: current.current,
      eligibility: "eligible",
    });
  });

  it("keeps the current offering when the eligibility read fails or stalls", async () => {
    vi.useFakeTimers();
    for (const check of [
      async () => {
        throw new Error("offline");
      },
      () => new Promise(() => {}),
    ]) {
      const current = withNoTrial(offering(trial("DAY", 7), null));
      const funnel = await load({
        getOfferings: async () => current,
        checkTrialOrIntroductoryPriceEligibility: check,
      });
      const read = funnel.readPaywallOffering();
      await vi.advanceTimersByTimeAsync(2_000);
      await expect(read).resolves.toEqual({
        offering: current.current,
        trial: { unit: "DAY", count: 7 },
      });
    }
  });

  it("skips the eligibility check when no no-trial offering exists", async () => {
    const check = vi.fn();
    const current = offering(trial("DAY", 7), null);
    const funnel = await load({
      getOfferings: async () => current,
      checkTrialOrIntroductoryPriceEligibility: check,
    });
    await expect(funnel.readPaywallOffering()).resolves.toMatchObject({
      offering: current.current,
    });
    expect(check).not.toHaveBeenCalled();
  });

  it("offers $0.00 on the opener only from an eligible yearly trial", async () => {
    const funnel = await loadFunnel();
    const yearly = {
      priceString: "$39.99",
      currencyCode: "USD",
      subscriptionPeriod: "P1Y",
      introPrice: trial("DAY", 7),
    };
    const weekly = {
      priceString: "$12.99",
      currencyCode: "USD",
      subscriptionPeriod: "P1W",
      introPrice: null,
    };
    expect(funnel.trialOfferVariables([weekly, yearly], "eligible")).toEqual({
      trial_offer: {
        type: "string",
        value: "Start for $0.00, then $39.99/year.",
      },
    });
    expect(funnel.trialOfferVariables([weekly, yearly], "ineligible")).toEqual(
      {},
    );
    expect(funnel.trialOfferVariables([weekly, yearly], undefined)).toEqual({});
    expect(
      funnel.trialOfferVariables(
        [weekly, { ...yearly, introPrice: null }],
        "eligible",
      ),
    ).toEqual({});
    expect(funnel.paywallVariables(0, undefined, [weekly], "eligible")).toBe(
      undefined,
    );
    expect(
      funnel.paywallVariables(
        0,
        { unit: "DAY", count: 7 },
        [yearly],
        "eligible",
      ),
    ).toMatchObject({
      trial_end_day: { type: "string", value: "7" },
      trial_offer: { type: "string" },
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
