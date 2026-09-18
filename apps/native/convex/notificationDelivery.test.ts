// @vitest-environment edge-runtime
import translations from "./model/notificationTranslations.json";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import { newConvexTest } from "./test.setup";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function seed(tokens = ["token-a"]) {
  const t = newConvexTest();
  const digestId = await t.run(async (ctx) => {
    await ctx.db.insert("notificationPreferences", {
      userId: "user-a",
      weeklyShelfEnabled: true,
      nextDigestAt: Date.now() + 7 * 86400000,
      updatedAt: Date.now(),
    });
    for (const token of tokens)
      await ctx.db.insert("notificationDevices", {
        userId: "user-a",
        token,
        enabled: true,
        platform: "ios",
        lastSeenAt: Date.now(),
      });
    const itemId = await ctx.db.insert("items", {
      userId: "user-a",
      type: "note",
      status: "ready",
      title: "A note",
      tags: [],
      searchText: "note",
    });
    return ctx.db.insert("weeklyDigests", {
      userId: "user-a",
      weekStart: Date.now(),
      createdAt: Date.now(),
      itemIds: [itemId],
      deliveryStatus: "pending",
      deliveryNextAttemptAt: Date.now(),
    });
  });
  const digest = () => t.run((ctx) => ctx.db.get(digestId));
  const advance = async () => {
    const row = await digest();
    if (row?.deliveryNextAttemptAt) vi.setSystemTime(row.deliveryNextAttemptAt);
  };
  return { t, digestId, digest, advance };
}

const json = (data: unknown) =>
  new Response(JSON.stringify({ data }), { status: 200 });

