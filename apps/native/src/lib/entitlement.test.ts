// Covers the one-sheet-at-a-time rule in presentPaywall. iOS presents a single
// sheet, so a second presentation raced against a live one leaves both
// RevenueCat promises unsettled and the attempt is never reported. The suite
// stubs the whole module boundary; no RevenueCat or Convex code loads.
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => [] as { event: string }[]);

vi.mock("react-native", () => ({
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  NativeModules: {},
  Platform: { OS: "ios" },
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "attempt-1" }));
vi.mock("@/lib/analytics", () => ({
  analytics: {
    capture: (event: string) => {
      captured.push({ event });
    },
  },
}));
vi.mock("@/lib/paywall-telemetry", () => ({
  observePaywallPresentation: async (
    _p: unknown,
    run: () => Promise<unknown>,
  ) => run(),
}));
vi.mock("@/lib/current-user", () => ({ useCurrentUser: () => ({}) }));
vi.mock("@/lib/revenuecat-api-key", () => ({
  REVENUECAT_API_KEY: "appl_test",
}));
vi.mock("@/lib/trial-cancellation", () => ({
  readFreshTrialCancellation: () => null,
}));
vi.mock("./revenuecat-locale", () => ({
  revenueCatLocale: () => "en",
  syncRevenueCatUILocale: async () => true,
}));
vi.mock("./revenuecat-identity-sync", () => ({
  startRevenueCatIdentitySync: () => Promise.resolve(),
}));
vi.mock("@convex/_generated/api", () => ({ api: { subscriptions: {} } }));
vi.mock("@convex/model/entitlement", () => ({ isEntitled: () => false }));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: () => ({}) }));
vi.mock("convex/react", () => ({ useConvexAuth: () => ({}) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({}) }));

const push = vi.fn();
const router = { push } as never;

describe("presentPaywall concurrency", () => {
  beforeEach(() => {
    captured.length = 0;
    push.mockClear();
  });

  it("refuses a second presentation while one is in flight", async () => {
    const { openPaywall } = await import("./entitlement");
    // Both calls are made before either awaits, reproducing the share screen's
    // two openPaywall calls 80ms apart.
    const first = openPaywall(router, "share");
    const second = openPaywall(router, "share");
    await Promise.all([first, second]);

    const requested = captured.filter((c) => c.event === "paywall_requested");
    expect(requested).toHaveLength(1);
  });

  it("returns cancelled for the refused duplicate so no fallback route opens", async () => {
    const { openPaywall } = await import("./entitlement");
    const first = openPaywall(router, "share");
    const second = openPaywall(router, "share");
    const [, duplicate] = await Promise.all([first, second]);

    // openPaywall returns false for both success-less outcomes, so the router
    // is what distinguishes a refused duplicate from a real failure. An
    // `unavailable` duplicate would stack the fallback screen behind the sheet
    // that is already up.
    expect(duplicate).toBe(false);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("allows a new presentation once the previous one settles", async () => {
    const { openPaywall } = await import("./entitlement");
    await openPaywall(router, "share");
    captured.length = 0;
    await openPaywall(router, "share");

    const requested = captured.filter((c) => c.event === "paywall_requested");
    expect(requested).toHaveLength(1);
  });
});
