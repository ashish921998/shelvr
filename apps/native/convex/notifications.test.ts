// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it, vi } from "vitest";
import type { TestConvexForDataModel } from "convex-test";
import { api, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { nextWeeklyDigestAt } from "./model/notificationSchedule";
import { DUE_DIGEST_BATCH_SIZE } from "./notifications";
import { newConvexTest } from "./test.setup";

type TestCtx = TestConvexForDataModel<DataModel>;

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
  it.each([NaN, Infinity, -Infinity, -1e100, Number.MAX_SAFE_INTEGER, 1.5])(
    "rejects invalid nextDigestAt %s without changing preferences",
    async (nextDigestAt) => {
      const t = newConvexTest().withIdentity({ subject: "user-a|session-1" });
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
    const owner = t.withIdentity({ subject: "user-a|session-1" });
    const other = t.withIdentity({ subject: "user-b|session-2" });
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
    ).toMatchObject({ userId: "user-b", enabled: true });
  });

  it("refuses to re-bind another account's enabled token and leaves the row untouched", async () => {
    const t = newConvexTest();
    const owner = t.withIdentity({ subject: "user-a|session-1" });
    const attacker = t.withIdentity({ subject: "user-b|session-2" });
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
    ).rejects.toThrow("registered to another account");
    expect(
      await t.run((ctx) => ctx.db.query("notificationDevices").unique()),
    ).toEqual(before);
    // The rejected caller gets no preference row either: nothing was written.
    expect(
      await t.run((ctx) => ctx.db.query("notificationPreferences").collect()),
    ).toHaveLength(1);
  });

  it("lets the owner refresh their own enabled token", async () => {
    const t = newConvexTest().withIdentity({ subject: "user-a|session-1" });
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
      userId: "user-a",
      platform: "android",
      enabled: true,
    });
  });

  it("supports an account switch on one device after the first account signs out", async () => {
    const t = newConvexTest();
    const first = t.withIdentity({ subject: "user-a|session-1" });
    const second = t.withIdentity({ subject: "user-b|session-2" });
    await first.mutation(api.notifications.registerDevice, {
      token: "token-a",
      platform: "ios",
    });
    // The client revokes every stored token before it ends the auth session.
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
    expect(devices[0]).toMatchObject({ userId: "user-b", enabled: true });
    // Switching back works the same way.
    await second.mutation(api.notifications.unregisterDevice, {
      token: "token-a",
    });
    await first.mutation(api.notifications.registerDevice, {
      token: "token-a",
      platform: "ios",
    });
    expect(
      await t.run((ctx) => ctx.db.query("notificationDevices").unique()),
    ).toMatchObject({ userId: "user-a", enabled: true });
  });

  it("rejects an unknown timezone at registration without writing anything", async () => {
    const t = newConvexTest().withIdentity({ subject: "user-a|session-1" });
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
    const t = newConvexTest().withIdentity({ subject: "user-a|session-1" });
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
    const t = newConvexTest().withIdentity({ subject: "user-a|session-1" });
    const now = Date.now();
    await t.run((ctx) =>
      ctx.db.insert("notificationPreferences", {
        userId: "user-a",
        weeklyShelfEnabled: true,
        nextDigestAt: now - 1,
        timezone: "Mars/Olympus_Mons",
        updatedAt: now,
      }),
    );
    await expect(
      t.mutation(internal.notifications.prepareWeeklyDigest, {
        userId: "user-a",
        now,
      }),
    ).resolves.toBeNull();
    const rescheduled = await t.run((ctx) =>
      ctx.db.query("notificationPreferences").unique(),
    );
    expect(rescheduled?.nextDigestAt).toBeGreaterThan(now);
    expect(rescheduled?.nextDigestAt).toBe(nextWeeklyDigestAt(now, "UTC"));
    // The next preference save replaces the bad zone rather than writing it back.
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
      const names = scheduled.map((job) => job.name);
      expect(
        names.filter((name) => name.endsWith("prepareWeeklyDigest")),
      ).toHaveLength(DUE_DIGEST_BATCH_SIZE);
      // The first batch was full, so the mutation re-scheduled itself with a cursor.
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
    const t = newConvexTest().withIdentity({ subject: "user-a|session-1" });
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
    const t = newConvexTest().withIdentity({ subject: "user-a|session-1" });
    await t.run((ctx) =>
      ctx.db.insert("notificationPreferences", {
        userId: "user-a",
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
    const t = newConvexTest().withIdentity({ subject: "user-a|session-1" });
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
      const t = newConvexTest().withIdentity({ subject: "user-a|session-1" });
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

  it("excludes opened candidates even after more than 1000 historical reads", async () => {
    const t = newConvexTest().withIdentity({ subject: "user-a|session-1" });
    const now = Date.now();
    await t.run(async (ctx) => {
      for (let i = 0; i < 1003; i++) {
        const itemId = await ctx.db.insert("items", {
          userId: "user-a",
          type: "note",
          status: "ready",
          title: `Opened save ${i}`,
          tags: [],
          searchText: "opened save",
        });
        await ctx.db.insert("itemReads", {
          userId: "user-a",
          itemId,
          firstOpenedAt: now,
          lastOpenedAt: now,
        });
      }
    });
    await t.mutation(api.notifications.setPreferences, {
      weeklyShelfEnabled: true,
      nextDigestAt: now - 1,
    });
    await t.mutation(internal.notifications.prepareWeeklyDigest, {
      userId: "user-a",
      now,
    });
    expect(await t.query(api.notifications.getDigest, {})).toBeNull();

    const unopenedIds = await Promise.all([
      seedItem(t, "user-a", "note"),
      seedItem(t, "user-a", "note"),
      seedItem(t, "user-a", "note"),
    ]);
    await t.mutation(api.notifications.setPreferences, {
      weeklyShelfEnabled: true,
      nextDigestAt: now - 1,
    });

    await t.mutation(internal.notifications.prepareWeeklyDigest, {
      userId: "user-a",
      now,
    });

    const digest = await t.query(api.notifications.getDigest, {});
    expect(digest?.items.map((item) => item._id).sort()).toEqual(
      unopenedIds.sort(),
    );
  });

  it("starts disabled until the user opts in", async () => {
    const t = newConvexTest().withIdentity({ subject: "user-a|session-1" });

    expect(await t.query(api.notifications.getPreferences, {})).toMatchObject({
      weeklyShelfEnabled: false,
      nextDigestAt: null,
    });
  });

  it("tracks opened saves and creates a three-item digest", async () => {
    const t = newConvexTest().withIdentity({ subject: "user-a|session-1" });
    const itemIds = await Promise.all([
      seedItem(t, "user-a", "link"),
      seedItem(t, "user-a", "image"),
      seedItem(t, "user-a", "note"),
      seedItem(t, "user-a", "link"),
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
      userId: "user-a",
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
    const t = newConvexTest().withIdentity({ subject: "user-a|session-1" });
    await Promise.all([
      seedItem(t, "user-a", "link"),
      seedItem(t, "user-a", "image"),
      seedItem(t, "user-a", "note"),
    ]);
    const now = Date.now();
    await t.mutation(api.notifications.setPreferences, {
      weeklyShelfEnabled: false,
      nextDigestAt: now - 1,
    });

    await t.mutation(internal.notifications.prepareWeeklyDigest, {
      userId: "user-a",
      now,
    });

    expect(await t.query(api.notifications.getDigest, {})).toBeNull();
  });
});
