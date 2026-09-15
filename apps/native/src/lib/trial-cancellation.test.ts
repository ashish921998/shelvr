import { describe, expect, it, vi } from "vitest";

import {
  classifyTrialCancellation,
  readFreshTrialCancellation,
} from "./trial-cancellation";

/** EntitlementInfo slices shaped like a RevenueCat CustomerInfo response. */
const entitlement = (
  overrides: Partial<{ periodType: string; willRenew: boolean }> = {},
) => ({
  periodType: "NORMAL",
  willRenew: true,
  ...overrides,
});

it("reads cancellation after invalidating a cached renewing trial", async () => {
  let cached = true;
  const purchases = {
    invalidateCustomerInfoCache: vi.fn(async () => {
      cached = false;
    }),
    getCustomerInfo: vi.fn(async () => ({
      entitlements: {
        active: {
          pro: entitlement({ periodType: "TRIAL", willRenew: cached }),
        },
      },
    })),
  };
  expect(await readFreshTrialCancellation(purchases)).toBe("cancelled");
});

it.each(["invalidation", "fetch"])(
  "does not treat an unavailable %s as an uncancelled subscription",
  async (failure) => {
    const purchases = {
      invalidateCustomerInfoCache: vi.fn().mockResolvedValue(undefined),
      getCustomerInfo: vi
        .fn()
        .mockResolvedValue({ entitlements: { active: {} } }),
    };
    if (failure === "invalidation")
      purchases.invalidateCustomerInfoCache.mockRejectedValue(
        new Error("unavailable"),
      );
    else purchases.getCustomerInfo.mockRejectedValue(new Error("unavailable"));
    expect(await readFreshTrialCancellation(purchases)).toBe("unknown");
  },
);

describe("classifyTrialCancellation", () => {
  it("detects a cancelled trial still inside its window", () => {
    expect(
      classifyTrialCancellation([
        entitlement({ periodType: "TRIAL", willRenew: false }),
      ]),
    ).toBe("cancelled");
  });

  it("treats a renewing trial, paid subscription, or empty entitlements as none", () => {
    expect(
      classifyTrialCancellation([
        entitlement({ periodType: "TRIAL", willRenew: true }),
      ]),
    ).toBe("none");
    expect(classifyTrialCancellation([entitlement()])).toBe("none");
    expect(classifyTrialCancellation([])).toBe("none");
  });

  it("ignores non-trial entitlements when a trial is also present", () => {
    // Multiple active entitlements are possible; the trial decides.
    expect(
      classifyTrialCancellation([
        entitlement({ periodType: "NORMAL", willRenew: false }),
        entitlement({ periodType: "TRIAL", willRenew: false }),
      ]),
    ).toBe("cancelled");
  });

  it("is order-independent with several trials: any cancelled trial wins", () => {
    const renewing = entitlement({ periodType: "TRIAL", willRenew: true });
    const cancelled = entitlement({ periodType: "TRIAL", willRenew: false });
    expect(classifyTrialCancellation([renewing, cancelled])).toBe("cancelled");
    expect(classifyTrialCancellation([cancelled, renewing])).toBe("cancelled");
    expect(
      classifyTrialCancellation([
        renewing,
        entitlement({ periodType: "TRIAL", willRenew: true }),
      ]),
    ).toBe("none");
  });

  it("treats unfamiliar period types as non-trials", () => {
    expect(
      classifyTrialCancellation([
        entitlement({ periodType: "INTRO", willRenew: false }),
      ]),
    ).toBe("none");
  });
});
