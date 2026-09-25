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
  presentCustomerCenter: vi.fn(),
  captureError: vi.fn(),
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
  },
});
seedRequire("react-native-purchases-ui", {
  default: {
    presentPaywall: mock.presentPaywall,
    presentCustomerCenter: mock.presentCustomerCenter,
  },
});
vi.mock("expo-router", () => ({ useRouter: () => ({ push: () => {} }) }));
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
  mock.presentCustomerCenter.mockReset();
  mock.captureError.mockReset();
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
