// @vitest-environment jsdom
// Covers the one-sheet-at-a-time latch shared by presentPaywall and
// presentCustomerCenter. iOS presents a single sheet, so a second presentation
// raced against a live one leaves both RevenueCat promises unsettled and the
// attempt is never reported. The suite drives RevenueCat identity sync to
// ready through the real useEntitlementSync hook so every call reaches the
// fake native sheet; only the module boundary is stubbed.
import { act, renderHook } from "@testing-library/react";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  presentPaywall: vi.fn(),
  observed: vi.fn(),
  presentCustomerCenter: vi.fn(),
  captureError: vi.fn(),
  capture: vi.fn(),
  getOfferings: vi.fn(),
  checkEligibility: vi.fn(),
  getCustomerInfo: vi.fn(),
  useQuery: vi.fn(),
  isEntitled: vi.fn(() => false),
  store: new Map<string, string>(),
  hidePro: false,
  apiKey: {
    REVENUECAT_API_KEY: "appl_test" as string | undefined,
    REVENUECAT_DISABLED_BY_BUILD: false,
  },
}));

vi.mock("react-native", () => ({
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  NativeModules: { RNPaywalls: {}, RNPurchases: {} },
  Platform: { OS: "ios" },
}));

// The RevenueCat modules are loaded through a bare `require()` thunk, which
// vi.mock does not intercept, so the fakes are seeded into Node's module
// cache under the ids that thunk resolves.
const req = createRequire(import.meta.url);
function seedRequire(name: string, exports: unknown) {
  const id = req.resolve(name);
  req.cache[id] = { id, filename: id, loaded: true, exports } as never;
}
seedRequire("react-native-purchases", {
  default: {
    configure: async () => {},
    logIn: async () => {},
    overridePreferredLocale: async () => {},
    getOfferings: mock.getOfferings,
    checkTrialOrIntroductoryPriceEligibility: mock.checkEligibility,
    getCustomerInfo: mock.getCustomerInfo,
    // The SDK exposes its intro-eligibility enum as a static on the default
    // export; the paywall context read uses it directly, so the fake mirrors
    // the real member names and values.
    INTRO_ELIGIBILITY_STATUS: {
      INTRO_ELIGIBILITY_STATUS_UNKNOWN: 0,
      INTRO_ELIGIBILITY_STATUS_INELIGIBLE: 1,
      INTRO_ELIGIBILITY_STATUS_ELIGIBLE: 2,
      INTRO_ELIGIBILITY_STATUS_NO_INTRO_OFFER_EXISTS: 3,
    },
  },
});
seedRequire("react-native-purchases-ui", {
  default: {
    presentPaywall: mock.presentPaywall,
    presentCustomerCenter: mock.presentCustomerCenter,
  },
});
vi.mock("expo-router", () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock("@/lib/e2e-hide-pro", () => ({
  isProHiddenForE2E: () => mock.hidePro,
}));
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => mock.store.get(key) ?? null,
  setItem: (key: string, value: string) => void mock.store.set(key, value),
  deleteItemAsync: async (key: string) => void mock.store.delete(key),
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "attempt-1" }));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mock.capture, captureError: mock.captureError },
}));
vi.mock("@/lib/paywall-telemetry", () => ({
  observePaywallPresentation: async (
    _p: unknown,
    run: () => Promise<unknown>,
  ) => {
    const result = await run();
    mock.observed(result);
    return result;
  },
}));
vi.mock("@/lib/current-user", () => ({
  useCurrentUser: () => ({ data: { _id: "user_1" } }),
}));
vi.mock("@/lib/revenuecat-api-key", () => mock.apiKey);
vi.mock("@/lib/trial-cancellation", () => ({
  readFreshTrialCancellation: () => null,
}));
vi.mock("./revenuecat-locale", () => ({
  revenueCatLocale: () => "en",
  syncRevenueCatUILocale: async () => true,
}));
vi.mock("@convex/_generated/api", () => ({ api: { subscriptions: {} } }));
vi.mock("@convex/model/entitlement", () => ({
  isEntitled: mock.isEntitled,
}));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: () => ({}) }));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: mock.useQuery }));

const SHEET_STALE_MS = 5 * 60_000;

const push = vi.fn();
const router = { push } as never;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// Fresh module state per test, with identity sync already ready so
// presentPaywall reaches the native sheet instead of the identity gate.
async function loadReady() {
  vi.resetModules();
  const mod = await import("./entitlement");
  const hook = renderHook(() => mod.useEntitlementSync());
  await act(() => new Promise<void>((r) => setTimeout(r, 0)));
  return { ...mod, hook };
}

