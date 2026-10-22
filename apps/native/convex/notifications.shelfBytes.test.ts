// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { SHELF_SIZE } from "./model/weeklyShelf";
import { newConvexTest, signedInUser } from "./test.setup";

// convex-test does not enforce Convex's per-transaction read limit, so a small budget stands in for it.
vi.mock("./model/weeklyShelf", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./model/weeklyShelf")>()),
  SHELF_SCAN_BYTES: 50_000,
}));

it("stops reading saves once the scan reaches its byte budget", async () => {
  const { t, userId } = await signedInUser(newConvexTest());
  const now = Date.now();
  await t.run(async (ctx) => {
    for (let i = 0; i < 3; i++) {
      await ctx.db.insert("items", {
        userId,
        type: "note",
        status: "ready",
        title: `Small ${i}`,
        tags: [],
        searchText: "small",
      });
    }
    const big = await ctx.db.insert("items", {
      userId,
      type: "link",
      url: "https://example.com/long-read",
      status: "ready",
      title: "Long read",
      content: "word ".repeat(12_000),
      tags: [],
      searchText: "long",
    });
    await ctx.db.insert("itemReads", {
      userId,
      itemId: big,
      firstOpenedAt: now,
      lastOpenedAt: now,
    });
  });
  await t.mutation(api.notifications.setPreferences, {
    weeklyShelfEnabled: true,
    nextDigestAt: now - 1,
  });

  await t.mutation(internal.notifications.prepareWeeklyDigest, { userId, now });

  // The long read alone spends the budget, so the older saves are never read into a shelf.
  expect(await t.query(api.notifications.getDigest, {})).toBeNull();
  const preferences = await t.run((ctx) =>
    ctx.db
      .query("notificationPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique(),
  );
  expect(preferences?.nextDigestAt).toBeGreaterThan(now);
});

it("spends the budget only on ready saves, so failed or processing ones can't crowd them out", async () => {
  const { t, userId } = await signedInUser(newConvexTest());
  const now = Date.now();
  const ready = await t.run(async (ctx) => {
    const ids = [];
    for (let i = 0; i < SHELF_SIZE; i++) {
      ids.push(
        await ctx.db.insert("items", {
          userId,
          type: "note",
          status: "ready",
          title: `Worth a look ${i}`,
          tags: [],
          searchText: "worth",
        }),
      );
    }
    for (const status of ["failed", "processing"] as const) {
      await ctx.db.insert("items", {
        userId,
        type: "link",
        url: `https://example.com/${status}`,
        status,
        content: "word ".repeat(12_000),
        tags: [],
        searchText: status,
      });
    }
    return ids;
  });
  await t.mutation(api.notifications.setPreferences, {
    weeklyShelfEnabled: true,
    nextDigestAt: now - 1,
  });

  await t.mutation(internal.notifications.prepareWeeklyDigest, { userId, now });

  const digest = await t.query(api.notifications.getDigest, {});
  expect(digest?.items.map((item) => item._id).sort()).toEqual(
    [...ready].sort(),
  );
});
