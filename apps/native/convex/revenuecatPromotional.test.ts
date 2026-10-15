// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import {
  newConvexTest,
  revenuecatSnapshot,
  stubRevenueCatFetch,
} from "./test.setup";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("REVENUECAT_WEBHOOK_SECRET", "test-secret");
  vi.stubEnv("REVENUECAT_API_KEY", "appl_test");
  vi.stubEnv("REVENUECAT_ENTITLEMENT_ID", "Shelvr Pro");
  vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "false");
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** RevenueCat's view of a customer granted Pro with no end date. */
const lifetimeGrant = {
  request_date_ms: Date.now(),
  subscriber: {
    entitlements: {
      "Shelvr Pro": {
        product_identifier: "rc_promo_Shelvr_Pro_lifetime",
        expires_date: null,
      },
    },
    subscriptions: {},
  },
};

async function fixture(previous?: { expiresAt: number }) {
  const t = newConvexTest();
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {});
    if (previous !== undefined) {
      await ctx.db.insert("subscriptions", {
        userId: id,
        status: "lapsed",
        productId: "monthly_499",
        expiresAt: previous.expiresAt,
        updatedAt: 1,
        eventTimestampMs: 1,
      });
    }
    return id;
  });
  // A dashboard grant arrives as a promotional non-renewing purchase. A
  // lifetime grant has no expiry on the event.
  const grant = (fields: Record<string, unknown> = {}) =>
    t.fetch("/webhooks/revenuecat", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
      body: JSON.stringify({
        event: {
          id: "promo-grant",
          type: "NON_RENEWING_PURCHASE",
          period_type: "PROMOTIONAL",
          product_id: "rc_promo_Shelvr_Pro_lifetime",
          app_user_id: userId,
          event_timestamp_ms: 2,
          ...fields,
        },
      }),
    });
  const save = () =>
    t
      .withIdentity({ subject: `${userId}|session-1` })
      .mutation(api.items.createNoteItem, { text: "Synthetic grant test" });
  return { grant, save };
}

describe("promotional grant webhook", () => {
  it("unlocks a new customer granted Pro with no end date", async () => {
    const f = await fixture();
    const fetchMock = stubRevenueCatFetch(lifetimeGrant);
    expect((await f.grant()).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(f.save()).resolves.toBeDefined();
  });

  it("unlocks a lapsed customer granted Pro with no end date", async () => {
    const f = await fixture({ expiresAt: Date.now() - 1 });
    stubRevenueCatFetch(lifetimeGrant);
    expect((await f.grant()).status).toBe(200);
    await expect(f.save()).resolves.toBeDefined();
  });

  it("takes a dated grant's end from RevenueCat, not the event body", async () => {
    const f = await fixture({ expiresAt: Date.now() - 1 });
    stubRevenueCatFetch(
      revenuecatSnapshot({
        productId: "rc_promo_Shelvr_Pro_monthly",
        expiresAt: Date.now() + 60_000,
      }),
    );
    expect(
      (await f.grant({ expiration_at_ms: Date.now() + 60_000 })).status,
    ).toBe(200);
    await expect(f.save()).resolves.toBeDefined();
  });

  it("asks RevenueCat to retry when the lookup fails", async () => {
    const f = await fixture();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );
    expect((await f.grant()).status).toBe(503);
    await expect(f.save()).rejects.toThrow(/Pro required/);
  });
});
