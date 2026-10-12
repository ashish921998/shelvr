// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import {
  newConvexTest,
  revenuecatSnapshot,
  stubRevenueCatFetch,
} from "./test.setup";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("REVENUECAT_WEBHOOK_SECRET", "test-secret");
  vi.stubEnv("REVENUECAT_API_KEY", "test-api-key");
  vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "false");
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function fixture() {
  const t = newConvexTest();
  const expiresAt = Date.now() - 1;
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {});
    await ctx.db.insert("subscriptions", {
      userId: id,
      status: "pro",
      productId: "monthly_499",
      expiresAt,
      updatedAt: 1,
      eventTimestampMs: 1,
    });
    return id;
  });
  await t.mutation(internal.subscriptions.expireSubscription, {
    userId,
    expiresAt,
  });
  const signedIn = t.withIdentity({ subject: `${userId}|session-1` });
  const row = () =>
    t.run((ctx) =>
      ctx.db
        .query("subscriptions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique(),
    );
  const save = () =>
    signedIn.mutation(api.items.createNoteItem, {
      text: "Synthetic grace test",
    });
  const send = (timestamp = 2) =>
    t.fetch("/webhooks/revenuecat", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
      body: JSON.stringify({
        event: {
          id: "billing-test",
          type: "BILLING_ISSUE",
          app_user_id: userId,
          product_id: "untrusted-product",
          period_type: "NORMAL",
          environment: "SANDBOX",
          expiration_at_ms: expiresAt,
          event_timestamp_ms: timestamp,
        },
      }),
    });
  return { t, userId, expiresAt, row, save, send };
}

