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
  const userId = await t.run((ctx) => ctx.db.insert("users", {}));
  const digestId = await t.run(async (ctx) => {
    await ctx.db.insert("notificationPreferences", {
      userId,
      weeklyShelfEnabled: true,
      nextDigestAt: Date.now() + 7 * 86400000,
      updatedAt: Date.now(),
    });
    for (const token of tokens)
      await ctx.db.insert("notificationDevices", {
        userId,
        token,
        enabled: true,
        platform: "ios",
        lastSeenAt: Date.now(),
      });
    const itemId = await ctx.db.insert("items", {
      userId,
      type: "note",
      status: "ready",
      title: "A note",
      tags: [],
      searchText: "note",
    });
    return ctx.db.insert("weeklyDigests", {
      userId,
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
  return { t, userId, digestId, digest, advance };
}

const json = (data: unknown) =>
  new Response(JSON.stringify({ data }), { status: 200 });

const sendJobs = async (t: Awaited<ReturnType<typeof seed>>["t"]) =>
  (
    await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())
  ).filter((job) =>
    /notificationDelivery:send|captureNotification/.test(job.name),
  ).length;

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
    expect(
      payloads.find((p: { to: string }) => p.to === "token-b"),
    ).toMatchObject({
      title: translations.en.title,
      body: translations.en.namedSingle.replace("%{title}", "A note"),
    });
  });

  it("resends with the same collapse id so a second copy replaces the first", async () => {
    const { t, digestId, advance } = await seed();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("The operation timed out"))
      .mockResolvedValueOnce(json([{ status: "ok", id: "ticket-retry" }]));
    vi.stubGlobal("fetch", fetchMock);
    await t.action(internal.notificationDelivery.send, { digestId });
    await advance();
    await t.action(internal.notificationDelivery.send, { digestId });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [first] = JSON.parse(fetchMock.mock.calls[0][1].body);
    const [second] = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(first).toMatchObject({ collapseId: digestId, tag: digestId });
    expect(second).toMatchObject({ collapseId: digestId, tag: digestId });
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
          // @ts-expect-error
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
    await t.finishAllScheduledFunctions(vi.runOnlyPendingTimers);
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
    const { t, userId, digestId } = await seed([]);
    await t.run(async (ctx) => {
      for (let i = 0; i < 30; i++)
        await ctx.db.insert("notificationDevices", {
          userId,
          token: `stale-${i}`,
          enabled: false,
          platform: "ios",
          lastSeenAt: Date.now(),
        });
      await ctx.db.insert("notificationDevices", {
        userId,
        token: "live-a",
        enabled: true,
        platform: "ios",
        lastSeenAt: Date.now(),
      });
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

  it("counts a ticket Expo accepted but never confirmed as delivered at the limit", async () => {
    const { t, digestId, advance, digest } = await seed();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json([{ status: "ok", id: "ticket-a" }]))
        .mockImplementation(() => Promise.resolve(json({}))),
    );
    for (let i = 0; i < 8; i++) {
      await t.action(internal.notificationDelivery.send, { digestId });
      await advance();
    }
    expect(await digest()).toMatchObject({
      deliveryStatus: "complete",
      deliveryError: "retry_limit_reached",
      deliveryAttempts: 8,
    });
    expect((await digest())?.deliveredAt).toBeDefined();
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
    const { t, userId, digestId, digest } = await seed();
    const completedId = await t.run(async (ctx) => {
      const original = await ctx.db.get(digestId);
      await ctx.db.patch(digestId, {
        deliveryStatus: undefined,
        deliveryNextAttemptAt: undefined,
      });
      return ctx.db.insert("weeklyDigests", {
        userId,
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
    await t.finishAllScheduledFunctions(vi.runOnlyPendingTimers);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await digest())?.deliveryRecipients?.[0].state).toBe("receipt");
    expect(
      (await t.run((ctx) => ctx.db.get(completedId)))?.deliveryStatus,
    ).toBe("complete");
  });

  it("names a fully enriched save ahead of one guessed from its URL", async () => {
    const { t, userId, digestId } = await seed();
    await t.run(async (ctx) => {
      const digest = (await ctx.db.get(digestId))!;
      const guessed = await ctx.db.insert("items", {
        userId,
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
    vi.setSystemTime(new Date("2026-10-01T10:00:00Z"));
    const { t, userId, digestId, advance } = await seed();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json([{ status: "ok", id: "ticket-a" }]))
      .mockResolvedValue(json({ "ticket-a": { status: "ok" } }));
    vi.stubGlobal("fetch", fetchMock);
    await t.action(internal.notificationDelivery.send, { digestId });
    const firstSendAt = (await t.run((ctx) => ctx.db.get(digestId)))!
      .deliverySentAt!;
    const telemetry = async () =>
      (
        await t.run((ctx) =>
          ctx.db.system.query("_scheduled_functions").collect(),
        )
      ).filter((job) => job.name.includes("captureNotification"));
    expect(await telemetry()).toHaveLength(0);
    await advance();
    vi.setSystemTime(firstSendAt + 45 * 60 * 1000);
    await t.action(internal.notificationDelivery.send, { digestId });
    const jobs = await telemetry();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].args[0]).toMatchObject({
      userId,
      notificationId: digestId,
      kind: "weekly_shelf",
      itemCount: 1,
      delivered: true,
      sentAt: firstSendAt,
    });
    expect(await t.run((ctx) => ctx.db.get(digestId))).toMatchObject({
      deliverySentAt: firstSendAt,
    });
    await t.action(internal.notificationDelivery.send, { digestId });
    expect(await telemetry()).toHaveLength(1);
  });

  it("keeps a shelf one device confirmed as delivered when time runs out on another", async () => {
    const { t, digestId, digest, advance } = await seed(["token-a", "token-b"]);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          json([
            { status: "ok", id: "ticket-a" },
            { status: "ok", id: "ticket-b" },
          ]),
        )
        .mockResolvedValue(json({ "ticket-a": { status: "ok" } })),
    );
    await t.action(internal.notificationDelivery.send, { digestId });
    await advance();
    await t.action(internal.notificationDelivery.send, { digestId });
    vi.setSystemTime(Date.now() + 24 * 60 * 60 * 1000);
    await t.action(internal.notificationDelivery.send, { digestId });
    expect(await digest()).toMatchObject({
      deliveryStatus: "complete",
      deliveryError: "retry_limit_reached",
    });
    expect((await digest())?.deliveredAt).toBeDefined();
    const events = (
      await t.run((ctx) =>
        ctx.db.system.query("_scheduled_functions").collect(),
      )
    ).filter((job) => job.name.includes("captureNotification"));
    expect(events).toHaveLength(1);
    expect(events[0].args[0]).toMatchObject({ delivered: true });
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

  it("closes a digest whose owner is gone instead of queueing it again", async () => {
    const { t, userId, digestId, digest } = await seed();
    await t.run((ctx) => ctx.db.delete(userId));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await t.action(internal.notificationDelivery.send, { digestId });
    await t.mutation(internal.notificationDelivery.recover, {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await digest()).toMatchObject({
      deliveryStatus: "failed",
      deliveryError: "owner_unavailable",
    });
    expect((await digest())?.deliveryNextAttemptAt).toBeUndefined();
    expect(await sendJobs(t)).toBe(0);
  });

  it("closes a digest already sent once when its owner is gone, with no send event", async () => {
    const { t, userId, digestId, digest, advance } = await seed();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json([{ status: "ok", id: "ticket-a" }])),
    );
    await t.action(internal.notificationDelivery.send, { digestId });
    expect((await digest())?.deliveryRecipients).toMatchObject([
      { state: "receipt" },
    ]);
    await t.run((ctx) => ctx.db.delete(userId));
    await advance();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await t.action(internal.notificationDelivery.send, { digestId });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await digest()).toMatchObject({
      deliveryStatus: "failed",
      deliveryError: "owner_unavailable",
    });
    expect((await digest())?.deliveryNextAttemptAt).toBeUndefined();
    expect(await sendJobs(t)).toBe(0);
  });

  it("settles a send already in flight when deletion begins, with no send event", async () => {
    const { t, userId, digestId, digest } = await seed();
    const claimed = await t.mutation(internal.notificationDelivery.claim, {
      digestId,
    });
    await t.run((ctx) => ctx.db.patch(userId, { deleting: true }));
    await t.mutation(internal.notificationDelivery.finish, {
      digestId,
      attempt: claimed!.attempt,
      recipients: [{ token: "token-a", state: "delivered" }],
    });
    expect(await digest()).toMatchObject({ deliveryStatus: "complete" });
    expect(await sendJobs(t)).toBe(0);
  });
});

