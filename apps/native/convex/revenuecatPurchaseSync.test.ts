// @vitest-environment edge-runtime
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  newConvexTest,
  revenuecatSnapshot,
  signedInUser,
  stubRevenueCatFetch,
} from "./test.setup";
import { api } from "./_generated/api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("syncPurchase", () => {
  async function fixture() {
    vi.stubEnv("REVENUECAT_API_KEY", "appl_test");
    const backend = newConvexTest();
    const user = await signedInUser(backend);
    const rows = () =>
      backend.run(async (ctx) => await ctx.db.query("subscriptions").collect());
    return { backend, ...user, rows };
  }

  it("records a purchase made before sign-in once RevenueCat holds it for the caller", async () => {
    const f = await fixture();
    const fetchMock = stubRevenueCatFetch(
      revenuecatSnapshot({ productId: "annual", periodType: "trial" }),
    );
    await f.t.action(api.subscriptions.syncPurchase, {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      encodeURIComponent(f.userId),
    );
    expect(await f.rows()).toMatchObject([
      { userId: f.userId, status: "trialing", productId: "annual" },
    ]);
  });

  it("never takes access away when RevenueCat has none", async () => {
    const f = await fixture();
    await f.backend.run(async (ctx) => {
      await ctx.db.insert("subscriptions", {
        userId: f.userId,
        status: "lifetime",
        expiresAt: 0,
        updatedAt: 1,
      });
    });
    stubRevenueCatFetch(revenuecatSnapshot());
    await f.t.action(api.subscriptions.syncPurchase, {});
    expect(await f.rows()).toMatchObject([
      { userId: f.userId, status: "lifetime" },
    ]);
  });

  it("refuses a signed-out caller", async () => {
    const f = await fixture();
    const fetchMock = stubRevenueCatFetch(revenuecatSnapshot());
    await expect(
      f.backend.action(api.subscriptions.syncPurchase, {}),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is rate limited per account", async () => {
    const f = await fixture();
    const fetchMock = stubRevenueCatFetch(revenuecatSnapshot());
    for (let i = 0; i < 5; i += 1) {
      await f.t.action(api.subscriptions.syncPurchase, {});
    }
    await expect(
      f.t.action(api.subscriptions.syncPurchase, {}),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
