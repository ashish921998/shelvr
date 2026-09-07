// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
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