describe("first-vote push", () => {
  const HOUR = 60 * 60 * 1000;

  beforeEach(() => {
    vi.setSystemTime(new Date("2026-11-06T18:00:00Z"));
    vi.stubEnv("PLAN_VOTE_PUSH_ENABLED", "true");
  });
  afterEach(() => vi.unstubAllEnvs());

  async function voteLink(
    options: { city?: string; locale?: string; device?: boolean } = {},
  ) {
    const t = newConvexTest();
    const now = Date.now();
    const { userId, spaceId, shareId, itemIds } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { name: "Ashish" });
      if (options.device !== false)
        await ctx.db.insert("notificationDevices", {
          userId,
          token: "token-a",
          enabled: true,
          platform: "ios",
          lastSeenAt: now,
          ...(options.locale !== undefined ? { locale: options.locale } : {}),
        });
      const spaceId = await ctx.db.insert("spaces", { userId, name: "City" });
      const itemIds = [];
      for (const title of ["Jo's Coffee", "Houndstooth Coffee"])
        itemIds.push(
          await ctx.db.insert("items", {
            userId,
            type: "link",
            status: "ready",
            title,
            tags: [],
            searchText: title,
          }),
        );
      const shareId = await ctx.db.insert("planShares", {
        token: "vote-link",
        userId,
        spaceId,
        city: options.city ?? "Austin",
        places: [
          { key: "p0", name: "Jo's Coffee", why: "", itemId: itemIds[0] },
          {
            key: "p1",
            name: "Houndstooth Coffee",
            why: "",
            itemId: itemIds[1],
          },
        ],
        expiresAt: now + 7 * 24 * HOUR,
      });
      return { userId, spaceId, shareId, itemIds };
    });
    const vote = (
      voterId: string,
      picks: string[],
      passes: string[] = [],
      name?: string,
    ) =>
      t.mutation(internal.planShares.recordPlanVote, {
        token: "vote-link",
        voterId,
        picks,
        passes,
        ...(name !== undefined ? { name } : {}),
        ip: "203.0.113.7",
      });
    const notice = async () => {
      const [row] = await t.run((ctx) =>
        ctx.db.query("planVoteNotices").collect(),
      );
      return row;
    };
    const send = async () => {
      const row = await notice();
      if (Date.now() < row.deliveryNextAttemptAt!)
        vi.setSystemTime(row.deliveryNextAttemptAt!);
      await t.action(internal.notificationDelivery.sendPlanVote, {
        noticeId: row._id,
      });
    };
    const telemetry = async () =>
      (
        await t.run((ctx) =>
          ctx.db.system.query("_scheduled_functions").collect(),
        )
      ).filter((job) => job.name.includes("captureNotification"));
    return {
      t,
      userId,
      spaceId,
      shareId,
      itemIds,
      vote,
      notice,
      send,
      telemetry,
    };
  }

  type Link = Awaited<ReturnType<typeof voteLink>>;

  const sent = (fetchMock: ReturnType<typeof vi.fn>) =>
    JSON.parse(fetchMock.mock.calls[0][1].body);

  function stubExpo() {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json([{ status: "ok", id: "ticket-a" }]));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("names the first voter and the place, and opens the city", async () => {
    const link = await voteLink();
    await link.vote("maya", ["p0"], ["p1"], "Maya Lopez");
    await link.vote("sam", ["p1"], [], "Sam");
    const fetchMock = stubExpo();

    await link.send();

    const { _id } = await link.notice();
    expect(sent(fetchMock)).toEqual([
      {
        to: "token-a",
        collapseId: _id,
        tag: _id,
        title: "First vote on your Austin shortlist",
        body: "Maya would go to Jo's Coffee.",
        data: { url: "/city/Austin", kind: "plan_vote", notificationId: _id },
        sound: "default",
        channelId: "plan-votes",
      },
    ]);
  });

  it.each([
    [
      "a pass-only vote",
      (link: Link) => link.vote("maya", [], ["p0"], "Maya"),
      "Maya would pass on Jo's Coffee.",
    ],
    [
      "a voter with no name",
      (link: Link) => link.vote("guest", ["p0"]),
      "Someone would go to Jo's Coffee.",
    ],
  ])("still names a place for %s", async (_, cast, body) => {
    const link = await voteLink();
    await cast(link);
    const fetchMock = stubExpo();

    await link.send();

    expect(sent(fetchMock)[0]).toMatchObject({ body });
  });

  it("speaks the device's language and keeps a city with a space in the link", async () => {
    const link = await voteLink({ city: "New York", locale: "fr" });
    await link.vote("maya", ["p0"], [], "Maya");
    const fetchMock = stubExpo();

    await link.send();

    expect(sent(fetchMock)[0]).toMatchObject({
      title: "Premier vote sur votre sélection pour New York",
      body: "Maya irait à Jo's Coffee.",
      data: { url: "/city/New%20York" },
    });
  });

  it.each<[string, (link: Link) => Promise<unknown>]>([
    ["link_gone", (link) => link.t.run((ctx) => ctx.db.delete(link.shareId))],
    [
      "owner_unavailable",
      (link) =>
        link.t.run((ctx) => ctx.db.patch(link.userId, { deleting: true })),
    ],
    [
      "pushes_paused",
      async () => vi.stubEnv("PLAN_VOTE_PUSH_ENABLED", "false"),
    ],
    [
      "notifications_disabled",
      (link) =>
        link.t.run((ctx) =>
          ctx.db.insert("notificationPreferences", {
            userId: link.userId,
            weeklyShelfEnabled: true,
            nextDigestAt: Date.now(),
            remindersEnabled: false,
            updatedAt: Date.now(),
          }),
        ),
    ],
    [
      "retry_limit_reached",
      async (link) => {
        const { _id } = await link.notice();
        await link.t.run((ctx) => ctx.db.patch(_id, { deliveryAttempts: 8 }));
      },
    ],
    [
      "expired",
      async (link) => {
        vi.setSystemTime((await link.notice()).createdAt + 6 * HOUR);
      },
    ],
    [
      "expired",
      (link) =>
        link.t.run((ctx) =>
          ctx.db.patch(link.shareId, { expiresAt: Date.now() }),
        ),
    ],
    [
      "superseded",
      async (link) => {
        vi.setSystemTime(Date.now() + 1000);
        await link.t.run((ctx) =>
          ctx.db.insert("planShares", {
            token: "newer-link",
            userId: link.userId,
            spaceId: link.spaceId,
            city: "AUSTIN",
            places: [
              {
                key: "p0",
                name: "Jo's Coffee",
                why: "",
                itemId: link.itemIds[0],
              },
            ],
            expiresAt: Date.now() + 7 * 24 * HOUR,
          }),
        );
      },
    ],
    ["no_items", (link) => link.vote("maya", [])],
    ["no_items", (link) => link.t.run((ctx) => ctx.db.delete(link.itemIds[0]))],
    [
      "no_devices",
      async (link) => {
        await link.t.run(async (ctx) => {
          for (const device of await ctx.db
            .query("notificationDevices")
            .collect())
            await ctx.db.patch(device._id, { enabled: false });
        });
      },
    ],
  ])("closes silently as %s", async (error, arrange) => {
    const link = await voteLink();
    await link.vote("maya", ["p0"], [], "Maya");
    await arrange(link);
    const fetchMock = stubExpo();

    await link.send();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await link.notice()).toMatchObject({
      deliveryStatus: "failed",
      deliveryError: error,
    });
    expect(await link.telemetry()).toEqual([]);
  });

  it("closes a push already sent once when its owner is gone, with no send event", async () => {
    const link = await voteLink();
    await link.vote("maya", ["p0"], [], "Maya");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          json([
            { status: "error", message: "busy", details: { error: "busy" } },
          ]),
        ),
    );
    await link.send();
    expect((await link.notice()).deliveryRecipients).toHaveLength(1);

    await link.t.run((ctx) => ctx.db.delete(link.userId));
    await link.send();

    expect(await link.notice()).toMatchObject({
      deliveryStatus: "failed",
      deliveryError: "owner_unavailable",
    });
    expect(await link.telemetry()).toEqual([]);
  });

  it("sends when the owner has no preferences row", async () => {
    const link = await voteLink();
    await link.vote("maya", ["p0"], [], "Maya");
    const fetchMock = stubExpo();

    await link.send();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await link.notice()).toMatchObject({ deliveryStatus: "pending" });
  });

  it("reports a close that follows an attempt", async () => {
    const link = await voteLink();
    await link.vote("maya", ["p0"], [], "Maya");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          json([
            { status: "error", message: "busy", details: { error: "busy" } },
          ]),
        ),
    );
    await link.send();
    expect(await link.notice()).toMatchObject({ deliveryStatus: "pending" });

    vi.stubEnv("PLAN_VOTE_PUSH_ENABLED", "false");
    await link.send();

    expect(await link.notice()).toMatchObject({
      deliveryStatus: "failed",
      deliveryError: "pushes_paused",
    });
    const jobs = await link.telemetry();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].args[0]).toMatchObject({
      kind: "plan_vote",
      delivered: false,
    });
  });

  it("settles and records one send event with the voter count", async () => {
    const link = await voteLink();
    await link.vote("maya", ["p0"], [], "Maya");
    await link.vote("sam", ["p1"], [], "Sam");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json([{ status: "ok", id: "ticket-a" }]))
        .mockResolvedValue(json({ "ticket-a": { status: "ok" } })),
    );

    await link.send();
    expect(await link.telemetry()).toEqual([]);
    await link.send();

    expect(await link.notice()).toMatchObject({ deliveryStatus: "complete" });
    const jobs = await link.telemetry();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].args[0]).toMatchObject({
      userId: link.userId,
      notificationId: (await link.notice())._id,
      kind: "plan_vote",
      itemCount: 2,
      delivered: true,
    });
  });

  it("is picked up by recovery once due, and not before", async () => {
    const link = await voteLink();
    await link.vote("maya", ["p0"], [], "Maya");
    const sends = async () =>
      (
        await link.t.run((ctx) =>
          ctx.db.system.query("_scheduled_functions").collect(),
        )
      ).filter((job) => job.name.includes("sendPlanVote")).length;
    expect(await sends()).toBe(1);

    await link.t.mutation(internal.notificationDelivery.recover, {});
    expect(await sends()).toBe(1);

    vi.setSystemTime((await link.notice()).deliveryNextAttemptAt!);
    await link.t.mutation(internal.notificationDelivery.recover, {});
    expect(await sends()).toBe(2);
  });
});
