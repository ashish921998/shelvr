// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import {
  newConvexTest,
  revenuecatSnapshot,
  signedInUser,
  stubRevenueCatFetch,
} from "./test.setup";

beforeEach(() => {
  vi.stubEnv("REVENUECAT_WEBHOOK_SECRET", "test-secret");
  vi.stubEnv("REVENUECAT_API_KEY", "appl_test");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function fixture() {
  const backend = newConvexTest();
  const user = await signedInUser(backend);
  const purchase = (from: { store?: string; app_id?: string }) =>
    backend.fetch("/webhooks/revenuecat", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
      body: JSON.stringify({
        event: {
          id: "purchase",
          type: "INITIAL_PURCHASE",
          ...from,
          period_type: "NORMAL",
          product_id: "yearly",
          app_user_id: user.userId,
          expiration_at_ms: Date.now() + 86_400_000,
          event_timestamp_ms: Date.now(),
        },
      }),
    });
  const rows = () =>
    backend.run(async (ctx) => await ctx.db.query("subscriptions").collect());
  return { ...user, purchase, rows };
}

describe("Test Store purchases outside the dev deployment", () => {
  beforeEach(() => {
    vi.stubEnv("CONVEX_SITE_URL", "https://amiable-setter-120.convex.site");
  });

  it("ignores a Test Store purchase webhook", async () => {
    const f = await fixture();
    expect((await f.purchase({ store: "TEST_STORE" })).status).toBe(200);
    expect(await f.rows()).toEqual([]);
  });

  it("ignores a purchase from the Test Store app that leaves out its store", async () => {
    const f = await fixture();
    expect((await f.purchase({ app_id: "app20ea108057" })).status).toBe(200);
    expect(await f.rows()).toEqual([]);
  });

  it("still records a real store purchase", async () => {
    const f = await fixture();
    expect((await f.purchase({ store: "APP_STORE" })).status).toBe(200);
    expect(await f.rows()).toMatchObject([
      { userId: f.userId, status: "pro", productId: "yearly" },
    ]);
  });

  it("does not grant Pro from a Test Store subscription on purchase sync", async () => {
    const f = await fixture();
    stubRevenueCatFetch(
      revenuecatSnapshot({ productId: "yearly", store: "test_store" }),
    );
    expect(await f.t.action(api.subscriptions.syncPurchase, {})).toBe(false);
    expect(await f.rows()).toEqual([]);
  });
});

describe("Test Store purchases on the dev deployment", () => {
  beforeEach(() => {
    vi.stubEnv("CONVEX_SITE_URL", "https://amicable-antelope-639.convex.site");
  });

  it("records a Test Store purchase webhook", async () => {
    const f = await fixture();
    expect((await f.purchase({ store: "TEST_STORE" })).status).toBe(200);
    expect(await f.rows()).toMatchObject([
      { userId: f.userId, status: "pro", productId: "yearly" },
    ]);
  });

  it("grants Pro from a Test Store subscription on purchase sync", async () => {
    const f = await fixture();
    stubRevenueCatFetch(
      revenuecatSnapshot({ productId: "yearly", store: "test_store" }),
    );
    expect(await f.t.action(api.subscriptions.syncPurchase, {})).toBe(true);
    expect(await f.rows()).toMatchObject([
      { userId: f.userId, status: "pro", productId: "yearly" },
    ]);
  });
});