describe("billing issue webhook", () => {
  it("replaces a sticky lifetime row with the authoritative snapshot", async () => {
    const f = await fixture();
    await f.t.mutation(internal.subscriptions.upsertSubscription, {
      userId: f.userId,
      status: "lifetime",
      expiresAt: 0,
      eventTimestampMs: 2,
    });
    expect(await f.row()).toMatchObject({ status: "lifetime" });
    stubRevenueCatFetch(revenuecatSnapshot());
    expect((await f.send(3)).status).toBe(200);
    expect(await f.row()).toMatchObject({ status: "lapsed" });
    await expect(f.save()).rejects.toThrow(/Pro required/);
  });
  it.each([
    ["normal", "pro"],
    ["trial", "trialing"],
  ])(
    "restores an expired local row from authoritative %s grace and permits a public save",
    async (period, status) => {
      const f = await fixture();
      expect(await f.row()).toMatchObject({ status: "lapsed" });
      await expect(f.save()).rejects.toThrow(/Pro required/);
      const grace = Date.now() + 60_000;
      stubRevenueCatFetch(
        revenuecatSnapshot({
          productId: "monthly_499",
          expiresAt: Date.now() - 1,
          graceUntil: grace,
          periodType: period,
        }),
      );
      expect((await f.send()).status).toBe(200);
      expect(await f.row()).toMatchObject({
        status,
        expiresAt: grace,
        eventTimestampMs: 2,
      });
      await expect(f.save()).resolves.toBeDefined();
      await f.t.mutation(internal.subscriptions.expireSubscription, {
        userId: f.userId,
        expiresAt: f.expiresAt,
      });
      expect(await f.row()).toMatchObject({ status });
      vi.setSystemTime(grace);
      await expect(f.save()).rejects.toThrow(/Pro required/);
      await f.t.mutation(internal.subscriptions.expireSubscription, {
        userId: f.userId,
        expiresAt: grace,
      });
      expect(await f.row()).toMatchObject({ status: "lapsed" });
    },
  );

  it.each(["missing", "expired", "unrelated"])(
    "does not unlock %s Pro",
    async (kind) => {
      const f = await fixture();
      stubRevenueCatFetch(
        kind === "missing"
          ? revenuecatSnapshot()
          : revenuecatSnapshot({
              productId: "monthly_499",
              expiresAt: Date.now() - 1,
              graceUntil: Date.now() + (kind === "expired" ? -1 : 60_000),
              entitlement: kind === "unrelated" ? "Other" : "Shelvr Pro",
            }),
      );
      expect((await f.send()).status).toBe(200);
      await expect(f.save()).rejects.toThrow(/Pro required/);
    },
  );

  it("selects the configured entitlement instead of webhook product fields", async () => {
    const f = await fixture();
    vi.stubEnv("REVENUECAT_ENTITLEMENT_ID", "Custom Pro");
    stubRevenueCatFetch(
      revenuecatSnapshot({
        productId: "monthly_499",
        expiresAt: Date.now() - 1,
        graceUntil: Date.now() + 60_000,
        entitlement: "Custom Pro",
      }),
    );
    expect((await f.send()).status).toBe(200);
    await expect(f.save()).resolves.toBeDefined();
  });

  it.each(["key", "http", "network", "json", "snapshot"])(
    "returns 503 without mutation or telemetry on %s failure",
    async (kind) => {
      const f = await fixture();
      const before = await f.row();
      const fetch = stubRevenueCatFetch({ invalid: true });
      if (kind === "key") vi.stubEnv("REVENUECAT_API_KEY", "");
      if (kind === "http")
        fetch.mockResolvedValue(new Response(null, { status: 500 }));
      if (kind === "network")
        fetch.mockRejectedValue(new Error("Synthetic network failure"));
      if (kind === "json") fetch.mockResolvedValue(new Response("{"));
      expect((await f.send()).status).toBe(503);
      expect(await f.row()).toEqual(before);
      expect(
        await f.t.run((ctx) =>
          ctx.db.query("paymentAnalyticsReceipts").collect(),
        ),
      ).toEqual([]);
      expect(
        await f.t.run((ctx) =>
          ctx.db.system.query("_scheduled_functions").collect(),
        ),
      ).toEqual([]);
    },
  );

  it("cannot overwrite newer revocation when an older lookup is in flight", async () => {
    const f = await fixture();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        await f.t.mutation(internal.subscriptions.upsertSubscription, {
          userId: f.userId,
          status: "lapsed",
          expiresAt: f.expiresAt,
          eventTimestampMs: 3,
          authoritative: true,
        });
        return Response.json(
          revenuecatSnapshot({
            productId: "monthly_499",
            expiresAt: Date.now() - 1,
            graceUntil: Date.now() + 60_000,
          }),
        );
      }),
    );
    expect((await f.send()).status).toBe(200);
    expect(await f.row()).toMatchObject({
      status: "lapsed",
      eventTimestampMs: 3,
    });
    await expect(f.save()).rejects.toThrow(/Pro required/);
  });

  it("converges duplicate deliveries without introducing billing-issue telemetry", async () => {
    const f = await fixture();
    stubRevenueCatFetch(
      revenuecatSnapshot({
        productId: "monthly_499",
        expiresAt: Date.now() - 1,
        graceUntil: Date.now() + 60_000,
      }),
    );
    expect((await f.send()).status).toBe(200);
    const first = await f.row();
    expect((await f.send()).status).toBe(200);
    expect(await f.row()).toEqual(first);
    expect(
      await f.t.run((ctx) =>
        ctx.db.query("paymentAnalyticsReceipts").collect(),
      ),
    ).toHaveLength(0);
    const jobs = await f.t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(jobs.filter((job) => "payment" in job.args[0])).toHaveLength(0);
  });

  it("acknowledges a removed owner without lookup or recreating a subscription", async () => {
    const f = await fixture();
    await f.t.run(async (ctx) => {
      const row = await ctx.db
        .query("subscriptions")
        .withIndex("by_user", (q) => q.eq("userId", f.userId))
        .unique();
      if (row) await ctx.db.delete(row._id);
      await ctx.db.delete(f.userId);
    });
    const fetch = stubRevenueCatFetch(
      revenuecatSnapshot({
        productId: "monthly_499",
        expiresAt: Date.now() - 1,
        graceUntil: Date.now() + 60_000,
      }),
    );
    expect((await f.send()).status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
    expect(await f.row()).toBeNull();
  });
});
