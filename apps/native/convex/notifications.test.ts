// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TestConvexForDataModel } from "convex-test";
import { api, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { nextWeeklyDigestAt } from "./model/notificationSchedule";
import { DUE_DIGEST_BATCH_SIZE } from "./notifications";
import { archiveCheckOrder, shelfCandidates } from "./model/weeklyShelf";
import { newConvexTest, signedInUser, type TestBackend } from "./test.setup";

type TestCtx = TestConvexForDataModel<DataModel>;

let userA = "";
let userB = "";

async function signInA(backend = newConvexTest()): Promise<TestCtx> {
  const { t, userId } = await signedInUser(backend);
  userA = userId;
  return t;
}

async function signInB(backend: TestBackend): Promise<TestCtx> {
  const { t, userId } = await signedInUser(backend);
  userB = userId;
  return t;
}

async function seedItem(
  t: TestCtx,
  userId: string,
  type: "image" | "link" | "note",
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("items", {
      userId,
      type,
      status: "ready",
      title: `${type} save`,
      tags: [type],
      searchText: `${type} save`,
    });
  });
}

describe("weekly shelf notifications", () => {
  it("updates only the caller's device locale and accepts older clients", async () => {
    const t = newConvexTest();
    const owner = await signInA(t);
    const attacker = await signInB(t);
    await owner.mutation(api.notifications.registerDevice, {
      token: "token-a",
      platform: "ios",
    });
    const device = () =>
      t.run((ctx) => ctx.db.query("notificationDevices").unique());
    expect((await device())?.locale).toBeUndefined();
    await owner.mutation(api.notifications.registerDevice, {
      token: "token-a",
      platform: "ios",
      locale: "ja",
    });
    expect((await device())?.locale).toBe("ja");
    await expect(
      attacker.mutation(api.notifications.registerDevice, {
        token: "token-a",
        platform: "ios",
        locale: "de",
      }),
    ).rejects.toThrow();
    expect((await device())?.locale).toBe("ja");
    await owner.mutation(api.notifications.registerDevice, {
      token: "token-a",
      platform: "ios",
      locale: "__proto__",
    });
    expect((await device())?.locale).toBe("en");
  });

  it.each([NaN, Infinity, -Infinity, -1e100, Number.MAX_SAFE_INTEGER, 1.5])(
    "rejects invalid nextDigestAt %s without changing preferences",
    async (nextDigestAt) => {
      const t = await signInA();
      await expect(
        t.mutation(api.notifications.setPreferences, {
          weeklyShelfEnabled: true,
          nextDigestAt,
        }),
      ).rejects.toThrow("nextDigestAt must be a valid timestamp");
      expect(
        (await t.query(api.notifications.getPreferences, {}))
          .weeklyShelfEnabled,
      ).toBe(false);
    },
  );

  it("revokes only a device owned by the caller and allows later registration", async () => {
    const t = newConvexTest();
    const owner = await signInA(t);
    const other = await signInB(t);
    await owner.mutation(api.notifications.registerDevice, {
      token: "token-a",
      platform: "ios",
    });
    await other.mutation(api.notifications.unregisterDevice, {
      token: "token-a",
    });
    expect(
      (await t.run((ctx) => ctx.db.query("notificationDevices").unique()))
        ?.enabled,
    ).toBe(true);
    await owner.mutation(api.notifications.unregisterDevice, {
      token: "token-a",
    });
    expect(
      (await t.run((ctx) => ctx.db.query("notificationDevices").unique()))
        ?.enabled,
    ).toBe(false);
    await other.mutation(api.notifications.registerDevice, {
      token: "token-a",
      platform: "ios",
    });
    await owner.mutation(api.notifications.unregisterDevice, {
      token: "token-a",
    });
    expect(
      await t.run((ctx) => ctx.db.query("notificationDevices").unique()),
    ).toMatchObject({ userId: userB, enabled: true });
  });

  it("refuses to re-bind another account's enabled token and leaves the row untouched", async () => {
    const t = newConvexTest();
    const owner = await signInA(t);
    const attacker = await signInB(t);
    await owner.mutation(api.notifications.registerDevice, {
      token: "token-a",
      platform: "ios",
    });
    const before = await t.run((ctx) =>
      ctx.db.query("notificationDevices").unique(),
    );
    await expect(
      attacker.mutation(api.notifications.registerDevice, {
        token: "token-a",
        platform: "android",
      }),
    ).rejects.toMatchObject({
      data: {
        code: "notification_token_owned_by_another_account",
        message: expect.stringContaining("registered to another account"),
      },
    });
    expect(
      await t.run((ctx) => ctx.db.query("notificationDevices").unique()),
    ).toEqual(before);
    expect(
      await t.run((ctx) => ctx.db.query("notificationPreferences").collect()),
    ).toHaveLength(1);
  });

  it("lets the owner refresh their own enabled token", async () => {
    const t = await signInA();
    await t.mutation(api.notifications.registerDevice, {
      token: "token-a",
      platform: "ios",
    });
    await t.mutation(api.notifications.registerDevice, {
      token: " token-a ",
      platform: "android",
    });
    const devices = await t.run((ctx) =>
      ctx.db.query("notificationDevices").collect(),
    );
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({
      userId: userA,
      platform: "android",
      enabled: true,
    });
  });

  it("supports an account switch on one device after the first account signs out", async () => {
    const t = newConvexTest();
    const first = await signInA(t);
    const second = await signInB(t);
    await first.mutation(api.notifications.registerDevice, {
      token: "token-a",
      platform: "ios",
    });
    await first.mutation(api.notifications.unregisterDevice, {
      token: "token-a",
    });
    await second.mutation(api.notifications.registerDevice, {
      token: "token-a",
      platform: "ios",
    });
    const devices = await t.run((ctx) =>
      ctx.db.query("notificationDevices").collect(),
    );
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({ userId: userB, enabled: true });
    await second.mutation(api.notifications.unregisterDevice, {
      token: "token-a",
    });
    await first.mutation(api.notifications.registerDevice, {
      token: "token-a",
      platform: "ios",
    });
    expect(
      await t.run((ctx) => ctx.db.query("notificationDevices").unique()),
    ).toMatchObject({ userId: userA, enabled: true });
  });

  it("rejects an unknown timezone at registration without writing anything", async () => {
    const t = await signInA();
    await expect(
      t.mutation(api.notifications.registerDevice, {
        token: "token-a",
        platform: "ios",
        timezone: "Mars/Olympus_Mons",
      }),
    ).rejects.toThrow("Invalid timezone");
    expect(
      await t.run((ctx) => ctx.db.query("notificationDevices").collect()),
    ).toHaveLength(0);
    expect(
      await t.run((ctx) => ctx.db.query("notificationPreferences").collect()),
    ).toHaveLength(0);
  });

  it("rejects an unknown timezone in setPreferences and keeps the stored zone", async () => {
    const t = await signInA();
    await t.mutation(api.notifications.setPreferences, {
      weeklyShelfEnabled: true,
      timezone: "Europe/Paris",
    });
    await expect(
      t.mutation(api.notifications.setPreferences, {
        weeklyShelfEnabled: true,
        timezone: "Not/A_Zone",
      }),
    ).rejects.toThrow("Invalid timezone");
    expect(await t.query(api.notifications.getPreferences, {})).toMatchObject({
      weeklyShelfEnabled: true,
      timezone: "Europe/Paris",
    });
  });

  it("prepares a digest and repairs preferences when the stored zone is invalid", async () => {
    const t = await signInA();
    const now = Date.now();
    await t.run((ctx) =>
      ctx.db.insert("notificationPreferences", {
        userId: userA,
        weeklyShelfEnabled: true,
        nextDigestAt: now - 1,
        timezone: "Mars/Olympus_Mons",
        updatedAt: now,
      }),
    );
    await expect(
      t.mutation(internal.notifications.prepareWeeklyDigest, {
        userId: userA,
        now,
      }),
    ).resolves.toBeNull();
    const rescheduled = await t.run((ctx) =>
      ctx.db.query("notificationPreferences").unique(),
    );
    expect(rescheduled?.nextDigestAt).toBeGreaterThan(now);
    expect(rescheduled?.nextDigestAt).toBe(nextWeeklyDigestAt(now, "UTC"));
    await t.mutation(api.notifications.setPreferences, {
      weeklyShelfEnabled: true,
    });
    expect((await t.query(api.notifications.getPreferences, {})).timezone).toBe(
      "UTC",
    );
  });

  it("chains a follow-up run when a full batch of users is due", async () => {
    vi.useFakeTimers();
    try {
      const t = newConvexTest();
      const now = Date.now();
      const total = DUE_DIGEST_BATCH_SIZE * 2 + 1;
      await t.run(async (ctx) => {
        for (let i = 0; i < total; i++) {
          await ctx.db.insert("notificationPreferences", {
            userId: await ctx.db.insert("users", {}),
            weeklyShelfEnabled: true,
            nextDigestAt: now - 1000,
            updatedAt: now,
          });
        }
      });

      await t.mutation(internal.notifications.prepareDueWeeklyDigests, {});
      const scheduled = await t.run((ctx) =>
        ctx.db.system.query("_scheduled_functions").collect(),
      );
      const names = scheduled.map((job) => job.name);
      expect(
        names.filter((name) => name.endsWith("prepareWeeklyDigest")),
      ).toHaveLength(DUE_DIGEST_BATCH_SIZE);
      const chained = scheduled.filter((job) =>
        job.name.endsWith("prepareDueWeeklyDigests"),
      );
      expect(chained).toHaveLength(1);
      expect(chained[0].args[0]).toMatchObject({
        now,
        cursor: expect.any(String),
      });

      await t.finishAllScheduledFunctions(() => vi.runAllTimers());
      const remaining = await t.run((ctx) =>
        ctx.db
          .query("notificationPreferences")
          .withIndex("by_enabled_and_next_digest_at", (q) =>
            q.eq("weeklyShelfEnabled", true).lte("nextDigestAt", now),
          )
          .collect(),
      );
      expect(remaining).toHaveLength(0);
      const all = await t.run((ctx) =>
        ctx.db.query("notificationPreferences").collect(),
      );
      expect(all).toHaveLength(total);
      expect(all.every((row) => row.nextDigestAt > now)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not chain when the due set fits in one batch", async () => {
    const t = newConvexTest();
    const now = Date.now();
    const total = DUE_DIGEST_BATCH_SIZE - 1;
    await t.run(async (ctx) => {
      for (let i = 0; i < total; i++) {
        await ctx.db.insert("notificationPreferences", {
          userId: `due-${i}`,
          weeklyShelfEnabled: true,
          nextDigestAt: now - 1000,
          updatedAt: now,
        });
      }
    });
    await t.mutation(internal.notifications.prepareDueWeeklyDigests, {});
    const scheduled = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(
      scheduled.filter((job) => job.name.endsWith("prepareDueWeeklyDigests")),
    ).toHaveLength(0);
    expect(
      scheduled.filter((job) => job.name.endsWith("prepareWeeklyDigest")),
    ).toHaveLength(total);
  });

  it("keeps a newly registered device disabled and out of the due queue", async () => {
    const t = await signInA();
    await t.mutation(api.notifications.registerDevice, {
      token: "ExponentPushToken[test]",
      platform: "ios",
    });

    const preferences = await t.run((ctx) =>
      ctx.db.query("notificationPreferences").unique(),
    );
    expect(preferences).toMatchObject({
      weeklyShelfEnabled: false,
    });
    expect(preferences?.nextDigestAt).toBeGreaterThan(Date.now());
    expect(preferences?.nextDigestAt).toBeLessThanOrEqual(
      Date.now() + 7 * 86400000,
    );
  });

  it("re-enables legacy sentinel preferences without inheriting the sentinel", async () => {
    const t = await signInA();
    await t.run((ctx) =>
      ctx.db.insert("notificationPreferences", {
        userId: userA,
        weeklyShelfEnabled: false,
        nextDigestAt: Number.MAX_SAFE_INTEGER,
        timezone: "America/New_York",
        updatedAt: Date.now(),
      }),
    );
    await t.mutation(api.notifications.setPreferences, {
      weeklyShelfEnabled: true,
    });
    const preferences = await t.query(api.notifications.getPreferences, {});
    expect(preferences.nextDigestAt).toBeGreaterThan(Date.now());
    expect(preferences.nextDigestAt).toBeLessThanOrEqual(
      Date.now() + 7 * 86400000,
    );
  });

  it("preserves a real schedule when disabled and repairs it if stale on enable", async () => {
    const t = await signInA();
    await t.mutation(api.notifications.setPreferences, {
      weeklyShelfEnabled: true,
    });
    const initial = await t.query(api.notifications.getPreferences, {});
    await t.mutation(api.notifications.setPreferences, {
      weeklyShelfEnabled: false,
    });
    const stored = await t.run((ctx) =>
      ctx.db.query("notificationPreferences").unique(),
    );
    expect(stored?.nextDigestAt).toBe(initial.nextDigestAt);
    await t.run(async (ctx) => {
      if (stored)
        await ctx.db.patch(stored._id, { nextDigestAt: Date.now() - 86400000 });
    });
    await t.mutation(api.notifications.setPreferences, {
      weeklyShelfEnabled: true,
    });
    expect(
      (await t.query(api.notifications.getPreferences, {})).nextDigestAt,
    ).toBeGreaterThan(Date.now());
  });

  it("processes opted-in users behind a full batch of legacy disabled preferences", async () => {
    vi.useFakeTimers();
    try {
      const t = await signInA();
      const now = Date.now();
      await t.run(async (ctx) => {
        for (let i = 0; i < 50; i++) {
          await ctx.db.insert("notificationPreferences", {
            userId: `disabled-${i}`,
            weeklyShelfEnabled: false,
            nextDigestAt: now - 2000,
            updatedAt: now,
          });
        }
      });
      await t.mutation(api.notifications.setPreferences, {
        weeklyShelfEnabled: true,
        nextDigestAt: now - 1000,
      });

      await t.mutation(internal.notifications.prepareDueWeeklyDigests, {});
      await t.finishAllScheduledFunctions(() => vi.runAllTimers());

      const preferences = await t.query(api.notifications.getPreferences, {});
      expect(preferences.nextDigestAt).toBeGreaterThan(now);
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts disabled until the user opts in", async () => {
    const t = await signInA();

    expect(await t.query(api.notifications.getPreferences, {})).toMatchObject({
      weeklyShelfEnabled: false,
      nextDigestAt: null,
    });
  });

  it("tracks opened saves and creates a three-item digest", async () => {
    const t = await signInA();
    const itemIds = await Promise.all([
      seedItem(t, userA, "link"),
      seedItem(t, userA, "image"),
      seedItem(t, userA, "note"),
      seedItem(t, userA, "link"),
    ]);
    await t.mutation(api.notifications.markItemOpened, {
      itemId: itemIds[3],
    });
    const now = Date.now();
    await t.mutation(api.notifications.setPreferences, {
      weeklyShelfEnabled: true,
      nextDigestAt: now - 1,
      timezone: "America/Los_Angeles",
    });

    await t.mutation(internal.notifications.prepareWeeklyDigest, {
      userId: userA,
      now,
    });

    const digest = await t.query(api.notifications.getDigest, {});
    expect(digest?.itemCount).toBe(3);
    expect(digest?.items.map((item) => item._id)).not.toContain(itemIds[3]);
    expect(digest?.items.map((item) => item.type)).toEqual(
      expect.arrayContaining(["link", "image", "note"]),
    );
  });

  it("does not create a digest while disabled", async () => {
    const t = await signInA();
    await Promise.all([
      seedItem(t, userA, "link"),
      seedItem(t, userA, "image"),
      seedItem(t, userA, "note"),
    ]);
    const now = Date.now();
    await t.mutation(api.notifications.setPreferences, {
      weeklyShelfEnabled: false,
      nextDigestAt: now - 1,
    });

    await t.mutation(internal.notifications.prepareWeeklyDigest, {
      userId: userA,
      now,
    });

    expect(await t.query(api.notifications.getDigest, {})).toBeNull();
  });
});

describe("weekly shelf archive saves", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const START = Date.UTC(2026, 0, 4, 12);

  async function user() {
    vi.setSystemTime(START - DAY);
    return await signInA();
  }

  async function seedAt(
    t: TestCtx,
    at: number,
    type: "image" | "link" | "note",
  ) {
    vi.setSystemTime(at);
    return await seedItem(t, userA, type);
  }

  async function prepare(t: TestCtx, now: number) {
    vi.setSystemTime(now);
    await t.mutation(api.notifications.setPreferences, {
      weeklyShelfEnabled: true,
      nextDigestAt: now - 1,
    });
    await t.mutation(internal.notifications.prepareWeeklyDigest, {
      userId: userA,
      now,
    });
    return await t.query(api.notifications.getDigest, {});
  }

  it("sends a shelf of older unopened saves when nothing was saved this week", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const t = await user();
      const old = [
        await seedAt(t, START, "link"),
        await seedAt(t, START + DAY, "note"),
        await seedAt(t, START + 2 * DAY, "image"),
      ];
      const opened = await seedAt(t, START + 3 * DAY, "link");
      await t.mutation(api.notifications.markItemOpened, { itemId: opened });

      const digest = await prepare(t, START + 90 * DAY);

      expect(digest?.items.map((item) => item._id).sort()).toEqual(
        [...old].sort(),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps one slot for an older save beside this week's", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const t = await user();
      const old = await seedAt(t, START, "note");
      const now = START + 60 * DAY;
      const recent = [
        await seedAt(t, now - 3 * DAY, "link"),
        await seedAt(t, now - 2 * DAY, "image"),
        await seedAt(t, now - DAY, "note"),
      ];

      const digest = await prepare(t, now);
      const ids = digest?.items.map((item) => item._id) ?? [];

      expect(ids).toHaveLength(3);
      expect(ids).toContain(old);
      expect(ids[2]).toBe(old);
      expect(recent).toEqual(expect.arrayContaining(ids.slice(0, 2)));
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not bring back an archive save shown on a recent shelf", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const t = await user();
      for (let i = 0; i < 4; i++) {
        await seedAt(t, START + i * DAY, "note");
      }

      const first = await prepare(t, START + 60 * DAY);
      const second = await prepare(t, START + 67 * DAY);

      expect(first?.items).toHaveLength(3);
      expect(second?._id).toBe(first?._id);
    } finally {
      vi.useRealTimers();
    }
  });

  it("offers the saves of a shelf that never reached a device again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const t = await user();
      for (let i = 0; i < 3; i++) {
        await seedAt(t, START + i * DAY, "note");
      }

      const first = await prepare(t, START + 60 * DAY);
      const firstId = first?._id;
      if (firstId === undefined) throw new Error("expected a first shelf");
      await t.run((ctx) =>
        ctx.db.patch(firstId, {
          deliveryStatus: "failed",
          deliveryError: "no_devices",
        }),
      );
      const second = await prepare(t, START + 67 * DAY);

      expect(second?._id).not.toBe(firstId);
      expect(second?.items.map((item) => item._id).sort()).toEqual(
        first?.items.map((item) => item._id).sort(),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("tells delivery when the shelf holds older saves", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const t = await user();
      for (let i = 0; i < 3; i++) {
        await seedAt(t, START + i * DAY, "note");
      }
      const now = START + 60 * DAY;
      const digest = await prepare(t, now);
      await t.run(async (ctx) => {
        await ctx.db.insert("notificationDevices", {
          userId: userA,
          token: "live-a",
          enabled: true,
          platform: "ios",
          lastSeenAt: now,
        });
      });

      const claimed = await t.mutation(internal.notificationDelivery.claim, {
        digestId: digest!._id,
      });

      expect(claimed?.olderIncluded).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("weekly shelf selection", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const START = Date.UTC(2026, 0, 4, 12);
  const NOW = START + 120 * DAY;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function user() {
    vi.setSystemTime(START - DAY);
    return await signInA();
  }

  async function seedOld(t: TestCtx, count: number) {
    for (let i = 0; i < count; i++) {
      vi.setSystemTime(START + i * 60_000);
      await seedItem(t, userA, "note");
    }
  }

  async function seedRecent(t: TestCtx, count: number) {
    const types = ["link", "image", "note"] as const;
    const ids: Id<"items">[] = [];
    for (let i = 0; i < count; i++) {
      vi.setSystemTime(NOW - (count - i) * 60_000);
      ids.push(await seedItem(t, userA, types[i % types.length]));
    }
    return ids.reverse();
  }

  async function checkOrder(t: TestCtx) {
    const items = await t.run((ctx) =>
      ctx.db
        .query("items")
        .withIndex("by_user", (q) => q.eq("userId", userA))
        .order("desc")
        .take(1000),
    );
    const { archive } = shelfCandidates(items, new Set(), NOW);
    return archiveCheckOrder(archive, userA, NOW).map((item) => item._id);
  }

  async function markOpened(t: TestCtx, itemIds: Id<"items">[]) {
    await t.run(async (ctx) => {
      for (const itemId of itemIds) {
        await ctx.db.insert("itemReads", {
          userId: userA,
          itemId,
          firstOpenedAt: START,
          lastOpenedAt: START,
        });
      }
    });
  }

  async function poison(t: TestCtx, itemIds: Id<"items">[]) {
    await markOpened(t, itemIds);
    await markOpened(t, itemIds);
  }

  async function prepare(t: TestCtx) {
    vi.setSystemTime(NOW);
    await t.mutation(api.notifications.setPreferences, {
      weeklyShelfEnabled: true,
      nextDigestAt: NOW - 1,
    });
    await t.mutation(internal.notifications.prepareWeeklyDigest, {
      userId: userA,
      now: NOW,
    });
    return await t.query(api.notifications.getDigest, {});
  }

  const shelfIds = (digest: { items: { _id: string }[] } | null) =>
    digest?.items.map((item) => item._id);

  it("keeps two of a full week beside one older save", async () => {
    const t = await user();
    await seedOld(t, 5);
    const recent = await seedRecent(t, 4);
    const order = await checkOrder(t);

    expect(shelfIds(await prepare(t))).toEqual([
      recent[0],
      recent[1],
      order[0],
    ]);
  });

  it("adds one older save to two from this week", async () => {
    const t = await user();
    await seedOld(t, 5);
    const recent = await seedRecent(t, 2);
    const order = await checkOrder(t);

    expect(shelfIds(await prepare(t))).toEqual([...recent, order[0]]);
  });

  it("adds two older saves to one from this week", async () => {
    const t = await user();
    await seedOld(t, 5);
    const recent = await seedRecent(t, 1);
    const order = await checkOrder(t);

    expect(shelfIds(await prepare(t))).toEqual([recent[0], order[0], order[1]]);
  });

  it("fills a shelf from older saves when the week is empty", async () => {
    const t = await user();
    await seedOld(t, 5);
    const order = await checkOrder(t);

    expect(shelfIds(await prepare(t))).toEqual(order.slice(0, 3));
  });

  it("keeps three from this week when every older save is opened", async () => {
    const t = await user();
    await seedOld(t, 4);
    await markOpened(t, await checkOrder(t));
    const recent = await seedRecent(t, 3);

    expect(shelfIds(await prepare(t))).toEqual(recent);
  });

  it("skips opened older saves in check order", async () => {
    const t = await user();
    await seedOld(t, 6);
    const order = await checkOrder(t);
    await markOpened(t, [order[0], order[2]]);

    expect(shelfIds(await prepare(t))).toEqual([order[1], order[3], order[4]]);
  });

  it("creates no shelf from fewer than three saves but still moves the schedule", async () => {
    const t = await user();
    await seedOld(t, 1);
    await seedRecent(t, 1);

    expect(await prepare(t)).toBeNull();
    const preferences = await t.query(api.notifications.getPreferences, {});
    expect(preferences.nextDigestAt).toBeGreaterThan(NOW);
  });

  it("fails a preparation that checks a poisoned save", async () => {
    const t = await user();
    await seedOld(t, 3);
    await poison(t, [(await checkOrder(t))[0]]);

    await expect(prepare(t)).rejects.toThrow();
  });

  it("stops checking older saves once a full week needs only one", async () => {
    const t = await user();
    await seedOld(t, 4);
    const order = await checkOrder(t);
    await poison(t, order.slice(1));
    const recent = await seedRecent(t, 3);

    expect(shelfIds(await prepare(t))).toEqual([
      recent[0],
      recent[1],
      order[0],
    ]);
  });

  it("stops checking older saves once the shelf is full", async () => {
    const t = await user();
    await seedOld(t, 6);
    const order = await checkOrder(t);
    await poison(t, order.slice(3));

    expect(shelfIds(await prepare(t))).toEqual(order.slice(0, 3));
  });

  it("checks at most fifty older saves", async () => {
    const t = await user();
    await seedOld(t, 53);
    const order = await checkOrder(t);
    expect(order).toHaveLength(50);
    await markOpened(t, order);
    const unchecked = (
      await t.run((ctx) =>
        ctx.db
          .query("items")
          .withIndex("by_user", (q) => q.eq("userId", userA))
          .collect(),
      )
    )
      .map((item) => item._id)
      .filter((id) => !order.includes(id));
    expect(unchecked).toHaveLength(3);
    await poison(t, unchecked);

    expect(await prepare(t)).toBeNull();
  }, 20_000);

  it("tells delivery a this-week shelf holds no older saves", async () => {
    const t = await user();
    await seedRecent(t, 3);
    const digest = await prepare(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("notificationDevices", {
        userId: userA,
        token: "live-a",
        enabled: true,
        platform: "ios",
        lastSeenAt: NOW,
      });
    });

    const claimed = await t.mutation(internal.notificationDelivery.claim, {
      digestId: digest!._id,
    });

    expect(claimed?.olderIncluded).toBe(false);
  });
});
