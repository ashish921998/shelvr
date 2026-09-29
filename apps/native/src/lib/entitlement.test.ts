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
  presentExitSheet: vi.fn(),
  paywall: () => null,
  presentCustomerCenter: vi.fn(),
  captureError: vi.fn(),
  getOfferings: vi.fn(),
  checkEligibility: vi.fn(),
  store: new Map<string, string>(),
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
  },
});
seedRequire("react-native-purchases-ui", {
  default: {
    presentPaywall: mock.presentPaywall,
    presentCustomerCenter: mock.presentCustomerCenter,
    Paywall: mock.paywall,
  },
});
vi.mock("./exit-offer-sheet", () => ({
  presentExitSheet: mock.presentExitSheet,
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => mock.store.get(key) ?? null,
  setItem: (key: string, value: string) => void mock.store.set(key, value),
  deleteItemAsync: async (key: string) => void mock.store.delete(key),
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "attempt-1" }));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: () => {}, captureError: mock.captureError },
}));
vi.mock("@/lib/paywall-telemetry", () => ({
  observePaywallPresentation: async (
    _p: unknown,
    run: () => Promise<unknown>,
  ) => run(),
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
vi.mock("@convex/model/entitlement", () => ({ isEntitled: () => false }));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: () => ({}) }));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({}) }));

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
  renderHook(() => mod.useEntitlementSync());
  await act(() => new Promise<void>((r) => setTimeout(r, 0)));
  return mod;
}

beforeEach(() => {
  mock.presentPaywall.mockReset();
  mock.presentExitSheet.mockReset();
  mock.presentCustomerCenter.mockReset();
  mock.captureError.mockReset();
  mock.getOfferings.mockReset().mockResolvedValue({ all: {} });
  mock.checkEligibility.mockReset();
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

describe("exit offer after a paywall close", () => {
  const exitOffering = {
    identifier: "exit_offer",
    availablePackages: [
      { product: { identifier: "annual_exit", introPrice: { price: 19.99 } } },
    ],
  };

  beforeEach(() => {
    mock.getOfferings.mockResolvedValue({ all: { exit_offer: exitOffering } });
    mock.checkEligibility.mockResolvedValue({ annual_exit: { status: 2 } });
  });

  const sheetCall = {
    Paywall: mock.paywall,
    offering: exitOffering,
    customVariables: {
      offer_ends: { type: "string", value: expect.any(String) },
    },
    endsAt: expect.any(Number),
  };

  it("presents the exit offering once and reports its purchase", async () => {
    const { openPaywall } = await loadReady();
    mock.presentPaywall.mockResolvedValueOnce("CANCELLED");
    mock.presentExitSheet.mockResolvedValueOnce("PURCHASED");

    await expect(openPaywall(router, "onboarding")).resolves.toBe(true);

    expect(mock.presentPaywall).toHaveBeenCalledTimes(1);
    expect(mock.presentExitSheet).toHaveBeenCalledTimes(1);
    expect(mock.presentExitSheet).toHaveBeenCalledWith(sheetCall);
    const { endsAt } = mock.presentExitSheet.mock.calls[0][0];
    expect(endsAt - Date.now()).toBeGreaterThan(23 * 60 * 60 * 1000);
  });

  it("waits a month before offering it again", async () => {
    const { openPaywall } = await loadReady();
    mock.presentPaywall.mockResolvedValue("CANCELLED");
    mock.presentExitSheet.mockResolvedValue("CANCELLED");

    await expect(openPaywall(router, "home_card")).resolves.toBe(false);
    await openPaywall(router, "home_card");

    // First close: paywall + exit offer. Second close: paywall only.
    expect(mock.presentPaywall).toHaveBeenCalledTimes(2);
    expect(mock.presentExitSheet).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps a failed exit offer a plain cancel", async () => {
    const { openPaywall } = await loadReady();
    mock.presentPaywall.mockResolvedValueOnce("CANCELLED");
    mock.presentExitSheet.mockResolvedValueOnce("ERROR");

    await expect(openPaywall(router, "share")).resolves.toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps the offer unclaimed when the exit sheet never appeared", async () => {
    const { openPaywall } = await loadReady();
    mock.presentPaywall.mockResolvedValue("CANCELLED");
    mock.presentExitSheet
      .mockResolvedValueOnce("NOT_PRESENTED")
      .mockResolvedValue("CANCELLED");

    await openPaywall(router, "share");
    await openPaywall(router, "share");

    // Close, failed exit sheet, close, exit sheet shown this time.
    expect(mock.presentExitSheet).toHaveBeenCalledTimes(2);
  });

  it("reopens from the Home countdown while the window is open", async () => {
    const { openPaywall, openExitOffer, useExitOfferEndsAt } =
      await loadReady();
    mock.presentPaywall.mockResolvedValue("CANCELLED");
    mock.presentExitSheet.mockResolvedValue("CANCELLED");

    await openPaywall(router, "home_card");
    const { result } = renderHook(() => useExitOfferEndsAt("user_1"));
    expect(result.current).not.toBeNull();

    mock.presentExitSheet.mockResolvedValueOnce("PURCHASED");
    await expect(openExitOffer(router)).resolves.toBe(true);
    expect(mock.presentPaywall).toHaveBeenCalledTimes(1);
    expect(mock.presentExitSheet).toHaveBeenCalledTimes(2);
    expect(mock.presentExitSheet).toHaveBeenLastCalledWith({
      ...sheetCall,
      endsAt: result.current,
    });
  });

  it("opens the regular paywall once the window has closed", async () => {
    mock.store.set(
      "shelvr.exitOffer.shownAt.user_1",
      String(Date.now() - 25 * 60 * 60 * 1000),
    );
    const { openExitOffer, useExitOfferEndsAt } = await loadReady();
    const { result } = renderHook(() => useExitOfferEndsAt("user_1"));
    expect(result.current).toBeNull();
    mock.presentPaywall.mockResolvedValue("CANCELLED");

    await expect(openExitOffer(router)).resolves.toBe(false);

    // The main paywall only: an expired offer does not return on close.
    expect(mock.presentPaywall).toHaveBeenCalledTimes(1);
    expect(mock.presentPaywall).toHaveBeenCalledWith();
  });

  it("does not follow a purchase", async () => {
    const { openPaywall } = await loadReady();
    mock.presentPaywall.mockResolvedValue("PURCHASED");

    await openPaywall(router, "share");

    expect(mock.presentPaywall).toHaveBeenCalledTimes(1);
    expect(mock.getOfferings).not.toHaveBeenCalled();
  });
});