describe("durable digest delivery", () => {
  it("sends each device its own language and preserves the legacy fallback", async () => {
    const { t, digestId } = await seed(["token-a", "token-b"]);
    await t.run(async (ctx) => {
      const device = await ctx.db
        .query("notificationDevices")
        .withIndex("by_token", (q) => q.eq("token", "token-a"))
        .unique();
      await ctx.db.patch(device!._id, { locale: "ja" });
    });
    const fetchMock = vi.fn().mockResolvedValue(
      json([
        { status: "ok", id: "ticket-a" },
        { status: "ok", id: "ticket-b" },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    await t.action(internal.notificationDelivery.send, { digestId });
    const payloads = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(
      payloads.find((p: { to: string }) => p.to === "token-a"),
    ).toMatchObject({
      title: translations.ja.title,
      body: translations.ja.namedSingle.replace("%{title}", "A note"),
    });
    // A device with no stored locale still names the save; only a shelf with
    // nothing nameable falls back to the pre-locale count copy.
    expect(
      payloads.find((p: { to: string }) => p.to === "token-b"),
    ).toMatchObject({
      title: translations.en.title,
      body: translations.en.namedSingle.replace("%{title}", "A note"),
    });
  });

  it("keeps Japanese copy on a resend after a nonterminal receipt error", async () => {
    const { t, digestId, advance, digest } = await seed();
    await t.run(async (ctx) => {
      const device = await ctx.db
        .query("notificationDevices")
        .withIndex("by_token", (q) => q.eq("token", "token-a"))
        .unique();
      await ctx.db.patch(device!._id, { locale: "ja" });
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json([{ status: "ok", id: "ticket-a" }]))
      .mockResolvedValueOnce(
        json({
          "ticket-a": {
            status: "error",
            details: { error: "MessageRateExceeded" },
          },
        }),
      )
      .mockResolvedValueOnce(json([{ status: "ok", id: "ticket-retry" }]));
    vi.stubGlobal("fetch", fetchMock);
    await t.action(internal.notificationDelivery.send, { digestId });
    await advance();
    await t.action(internal.notificationDelivery.send, { digestId });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const retried = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(retried[0]).toMatchObject({
      title: translations.ja.title,
      body: translations.ja.namedSingle.replace("%{title}", "A note"),
    });
    expect((await digest())?.deliveryRecipients?.[0]).toMatchObject({
      locale: "ja",
      state: "receipt",
    });
  });

  it("rejects receipt recipients without a provider ticket at the mutation boundary", async () => {
    const { t, digestId } = await seed();
    await expect(
      t.mutation(internal.notificationDelivery.finish, {
        digestId,
        attempt: 1,
        recipients: [
          // @ts-expect-error Exercise runtime validation of an invalid caller payload.
          { token: "token-a", state: "receipt" },
        ],
      }),
    ).rejects.toThrow();
  });

  it("retries a failed send on the same digest through the recovery cron", async () => {
    const { t, digestId, digest, advance } = await seed();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(json([{ status: "ok", id: "ticket-a" }]));
    vi.stubGlobal("fetch", fetchMock);
    await t.action(internal.notificationDelivery.send, { digestId });
    expect(await digest()).toMatchObject({
      deliveryStatus: "pending",
      deliveryAttempts: 1,
    });
    expect((await digest())?.deliveredAt).toBeUndefined();
    await advance();
    await t.mutation(internal.notificationDelivery.recover, {});
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await digest()).toMatchObject({
      deliveryAttempts: 2,
      deliveryRecipients: [{ state: "receipt", ticketId: "ticket-a" }],
    });
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(
      await t.run((ctx) => ctx.db.query("weeklyDigests").collect()),
    ).toHaveLength(1);
  });

  it("tracks partial results, checks receipts, and disables invalid tokens", async () => {
    const { t, digestId, digest, advance } = await seed([
      "token-a",
      "token-b",
      "token-c",
    ]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json([
          { status: "ok", id: "ticket-a" },
          { status: "error", details: { error: "DeviceNotRegistered" } },
          { status: "error", details: { error: "MessageRateExceeded" } },
        ]),
      )
      .mockResolvedValueOnce(json({ "ticket-a": { status: "ok" } }))
      .mockResolvedValueOnce(json([{ status: "ok", id: "ticket-c" }]))
      .mockResolvedValueOnce(
        json({
          "ticket-c": {
            status: "error",
            details: { error: "DeviceNotRegistered" },
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await t.action(internal.notificationDelivery.send, { digestId });
    expect((await digest())?.deliveredAt).toBeUndefined();
    await advance();
    await t.action(internal.notificationDelivery.send, { digestId });
    expect(
      JSON.parse(fetchMock.mock.calls[2][1].body).map(
        (message: { to: string }) => message.to,
      ),
    ).toEqual(["token-c"]);
    await advance();
    await t.action(internal.notificationDelivery.send, { digestId });
    expect(await digest()).toMatchObject({
      deliveryStatus: "complete",
      deliveredAt: expect.any(Number),
    });
    const devices = await t.run((ctx) =>
      ctx.db.query("notificationDevices").collect(),
    );
    expect(
      devices.filter((device) => device.enabled).map((device) => device.token),
    ).toEqual(["token-a"]);
  });

  it("targets enabled devices when many disabled rows precede them", async () => {
    const { t, digestId } = await seed([]);
    await t.run(async (ctx) => {
      // Older, disabled rows sort first in every user index. They must neither
      // fill the recipient page nor appear as recipients.
      for (let i = 0; i < 30; i++)
        await ctx.db.insert("notificationDevices", {
          userId: "user-a",
          token: `stale-${i}`,
          enabled: false,
          platform: "ios",
          lastSeenAt: Date.now(),
        });
      await ctx.db.insert("notificationDevices", {
        userId: "user-a",
        token: "live-a",
        enabled: true,
        platform: "ios",
        lastSeenAt: Date.now(),
      });
      // Another user's enabled device is never a recipient.
      await ctx.db.insert("notificationDevices", {
        userId: "user-b",
        token: "live-b",
        enabled: true,
        platform: "android",
        lastSeenAt: Date.now(),
      });
    });
    const claimed = await t.mutation(internal.notificationDelivery.claim, {
      digestId,
    });
    expect(claimed?.recipients).toEqual([
      { token: "live-a", state: "pending" },
    ]);
  });

  it("recovers an interrupted attempt after its lease and rejects stale completion", async () => {
    const { t, digestId, advance, digest } = await seed();
    const first = await t.mutation(internal.notificationDelivery.claim, {
      digestId,
    });
    expect(
      await t.mutation(internal.notificationDelivery.claim, { digestId }),
    ).toBeNull();
    await advance();
    const second = await t.mutation(internal.notificationDelivery.claim, {
      digestId,
    });
    expect(second?.attempt).toBe(2);
    await t.mutation(internal.notificationDelivery.finish, {
      digestId,
      attempt: first!.attempt,
      recipients: [{ token: "token-a", state: "delivered" }],
    });
    expect((await digest())?.deliveredAt).toBeUndefined();
  });

  it("bounds retries and preserves the final failure", async () => {
    const { t, digestId, advance, digest } = await seed();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(new Response("unavailable", { status: 503 })),
        ),
    );
    for (let i = 0; i < 8; i++) {
      await t.action(internal.notificationDelivery.send, { digestId });
      await advance();
    }
    expect(await digest()).toMatchObject({
      deliveryStatus: "failed",
      deliveryError: "retry_limit_reached",
      deliveryAttempts: 8,
    });
    expect(
      await t.mutation(internal.notificationDelivery.claim, { digestId }),
    ).toBeNull();
  });

  it("does not resend when a receipt is temporarily missing", async () => {
    const { t, digestId, advance, digest } = await seed();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json([{ status: "ok", id: "ticket-a" }]))
      .mockResolvedValueOnce(json({}));
    vi.stubGlobal("fetch", fetchMock);
    await t.action(internal.notificationDelivery.send, { digestId });
    await advance();
    await t.action(internal.notificationDelivery.send, { digestId });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain("getReceipts");
    expect((await digest())?.deliveryRecipients?.[0].state).toBe("receipt");
  });

  it("honors opt-out before delivery", async () => {
    const { t, digestId, digest } = await seed();
    await t.run(async (ctx) => {
      const prefs = await ctx.db.query("notificationPreferences").unique();
      await ctx.db.patch(prefs!._id, { weeklyShelfEnabled: false });
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await t.action(internal.notificationDelivery.send, { digestId });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await digest()).toMatchObject({
      deliveryStatus: "failed",
      deliveryError: "notifications_disabled",
    });
  });

  it("recovers legacy unsent digests without resending completed ones", async () => {
    const { t, digestId, digest } = await seed();
    const completedId = await t.run(async (ctx) => {
      const original = await ctx.db.get(digestId);
      await ctx.db.patch(digestId, {
        deliveryStatus: undefined,
        deliveryNextAttemptAt: undefined,
      });
      return ctx.db.insert("weeklyDigests", {
        userId: "user-a",
        weekStart: Date.now() - 7 * 86400000,
        createdAt: Date.now() - 7 * 86400000,
        itemIds: original!.itemIds,
        deliveredAt: Date.now() - 7 * 86400000,
      });
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json([{ status: "ok", id: "ticket-a" }]));
    vi.stubGlobal("fetch", fetchMock);
    await t.mutation(internal.notificationDelivery.recover, {});
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await digest())?.deliveryRecipients?.[0].state).toBe("receipt");
    expect(
      (await t.run((ctx) => ctx.db.get(completedId)))?.deliveryStatus,
    ).toBe("complete");
  });

  it("names a fully enriched save ahead of one guessed from its URL", async () => {
    const { t, digestId } = await seed();
    await t.run(async (ctx) => {
      const digest = (await ctx.db.get(digestId))!;
      // A `partial` item is classified from the URL alone because the page
      // could not be read, so its title is a guess.
      const guessed = await ctx.db.insert("items", {
        userId: "user-a",
        type: "link",
        status: "ready",
        title: "Guessed from the URL",
        enrichment: "partial",
        tags: [],
        searchText: "guessed",
      });
      await ctx.db.patch(digestId, {
        itemIds: [guessed, ...digest.itemIds],
      });
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json([{ status: "ok", id: "ticket-a" }]));
    vi.stubGlobal("fetch", fetchMock);
    await t.action(internal.notificationDelivery.send, { digestId });
    const [payload] = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.body).toContain("A note");
    expect(payload.body).not.toContain("Guessed from the URL");
    expect(payload.data).toMatchObject({
      url: `/digest/${digestId}`,
      kind: "weekly_shelf",
      notificationId: digestId,
    });
  });

  it("records one send event when delivery reaches a terminal state", async () => {
    const { t, digestId, advance } = await seed();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json([{ status: "ok", id: "ticket-a" }]))
      .mockResolvedValue(json({ "ticket-a": { status: "ok" } }));
    vi.stubGlobal("fetch", fetchMock);
    await t.action(internal.notificationDelivery.send, { digestId });
    const telemetry = async () =>
      (
        await t.run((ctx) =>
          ctx.db.system.query("_scheduled_functions").collect(),
        )
      ).filter((job) => job.name.includes("captureNotification"));
    // Still awaiting a receipt, so nothing is terminal yet.
    expect(await telemetry()).toHaveLength(0);
    await advance();
    await t.action(internal.notificationDelivery.send, { digestId });
    const jobs = await telemetry();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].args[0]).toMatchObject({
      userId: "user-a",
      digestId,
      kind: "weekly_shelf",
      itemCount: 1,
      delivered: true,
    });
    // A further run must not mint a second event for the same digest.
    await t.action(internal.notificationDelivery.send, { digestId });
    expect(await telemetry()).toHaveLength(1);
  });

  it("does not treat a malformed successful HTTP response as delivery", async () => {
    const { t, digestId, digest } = await seed();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([])));
    await t.action(internal.notificationDelivery.send, { digestId });
    expect(await digest()).toMatchObject({
      deliveryStatus: "pending",
      deliveryRecipients: [
        { state: "pending", error: "Error: expo_ticket_count_mismatch" },
      ],
    });
    expect((await digest())?.deliveredAt).toBeUndefined();
  });
});