beforeEach(() => {
  mock.hidePro = false;
  mock.presentPaywall.mockReset();
  mock.observed.mockReset();
  mock.presentCustomerCenter.mockReset();
  mock.captureError.mockReset();
  mock.capture.mockReset();
  mock.getOfferings.mockReset().mockResolvedValue({ all: {} });
  mock.checkEligibility.mockReset();
  mock.getCustomerInfo
    .mockReset()
    .mockResolvedValue({ entitlements: { active: {} } });
  mock.useQuery.mockReset().mockReturnValue({});
  mock.isEntitled.mockReset().mockReturnValue(false);
  mock.store.clear();
  mock.apiKey.REVENUECAT_API_KEY = "appl_test";
  mock.apiKey.REVENUECAT_DISABLED_BY_BUILD = false;
  push.mockClear();
});

describe("useEntitlementSync on a build with RevenueCat disabled", () => {
  it("neither reports the missing key nor marks the user synced", async () => {
    mock.apiKey.REVENUECAT_API_KEY = undefined;
    mock.apiKey.REVENUECAT_DISABLED_BY_BUILD = true;
    const { openPaywall } = await loadReady();
    expect(mock.captureError).not.toHaveBeenCalled();
    // Readiness was never recorded, so the paywall degrades to the fallback
    // route instead of opening a sheet under an unsynced identity.
    await expect(openPaywall(router, "share")).resolves.toBe(false);
    expect(mock.presentPaywall).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/(app)/paywall");
  });

  it("still reports a missing key the build did not choose", async () => {
    mock.apiKey.REVENUECAT_API_KEY = undefined;
    await loadReady();
    expect(mock.captureError).toHaveBeenCalledWith(
      "purchase_identity_sync_failed",
      expect.objectContaining({ message: "revenuecat_key_missing" }),
      { reason: "revenuecat_key_missing" },
    );
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("presentPaywall concurrency", () => {
  it("presents once for two concurrent openPaywall calls", async () => {
    const { openPaywall } = await loadReady();
    const sheet = deferred<string>();
    mock.presentPaywall.mockReturnValue(sheet.promise);

    // Both calls are made before either awaits, reproducing the share screen's
    // two openPaywall calls 80ms apart.
    const first = openPaywall(router, "share");
    const second = openPaywall(router, "share");
    sheet.resolve("CANCELLED");
    await Promise.all([first, second]);

    expect(mock.presentPaywall).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("gives the duplicate caller the live presentation's real outcome", async () => {
    const { openPaywall } = await loadReady();
    const sheet = deferred<string>();
    mock.presentPaywall.mockReturnValue(sheet.promise);

    const first = openPaywall(router, "share");
    const second = openPaywall(router, "share");
    sheet.resolve("PURCHASED");

    expect(await Promise.all([first, second])).toEqual([true, true]);
  });

  it("routes to the fallback once when a shared presentation is unavailable", async () => {
    const { openPaywall } = await loadReady();
    const sheet = deferred<string>();
    mock.presentPaywall.mockReturnValue(sheet.promise);

    const first = openPaywall(router, "share");
    const second = openPaywall(router, "share");
    // ERROR maps to `unavailable`, the only outcome that opens the fallback.
    sheet.resolve("ERROR");

    expect(await Promise.all([first, second])).toEqual([false, false]);
    expect(mock.presentPaywall).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("presents again once the previous presentation settles", async () => {
    const { openPaywall } = await loadReady();
    mock.presentPaywall.mockResolvedValue("CANCELLED");

    await openPaywall(router, "share");
    await openPaywall(router, "share");

    expect(mock.presentPaywall).toHaveBeenCalledTimes(2);
  });

  it("presents again after a presentation that never settles goes stale", async () => {
    const { openPaywall } = await loadReady();
    vi.useFakeTimers();
    mock.presentPaywall.mockReturnValueOnce(new Promise(() => {}));
    mock.presentPaywall.mockResolvedValueOnce("CANCELLED");

    void openPaywall(router, "share");
    vi.advanceTimersByTime(SHEET_STALE_MS);
    await openPaywall(router, "share");

    expect(mock.presentPaywall).toHaveBeenCalledTimes(2);
  });
});

// UIKit can refuse a presentation mid-transition without RevenueCat ever
// settling its promise. A reviewer's Create space and View Pro plans taps then
// joined that dead sheet and did nothing.
describe("a paywall that never came up", () => {
  async function hungSheet() {
    const mod = await loadReady();
    mock.presentPaywall.mockReturnValueOnce(new Promise(() => {}));
    const first = mod.openPaywall(router, "onboarding");
    await vi.waitFor(() => expect(mock.presentPaywall).toHaveBeenCalled());
    vi.useFakeTimers();
    return { ...mod, first };
  }

  it("settles the dead sheet as a close once a touch proves it never showed", async () => {
    const { openPaywall, noteAppTouch, first } = await hungSheet();
    mock.presentPaywall.mockResolvedValueOnce("CANCELLED");

    vi.advanceTimersByTime(2000);
    noteAppTouch();
    await openPaywall(router, "new_space");

    // The onboarding replay waiting on it keeps its work, and no fallback
    // screen opens for a tap it never made.
    await expect(first).resolves.toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("presents again when the app takes a touch after it should have covered it", async () => {
    const { openPaywall, noteAppTouch } = await hungSheet();
    mock.presentPaywall.mockResolvedValueOnce("PURCHASED");

    vi.advanceTimersByTime(2000);
    noteAppTouch();

    await expect(openPaywall(router, "new_space")).resolves.toBe(true);
    expect(mock.presentPaywall).toHaveBeenCalledTimes(2);
  });

  it("keeps the newer sheet when a dropped one settles after all", async () => {
    const { openPaywall, noteAppTouch, isPaywallPending } = await loadReady();
    const slow = deferred<string>();
    mock.presentPaywall.mockReturnValueOnce(slow.promise);
    void openPaywall(router, "onboarding");
    await vi.waitFor(() => expect(mock.presentPaywall).toHaveBeenCalled());
    vi.useFakeTimers();
    const next = deferred<string>();
    mock.presentPaywall.mockReturnValueOnce(next.promise);

    vi.advanceTimersByTime(2000);
    noteAppTouch();
    void openPaywall(router, "new_space");
    await vi.advanceTimersByTimeAsync(0);
    slow.resolve("CANCELLED");
    await vi.advanceTimersByTimeAsync(5000);

    // The late settle cannot release the newer sheet.
    expect(isPaywallPending()).toBe(true);
  });

  it("still joins when no touch reached the app", async () => {
    const { openPaywall, isPaywallPending } = await hungSheet();

    vi.advanceTimersByTime(60_000);
    void openPaywall(router, "share");
    await vi.advanceTimersByTimeAsync(0);

    expect(isPaywallPending()).toBe(true);
    expect(mock.presentPaywall).toHaveBeenCalledTimes(1);
  });

  it("still joins a touch made while the sheet could be sliding up", async () => {
    const { openPaywall, noteAppTouch } = await hungSheet();

    vi.advanceTimersByTime(500);
    noteAppTouch();
    void openPaywall(router, "home_card");
    await vi.advanceTimersByTimeAsync(0);

    expect(mock.presentPaywall).toHaveBeenCalledTimes(1);
  });
});

describe("paywall activation funnel", () => {
  it("reports entitlement activation after a purchase reaches Convex", async () => {
    const { openPaywall, hook } = await loadReady();
    mock.presentPaywall.mockResolvedValue("PURCHASED");

    await expect(openPaywall(router, "share")).resolves.toBe(true);

    mock.useQuery.mockReturnValue({
      data: {
        status: "pro",
        expiresAt: Date.now() + 60 * 60 * 1000,
      },
    });
    mock.isEntitled.mockReturnValue(true);
    await act(async () => {
      hook.rerender();
      await Promise.resolve();
    });

    expect(mock.capture).toHaveBeenCalledWith(
      "entitlement_activated",
      expect.objectContaining({
        status: "pro",
        source: "purchase",
        delay_ms: expect.any(Number),
      }),
    );
  });
});

describe("restore from the paywall", () => {
  it("marks a purchase as landing, and a close as nothing", async () => {
    const { openPaywall } = await loadReady();
    const { readPurchaseLanding } = await import("./purchase-landing");
    const before = readPurchaseLanding();
    mock.presentPaywall.mockResolvedValueOnce("CANCELLED");
    await openPaywall(router, "share");
    expect(readPurchaseLanding()).toBe(before);

    mock.presentPaywall.mockResolvedValueOnce("PURCHASED");
    await openPaywall(router, "plan_gate");
    expect(readPurchaseLanding()).toBeGreaterThan(Date.now());
  });

  it("treats a restore that found nothing as a close", async () => {
    const { openPaywall } = await loadReady();
    mock.presentPaywall.mockResolvedValue("RESTORED");

    await expect(openPaywall(router, "share")).resolves.toBe(false);
    // Telemetry sees the close too, not a restore.
    expect(mock.observed).toHaveBeenCalledWith("CANCELLED");
  });

  it("keeps a restore whose customer info could not be read", async () => {
    const { openPaywall } = await loadReady();
    mock.presentPaywall.mockResolvedValue("RESTORED");
    mock.getCustomerInfo.mockRejectedValue(new Error("offline"));

    await expect(openPaywall(router, "share")).resolves.toBe(true);
  });

  it("counts a restore that found an entitlement", async () => {
    const { openPaywall } = await loadReady();
    mock.presentPaywall.mockResolvedValue("RESTORED");
    mock.getCustomerInfo.mockResolvedValue({
      entitlements: { active: { "Shelvr Pro": {} } },
    });

    await expect(openPaywall(router, "share")).resolves.toBe(true);
  });
});

describe("trial eligibility for copy", () => {
  const current = {
    identifier: "default",
    availablePackages: [{ product: { identifier: "annual" } }],
  };

  it.each([
    ["eligible", 2, true],
    ["ineligible", 1, false],
    ["unknown", 0, false],
  ])("an %s account reads %s", async (_label, status, expected) => {
    mock.getOfferings.mockResolvedValue({ current, all: {} });
    mock.checkEligibility.mockResolvedValue({ annual: { status } });
    const { readTrialEligible } = await loadReady();

    await expect(readTrialEligible()).resolves.toBe(expected);
  });

  it("reads no when the store cannot be reached", async () => {
    mock.getOfferings.mockRejectedValue(new Error("offline"));
    const { readTrialEligible } = await loadReady();

    await expect(readTrialEligible()).resolves.toBe(false);
  });
});

describe("customer center latch", () => {
  it("refuses the Customer Center while a paywall is live", async () => {
    const { openPaywall, presentCustomerCenter } = await loadReady();
    const sheet = deferred<string>();
    mock.presentPaywall.mockReturnValue(sheet.promise);
    mock.presentCustomerCenter.mockResolvedValue(undefined);

    const paywall = openPaywall(router, "share");
    const presented = await presentCustomerCenter();
    sheet.resolve("CANCELLED");
    await paywall;

    expect(presented).toBe(false);
    expect(mock.presentCustomerCenter).not.toHaveBeenCalled();
  });

  it("does not stack a paywall on an open Customer Center", async () => {
    const { openPaywall, presentCustomerCenter } = await loadReady();
    const sheet = deferred<void>();
    mock.presentCustomerCenter.mockReturnValue(sheet.promise);
    mock.presentPaywall.mockResolvedValue("PURCHASED");

    const center = presentCustomerCenter();
    const purchased = await openPaywall(router, "share");
    sheet.resolve();
    await center;

    expect(purchased).toBe(false);
    expect(mock.presentPaywall).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("paywall outcome", () => {
  it("returns a close as cancelled after one paywall", async () => {
    const { openPaywallOutcome } = await loadReady();
    mock.presentPaywall.mockResolvedValue("CANCELLED");

    await expect(openPaywallOutcome(router, "plan_gate")).resolves.toBe(
      "cancelled",
    );
    expect(mock.presentPaywall).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("tells onboarding when its paywall could not show, without routing", async () => {
    const { openPaywallOutcome } = await loadReady();
    mock.presentPaywall.mockResolvedValue("ERROR");

    await expect(openPaywallOutcome(router, "onboarding")).resolves.toBe(
      "unavailable",
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("routes other placements to the fallback when the paywall could not show", async () => {
    const { openPaywallOutcome } = await loadReady();
    mock.presentPaywall.mockResolvedValue("ERROR");

    await expect(openPaywallOutcome(router, "plan_gate")).resolves.toBe(
      "unavailable",
    );
    expect(push).toHaveBeenCalledWith("/(app)/paywall");
  });

  it("marks a purchase as landing", async () => {
    const { openPaywallOutcome } = await loadReady();
    const { readPurchaseLanding } = await import("./purchase-landing");
    mock.presentPaywall.mockResolvedValue("PURCHASED");

    await expect(openPaywallOutcome(router, "onboarding")).resolves.toBe(
      "success",
    );
    expect(readPurchaseLanding()).toBeGreaterThan(Date.now());
  });
});

describe("paywall offering", () => {
  it("dates nothing when no offering loaded", async () => {
    const { openPaywall } = await loadReady();
    mock.presentPaywall.mockResolvedValue("CANCELLED");

    await expect(openPaywall(router, "home_card")).resolves.toBe(false);

    expect(mock.presentPaywall).toHaveBeenCalledTimes(1);
    expect(mock.presentPaywall).toHaveBeenCalledWith({
      customVariables: undefined,
    });
  });

  it("presents the offering it dated the trial timeline from", async () => {
    const current = {
      identifier: "default",
      availablePackages: [
        {
          product: {
            identifier: "annual",
            introPrice: {
              price: 0,
              periodUnit: "WEEK",
              periodNumberOfUnits: 2,
            },
          },
        },
      ],
    };
    mock.getOfferings.mockResolvedValue({ current, all: {} });
    mock.checkEligibility.mockResolvedValue({ annual: { status: 2 } });
    const { openPaywall } = await loadReady();
    mock.presentPaywall.mockResolvedValue("PURCHASED");

    await openPaywall(router, "share");

    expect(mock.presentPaywall).toHaveBeenCalledWith({
      offering: current,
      customVariables: expect.objectContaining({
        trial_end_day: { type: "string", value: "14" },
      }),
    });
  });
});
