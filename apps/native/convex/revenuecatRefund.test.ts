// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { newConvexTest } from "./test.setup";

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
  vi.restoreAllMocks();
});

async function fixture(seed = true) {
  const t = newConvexTest();
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {});
    if (seed) {
      await ctx.db.insert("subscriptions", {
        userId: id,
        status: "pro",
        productId: "monthly_499",
        expiresAt: Date.now() + 60_000,
        updatedAt: 1,
        eventTimestampMs: 1,
      });
    }
    return id;
  });
  const send = (overrides: Record<string, unknown> = {}) =>
    t.fetch("/webhooks/revenuecat", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
      body: JSON.stringify({
        event: {
          app_user_id: userId,
          type: "CANCELLATION",
          cancel_reason: "CUSTOMER_SUPPORT",
          product_id: "monthly_499",
          expiration_at_ms: Date.now() - 1,
          event_timestamp_ms: 2,
          ...overrides,
        },
      }),
    });
  const row = () =>
    t.run((ctx) =>
      ctx.db
        .query("subscriptions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique(),
    );
  const signedIn = t.withIdentity({ subject: `${userId}|session-1` });
  return { t, userId, send, row, signedIn };
}

function snapshot(productId?: string, entitlementId = "Shelvr Pro") {
  const now = Date.now();
  return {
    request_date_ms: now,
    subscriber: {
      entitlements: productId
        ? {
            [entitlementId]: {
              product_identifier: productId,
              expires_date: new Date(now + 60_000).toISOString(),
            },
          }
        : {},
      subscriptions: {
        monthly_499: { period_type: "normal" },
        annual_1999: { period_type: "normal" },
      },
    },
  };
}

