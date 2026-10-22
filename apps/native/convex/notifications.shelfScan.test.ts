// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { expect, it, vi } from "vitest";
import type { TestConvexForDataModel } from "convex-test";
import { api, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { SHELF_SCAN_ITEMS, SHELF_SIZE } from "./model/weeklyShelf";
import { newConvexTest, signedInUser } from "./test.setup";

type TestCtx = TestConvexForDataModel<DataModel>;

// convex-test scans the whole database for every indexed read and the shelf
// reads once per candidate, so the real scan window costs seconds.
vi.mock("./model/weeklyShelf", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./model/weeklyShelf")>()),
  SHELF_SCAN_ITEMS: 100,
}));

async function saveNotes(
  t: TestCtx,
  userId: Id<"users">,
  count: number,
  { opened }: { opened: boolean },
): Promise<Id<"items">[]> {
  return await t.run(async (ctx) => {
    const itemIds: Id<"items">[] = [];
    for (let i = 0; i < count; i++) {
      const itemId = await ctx.db.insert("items", {
        userId,
        type: "note",
        status: "ready",
        title: `Save ${i}`,
        tags: [],
        searchText: "save",
      });
      if (opened) {
        await ctx.db.insert("itemReads", {
          userId,
          itemId,
          firstOpenedAt: Date.now(),
          lastOpenedAt: Date.now(),
        });
      }
      itemIds.push(itemId);
    }
    return itemIds;
  });
}

it("excludes opened candidates when reads outnumber the scan window, and never reaches saves past it", async () => {
  const { t, userId } = await signedInUser(newConvexTest());
  const now = Date.now();
  const prepare = async () => {
    await t.mutation(api.notifications.setPreferences, {
      weeklyShelfEnabled: true,
      nextDigestAt: now - 1,
    });
    await t.mutation(internal.notifications.prepareWeeklyDigest, {
      userId,
      now,
    });
    return await t.query(api.notifications.getDigest, {});
  };

  await saveNotes(t, userId, SHELF_SIZE, { opened: false });
  await saveNotes(t, userId, SHELF_SCAN_ITEMS + SHELF_SIZE, { opened: true });
  expect(await prepare()).toBeNull();

  const unopened = await saveNotes(t, userId, SHELF_SIZE, { opened: false });
  const digest = await prepare();
  expect(digest?.items.map((item) => item._id).sort()).toEqual(unopened.sort());
});
