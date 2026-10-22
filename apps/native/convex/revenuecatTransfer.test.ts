// @vitest-environment edge-runtime
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  gate,
  newConvexTest,
  revenuecatSnapshot,
  seedNotes,
  stubRevenueCatFetch,
} from "./test.setup";
import { api, internal } from "./_generated/api";
import { DELETE_BATCH } from "./users";

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
  it("skips an owner whose deletion has begun before looking them up", async () => {
    const f = await fixture();
    await f.t.run((ctx) => ctx.db.patch(f.ids.to, { deleting: true }));
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(f.empty));
    vi.stubGlobal("fetch", fetchMock);
    expect((await f.send()).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      encodeURIComponent(f.ids.from),
    );
    const rows = await f.rows();
    expect(rows.find((r) => r.userId === f.ids.from)).toMatchObject({
      status: "lapsed",
    });
    expect(rows.find((r) => r.userId === f.ids.to)).toBeUndefined();
  });

  it.each([
    ["finished", 0],
    ["began", DELETE_BATCH + 1],
  ])(
    "does not recreate access for a receiving owner whose deletion %s while RevenueCat was answering",
    async (_case, itemCount) => {
      const f = await fixture();
      await seedNotes(f.t, f.ids.to, itemCount);
      const sessionId = await f.t.run((ctx) =>
        ctx.db.insert("authSessions", {
          userId: f.ids.to,
          expirationTime: Date.now() + 60_000,
        }),
      );

      const lookupGate = gate();
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce(Response.json(f.empty))
          .mockImplementationOnce(() =>
            lookupGate.hold(Response.json(f.active)),
          ),
      );

      const webhook = f.send();
      await lookupGate.reached;
      await f.t
        .withIdentity({ subject: `${f.ids.to}|${sessionId}` })
        .mutation(api.users.deleteCurrentUserAccount, {});
      const owner = await f.t.run((ctx) => ctx.db.get(f.ids.to));
      if (itemCount === 0) expect(owner).toBeNull();
      else expect(owner).toMatchObject({ deleting: true });

      lookupGate.open();
      expect((await webhook).status).toBe(200);

      const rows = await f.rows();
      expect(rows.find((r) => r.userId === f.ids.from)).toMatchObject({
        status: "lapsed",
      });
      expect(rows.find((r) => r.userId === f.ids.to)).toBeUndefined();
    },
  );

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
