// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it, vi } from "vitest";
import type { TestConvexForDataModel } from "convex-test";
import { api, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
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