describe("refund webhook reconciliation", () => {
  it("records refund telemetry once after a failed lookup is retried", async () => {
    const f = await fixture();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const event = {
      id: "refund-telemetry-test",
      period_type: "NORMAL",
      environment: "SANDBOX",
    };
    const receipts = () =>
      f.t.run((ctx) => ctx.db.query("paymentAnalyticsReceipts").collect());
    expect((await f.send(event)).status).toBe(503);
    expect(await receipts()).toHaveLength(0);
    fetchMock.mockImplementation(async () => Response.json(snapshot()));
    expect((await f.send(event)).status).toBe(200);
    expect((await f.send(event)).status).toBe(200);
    expect(await receipts()).toHaveLength(1);
    const jobs = await f.t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0].args[0].payment).toMatchObject({
      event: "subscription_cancelled",
      cancel_category: "refund",
    });
  });

  it.each([
    { type: "CANCELLATION" },
    {
      type: "EXPIRATION",
      cancel_reason: undefined,
      expiration_reason: "CUSTOMER_SUPPORT",
    },
  ])("revokes refunded subscription access for $type", async (event) => {
    const f = await fixture();
    const fetchMock = vi.fn().mockResolvedValue(Response.json(snapshot()));
    vi.stubGlobal("fetch", fetchMock);
    expect((await f.send(event)).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.revenuecat.com/v1/subscribers/${f.userId}`,
      expect.objectContaining({
        headers: { Authorization: "Bearer appl_test" },
      }),
    );
    expect(await f.row()).toMatchObject({
      status: "lapsed",
      expiresAt: 0,
      eventTimestampMs: 2,
    });
    expect((await f.row())?.productId).toBeUndefined();
    expect(
      await f.signedIn.query(api.subscriptions.getEntitlement, {}),
    ).toMatchObject({ status: "lapsed" });
    await expect(
      f.signedIn.mutation(api.items.createNoteItem, {
        text: "refund gate test",
      }),
    ).rejects.toThrow(/Pro required/);
  });

  it.each(["CANCELLATION", "EXPIRATION"])(
    "reconciles a subscription refund on %s",
    async (type) => {
      const f = await fixture();
      await f.t.mutation(internal.subscriptions.upsertSubscription, {
        userId: f.userId,
        status: "pro",
        productId: "annual_1999",
        expiresAt: Date.now() + 60_000,
        eventTimestampMs: 2,
        authoritative: true,
      });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(Response.json(snapshot())),
      );
      expect(
        (
          await f.send({
            type,
            product_id: "annual_1999",
            event_timestamp_ms: 3,
            cancel_reason:
              type === "CANCELLATION" ? "CUSTOMER_SUPPORT" : undefined,
            expiration_reason:
              type === "EXPIRATION" ? "CUSTOMER_SUPPORT" : undefined,
          })
        ).status,
      ).toBe(200);
      expect(await f.row()).toMatchObject({ status: "lapsed", expiresAt: 0 });
    },
  );

  it("preserves an active annual subscription when a monthly purchase is refunded", async () => {
    const f = await fixture();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json(snapshot("annual_1999"))),
    );
    expect((await f.send()).status).toBe(200);
    expect(await f.row()).toMatchObject({
      status: "pro",
      productId: "annual_1999",
    });
  });

  it("uses the configured entitlement and ignores unrelated access", async () => {
    const f = await fixture();
    vi.stubEnv("REVENUECAT_ENTITLEMENT_ID", "shelvr_pro");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(snapshot("annual_1999", "shelvr_pro")),
      )
      .mockResolvedValueOnce(
        Response.json(snapshot("monthly_499", "unrelated")),
      );
    vi.stubGlobal("fetch", fetchMock);
    expect((await f.send()).status).toBe(200);
    expect(await f.row()).toMatchObject({ status: "pro" });
    expect((await f.send({ event_timestamp_ms: 3 })).status).toBe(200);
    expect(await f.row()).toMatchObject({ status: "lapsed" });
  });

  it.each(["annual_1999", "monthly_499"])(
    "restores %s access on a refund reversal",
    async (productId) => {
      const f = await fixture();
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(Response.json(snapshot()))
        .mockResolvedValueOnce(Response.json(snapshot(productId)))
        .mockResolvedValueOnce(Response.json(snapshot()));
      vi.stubGlobal("fetch", fetchMock);
      expect((await f.send()).status).toBe(200);
      expect(await f.row()).toMatchObject({ status: "lapsed" });
      const reversal = {
        type: "REFUND_REVERSED",
        product_id: productId,
        event_timestamp_ms: 3,
      };
      expect((await f.send(reversal)).status).toBe(200);
      const restored = await f.row();
      expect(restored).toMatchObject({
        status: "pro",
        productId,
      });
      expect((await f.send(reversal)).status).toBe(200);
      expect(await f.row()).toEqual(restored);
    },
  );

  it("does not grant access on a reversal when the entitlement is still expired", async () => {
    const f = await fixture();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json(snapshot())),
    );
    expect((await f.send({ type: "REFUND_REVERSED" })).status).toBe(200);
    expect(await f.row()).toMatchObject({ status: "lapsed" });
  });

  it("keeps ordinary cancellation access through the paid period without a lookup", async () => {
    const f = await fixture(false);
    const expiresAt = Date.now() + 60_000;
    await f.t.mutation(internal.subscriptions.upsertSubscription, {
      userId: f.userId,
      status: "pro",
      productId: "annual_1999",
      expiresAt,
      eventTimestampMs: 1,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(
      (
        await f.send({
          product_id: "annual_1999",
          cancel_reason: "UNSUBSCRIBE",
          expiration_at_ms: expiresAt,
        })
      ).status,
    ).toBe(200);
    expect(await f.row()).toMatchObject({ status: "pro", expiresAt });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records an early refund so an older purchase cannot grant access later", async () => {
    const f = await fixture(false);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json(snapshot())),
    );
    expect((await f.send()).status).toBe(200);
    expect(
      (
        await f.send({
          type: "INITIAL_PURCHASE",
          expiration_at_ms: Date.now() + 60_000,
          event_timestamp_ms: 1,
        })
      ).status,
    ).toBe(200);
    expect(await f.row()).toMatchObject({
      status: "lapsed",
      eventTimestampMs: 2,
    });
  });

  it("does not let a refund lookup overwrite a newer renewal arriving in flight", async () => {
    const f = await fixture();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        await f.t.mutation(internal.subscriptions.upsertSubscription, {
          userId: f.userId,
          status: "pro",
          productId: "annual_1999",
          authoritative: true,
          expiresAt: Date.now() + 60_000,
          eventTimestampMs: 3,
        });
        return Response.json(snapshot());
      }),
    );
    expect((await f.send()).status).toBe(200);
    expect(await f.row()).toMatchObject({
      status: "pro",
      productId: "annual_1999",
      eventTimestampMs: 3,
    });
  });

  it.each(["http", "network", "malformed", "missing_key"])(
    "returns 503 and preserves access on %s failure, then retries successfully",
    async (failure) => {
      const f = await fixture();
      const before = await f.row();
      const fetchMock = vi.fn();
      if (failure === "http")
        fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
      if (failure === "network")
        fetchMock.mockRejectedValue(new Error("lookup failed"));
      if (failure === "malformed")
        fetchMock.mockResolvedValue(Response.json({}));
      if (failure === "missing_key") vi.stubEnv("REVENUECAT_API_KEY", "");
      vi.stubGlobal("fetch", fetchMock);
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      expect((await f.send()).status).toBe(503);
      expect(await f.row()).toEqual(before);
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining("revenuecat_refund_reconciliation_failed"),
      );
      vi.stubEnv("REVENUECAT_API_KEY", "appl_test");
      fetchMock.mockReset().mockResolvedValue(Response.json(snapshot()));
      expect((await f.send()).status).toBe(200);
      expect(await f.row()).toMatchObject({ status: "lapsed" });
    },
  );

  it("does not recreate subscriptions for a deleted account", async () => {
    const f = await fixture(false);
    await f.t.run((ctx) => ctx.db.delete(f.userId));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await f.send()).status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await f.row()).toBeNull();
  });

  it.each(["unsupported_product", "lifetime"])(
    "does not grant access for unsupported product %s",
    async (productId) => {
      const f = await fixture(false);
      expect(
        (
          await f.send({
            type: "NON_RENEWING_PURCHASE",
            product_id: productId,
          })
        ).status,
      ).toBe(200);
      expect(await f.row()).toBeNull();
    },
  );
});
