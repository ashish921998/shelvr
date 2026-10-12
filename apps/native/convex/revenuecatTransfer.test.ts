// @vitest-environment edge-runtime
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  newConvexTest,
  revenuecatSnapshot,
  stubRevenueCatFetch,
} from "./test.setup";
import { internal } from "./_generated/api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("transfer webhook reconciliation", () => {
  async function fixture() {
    vi.stubEnv("REVENUECAT_WEBHOOK_SECRET", "test-secret");
    vi.stubEnv("REVENUECAT_API_KEY", "appl_test");
    const t = newConvexTest();
    const ids = await t.run(async (ctx) => {
      const from = await ctx.db.insert("users", {});
      const to = await ctx.db.insert("users", {});
      await ctx.db.insert("subscriptions", {
        userId: from,
        status: "lifetime",
        expiresAt: 0,
        updatedAt: 1,
        eventTimestampMs: 1,
      });
      return { from, to };
    });
    const body = {
      event: {
        type: "TRANSFER",
        transferred_from: [ids.from, "$RCAnonymousID:old"],
        transferred_to: [ids.to],
        event_timestamp_ms: 2,
      },
    };
    const send = () =>
      t.fetch("/webhooks/revenuecat", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    const rows = () =>
      t.run(async (ctx) => await ctx.db.query("subscriptions").collect());
    const empty = revenuecatSnapshot();
    const active = revenuecatSnapshot({
      productId: "annual",
      periodType: "trial",
    });
    return { t, ids, send, rows, empty, active };
  }
  it("moves access to the receiving account, revokes even lifetime on the source, and ignores anonymous IDs", async () => {
    const f = await fixture();
    const fetchMock = stubRevenueCatFetch(f.empty)
      .mockResolvedValueOnce(Response.json(f.empty))
      .mockResolvedValueOnce(Response.json(f.active));
    expect((await f.send()).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const rows = await f.rows();
    expect(rows.find((r) => r.userId === f.ids.from)).toMatchObject({
      status: "lapsed",
      expiresAt: 0,
    });
    expect(rows.find((r) => r.userId === f.ids.to)).toMatchObject({
      status: "trialing",
      productId: "annual",
    });
  });
  it("retries a failed lookup without partially revoking the source account", async () => {
    const f = await fixture();
    stubRevenueCatFetch(f.empty)
      .mockResolvedValueOnce(Response.json(f.empty))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    expect((await f.send()).status).toBe(503);
    expect(await f.rows()).toMatchObject([
      { userId: f.ids.from, status: "lifetime", eventTimestampMs: 1 },
    ]);
  });
  it("does not apply duplicate or older transfer snapshots over a newer renewal", async () => {
    const f = await fixture();
    await f.t.mutation(internal.subscriptions.upsertSubscription, {
      userId: f.ids.to,
      status: "pro",
      expiresAt: Date.now() + 90_000,
      eventTimestampMs: 3,
    });
    await f.t.mutation(internal.subscriptions.applySnapshots, {
      eventTimestampMs: 2,
      snapshots: [{ userId: f.ids.to, status: "lapsed", expiresAt: 0 }],
    });
    expect((await f.rows()).find((r) => r.userId === f.ids.to)).toMatchObject({
      status: "pro",
      eventTimestampMs: 3,
    });
  });
  it("rejects an unauthenticated transfer without looking up customers", async () => {
    const f = await fixture();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(
      (await f.t.fetch("/webhooks/revenuecat", { method: "POST", body: "{}" }))
        .status,
    ).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["transferred_from", "transferred_to"])(
    "rejects empty %s without looking up customers",
    async (field) => {
      const f = await fixture();
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const response = await f.t.fetch("/webhooks/revenuecat", {
        method: "POST",
        headers: { Authorization: "Bearer test-secret" },
        body: JSON.stringify({
          event: {
            type: "TRANSFER",
            event_timestamp_ms: 2,
            transferred_from: [f.ids.from],
            transferred_to: [f.ids.to],
            [field]: [],
          },
        }),
      });
      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(await f.rows()).toMatchObject([
        { userId: f.ids.from, status: "lifetime" },
      ]);
    },
  );
});
