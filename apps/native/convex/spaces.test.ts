// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import type { TestConvexForDataModel } from "convex-test";
import { newConvexTest } from "./test.setup";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "@convex/_generated/api";
import type { DataModel, Doc, Id } from "@convex/_generated/dataModel";

type TestCtx = TestConvexForDataModel<DataModel>;

// convex-test runs `runAfter(0, ...)` jobs via a real `setTimeout`, so the AI
// action would fire during worker teardown. Fake timers keep the jobs queued:
// `_scheduled_functions` rows are still written and assertable, but nothing
// executes. Leave Date and other clocks real.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

async function entitledUser(userId: string): Promise<TestCtx> {
  const t = newConvexTest().withIdentity({
    subject: `${userId}|session-1`,
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("subscriptions", {
      userId,
      status: "pro",
      expiresAt: Date.now() + 60_000,
      updatedAt: Date.now(),
    });
  });
  return t;
}

/** A user with no subscription row at all: the not-entitled path. */
function freeUser(userId: string): TestCtx {
  return newConvexTest().withIdentity({ subject: `${userId}|session-1` });
}

/** Insert a ready note item; `heroImageUrl` gives it a cover for previews. */
async function seedItem(
  t: TestCtx,
  userId: string,
  label: string,
  withImage = true,
): Promise<Id<"items">> {
  return await t.run((ctx) =>
    ctx.db.insert("items", {
      userId,
      type: "link",
      status: "ready",
      title: label,
      url: `https://example.com/${label}`,
      heroImageUrl: withImage ? `https://img.example.com/${label}.jpg` : undefined,
      tags: [],
      searchText: label,
    }),
  );
}

async function readSpace(t: TestCtx, spaceId: Id<"spaces">): Promise<Doc<"spaces">> {
  const space = await t.run((ctx) => ctx.db.get(spaceId));
  if (space === null) throw new Error("Space not found");
  return space;
}

async function steeringJobs(t: TestCtx) {
  const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  return jobs.filter((job) => job.name === "ai:steerItemForSpace");
}

describe("space creation", () => {
  it("is idempotent by trimmed name for onboarding retries", async () => {
    const t = await entitledUser("user-a");

    const first = await t.mutation(api.spaces.createSpace, {
      name: "  Read later  ",
    });
    const second = await t.mutation(api.spaces.createSpace, {
      name: "Read later",
    });

    expect(second).toBe(first);

    await t.run(async (ctx) => {
      const subscription = await ctx.db
        .query("subscriptions")
        .withIndex("by_user", (q) => q.eq("userId", "user-a"))
        .unique();
      if (subscription === null) throw new Error("Subscription not found");
      await ctx.db.patch(subscription._id, {
        status: "lapsed",
        expiresAt: Date.now() - 1,
      });
    });

    await expect(
      t.mutation(api.spaces.createSpace, { name: "A new space" }),
    ).rejects.toThrow("Pro required");

    const retriedAfterLapse = await t.mutation(api.spaces.createSpace, {
      name: " Read later ",
    });
    expect(retriedAfterLapse).toBe(first);

    const spaces = await t.run(async (ctx) =>
      await ctx.db
        .query("spaces")
        .withIndex("by_user", (q) => q.eq("userId", "user-a"))
        .collect(),
    );
    expect(spaces).toHaveLength(1);
  });
});

describe("filing corrections", () => {
  it("undoes acceptance back to a suggestion without dismissing it", async () => {
    const t = await entitledUser("user-a");
    const ids = await t.run(async (ctx) => {
      const spaceId = await ctx.db.insert("spaces", { userId: "user-a", name: "Recipes" });
      const itemId = await ctx.db.insert("items", { userId: "user-a", type: "note", status: "ready", tags: [], searchText: "Pasta" });
      await ctx.db.insert("spaceItems", { itemId, spaceId, userId: "user-a", status: "suggested" });
      return { itemId, spaceId };
    });
    await t.mutation(api.spaces.acceptSuggestion, ids);
    await t.mutation(internal.spaces.setMembershipIntentsInternal, {
      ...ids, intents: [{ kind: "web_search", label: "Find recipes", value: "pasta recipes" }],
    });
    expect(await t.mutation(api.spaces.undoAcceptSuggestion, ids)).toBe(true);
    expect(await t.mutation(api.spaces.undoAcceptSuggestion, ids)).toBe(false);
    const space = await t.query(api.spaces.getSpace, { id: ids.spaceId });
    expect(space?.items).toHaveLength(0);
    expect(space?.suggestions.map((item) => item._id)).toEqual([ids.itemId]);
    expect(await t.mutation(api.spaces.acceptSuggestion, ids)).toBe(true);
    const restored = await t.query(api.spaces.getSpace, { id: ids.spaceId });
    expect(restored?.items[0].spaceIntents).toBeUndefined();
  });

  it("keeps a removal through both AI passes and lets an explicit undo restore membership", async () => {
    const t = await entitledUser("user-a");
    const ids = await t.run(async (ctx) => {
      const spaceId = await ctx.db.insert("spaces", { userId: "user-a", name: "Recipes", dynamic: true });
      const itemId = await ctx.db.insert("items", { userId: "user-a", type: "note", status: "ready", note: "Pasta", tags: [], searchText: "Pasta" });
      await ctx.db.insert("spaceItems", { ...{ itemId, spaceId }, userId: "user-a" });
      return { itemId, spaceId };
    });
    await t.mutation(api.spaces.removeItemFromSpace, ids);
    await t.mutation(api.spaces.removeItemFromSpace, ids);
    await t.mutation(internal.items.setSpacesForItem, { itemId: ids.itemId, spaceIds: [ids.spaceId] });
    await t.mutation(internal.items.suggestItemsForSpace, { spaceId: ids.spaceId, itemIds: [ids.itemId] });
    const removed = await t.query(api.spaces.getSpace, { id: ids.spaceId });
    expect(removed?.items).toHaveLength(0);
    expect(removed?.suggestions).toHaveLength(0);

    await t.mutation(api.spaces.addItemToSpace, ids);
    await t.mutation(internal.items.setSpacesForItem, { itemId: ids.itemId, spaceIds: [] });
    const restored = await t.query(api.spaces.getSpace, { id: ids.spaceId });
    expect(restored?.items.map((item) => item._id)).toEqual([ids.itemId]);
    expect(restored?.suggestions).toHaveLength(0);
    const rows = await t.run((ctx) => ctx.db.query("spaceItems").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("saved");
  });

  it("rejects corrections against another user's item or space", async () => {
    const t = await entitledUser("user-a");
    const ids = await t.run(async (ctx) => ({
      itemId: await ctx.db.insert("items", { userId: "user-b", type: "note", status: "ready", tags: [], searchText: "" }),
      spaceId: await ctx.db.insert("spaces", { userId: "user-b", name: "Private" }),
    }));
    await expect(t.mutation(api.spaces.removeItemFromSpace, ids)).rejects.toThrow("Item not found");
    await expect(t.mutation(api.spaces.addItemToSpace, ids)).rejects.toThrow("Item not found");
    await expect(t.mutation(api.spaces.undoAcceptSuggestion, ids)).rejects.toThrow("Item not found");
  });
});

describe("denormalized space summary", () => {
  it("counts and previews follow add, accept, remove, item delete", async () => {
    const t = await entitledUser("user-a");
    const spaceId = await t.mutation(api.spaces.createSpace, { name: "Recipes" });
    const born = await readSpace(t, spaceId);
    expect(born).toMatchObject({
      savedCount: 0, suggestedCount: 0, previewItemIds: [], suggestedPreviewItemIds: [],
    });

    const a = await seedItem(t, "user-a", "a");
    const b = await seedItem(t, "user-a", "b");
    const c = await seedItem(t, "user-a", "c");
    const d = await seedItem(t, "user-a", "d");
    for (const itemId of [a, b, c, d]) {
      await t.mutation(api.spaces.addItemToSpace, { itemId, spaceId });
    }
    // Most recently added first, capped at three; the fourth stays counted.
    expect(await readSpace(t, spaceId)).toMatchObject({
      savedCount: 4, suggestedCount: 0, previewItemIds: [d, c, b],
    });

    // A suggestion is counted in its own bucket and previewed separately.
    const s = await seedItem(t, "user-a", "s");
    await t.mutation(internal.items.suggestItemsForSpace, { spaceId, itemIds: [s] });
    expect(await readSpace(t, spaceId)).toMatchObject({
      savedCount: 4, suggestedCount: 1, previewItemIds: [d, c, b], suggestedPreviewItemIds: [s],
    });

    // Accepting moves it across buckets and to the front of the saved covers.
    expect(await t.mutation(api.spaces.acceptSuggestion, { itemId: s, spaceId })).toBe(true);
    expect(await readSpace(t, spaceId)).toMatchObject({
      savedCount: 5, suggestedCount: 0, previewItemIds: [s, d, c], suggestedPreviewItemIds: [],
    });

    // Removing a cover item refills the list from the remaining members.
    await t.mutation(api.spaces.removeItemFromSpace, { itemId: s, spaceId });
    expect(await readSpace(t, spaceId)).toMatchObject({
      savedCount: 4, suggestedCount: 0, previewItemIds: [d, c, b],
    });
    // Removing a non-cover item only touches the count.
    await t.mutation(api.spaces.removeItemFromSpace, { itemId: a, spaceId });
    expect(await readSpace(t, spaceId)).toMatchObject({ savedCount: 3, previewItemIds: [d, c, b] });
    // A second remove is a no-op (already dismissed).
    await t.mutation(api.spaces.removeItemFromSpace, { itemId: a, spaceId });
    expect(await readSpace(t, spaceId)).toMatchObject({ savedCount: 3 });

    // Deleting an item drops it from every space it was in.
    const other = await t.mutation(api.spaces.createSpace, { name: "Other" });
    await t.mutation(api.spaces.addItemToSpace, { itemId: d, spaceId: other });
    await t.mutation(api.items.deleteItem, { id: d });
    expect(await readSpace(t, spaceId)).toMatchObject({ savedCount: 2, previewItemIds: [c, b] });
    expect(await readSpace(t, other)).toMatchObject({ savedCount: 0, previewItemIds: [] });
    const joins = await t.run((ctx) =>
      ctx.db.query("spaceItems").withIndex("by_item", (q) => q.eq("itemId", d)).collect(),
    );
    expect(joins).toHaveLength(0);
  });

  it("undo and dismiss move rows between buckets; setSpacesForItem withdraws suggestions", async () => {
    const t = await entitledUser("user-a");
    const spaceId = await t.mutation(api.spaces.createSpace, { name: "Recipes", dynamic: true });
    const x = await seedItem(t, "user-a", "x");
    const y = await seedItem(t, "user-a", "y");
    await t.mutation(internal.items.setSpacesForItem, { itemId: x, spaceIds: [spaceId] });
    await t.mutation(internal.items.setSpacesForItem, { itemId: y, spaceIds: [spaceId] });
    expect(await readSpace(t, spaceId)).toMatchObject({
      suggestedCount: 2, suggestedPreviewItemIds: [y, x],
    });
    await t.mutation(api.spaces.acceptSuggestion, { itemId: x, spaceId });
    await t.mutation(api.spaces.undoAcceptSuggestion, { itemId: x, spaceId });
    expect(await readSpace(t, spaceId)).toMatchObject({
      savedCount: 0, suggestedCount: 2, previewItemIds: [], suggestedPreviewItemIds: [x, y],
    });
    expect(await t.mutation(api.spaces.dismissSuggestion, { itemId: x, spaceId })).toBe(true);
    expect(await readSpace(t, spaceId)).toMatchObject({
      suggestedCount: 1, suggestedPreviewItemIds: [y],
    });
    // The classifier withdrawing its suggestion deletes the row and the count.
    await t.mutation(internal.items.setSpacesForItem, { itemId: y, spaceIds: [] });
    expect(await readSpace(t, spaceId)).toMatchObject({
      suggestedCount: 0, suggestedPreviewItemIds: [],
    });
    expect(await t.mutation(api.spaces.acceptAllSuggestions, { spaceId })).toBe(0);
  });

  it("acceptAllSuggestions flips every row and counts them as saved", async () => {
    const t = await entitledUser("user-a");
    const spaceId = await t.mutation(api.spaces.createSpace, { name: "Recipes" });
    const ids: Id<"items">[] = [];
    for (const label of ["p", "q", "r", "s"]) {
      ids.push(await seedItem(t, "user-a", label));
    }
    await t.mutation(internal.items.suggestItemsForSpace, { spaceId, itemIds: ids });
    expect(await t.mutation(api.spaces.acceptAllSuggestions, { spaceId })).toBe(4);
    const space = await readSpace(t, spaceId);
    expect(space).toMatchObject({ savedCount: 4, suggestedCount: 0, suggestedPreviewItemIds: [] });
    expect(space.previewItemIds).toHaveLength(3);
    expect(await steeringJobs(t)).toHaveLength(4);
  });

  it("deleting a space removes its joins and the row", async () => {
    const t = await entitledUser("user-a");
    const spaceId = await t.mutation(api.spaces.createSpace, { name: "Recipes" });
    const keep = await t.mutation(api.spaces.createSpace, { name: "Keep" });
    const a = await seedItem(t, "user-a", "a");
    const b = await seedItem(t, "user-a", "b");
    await t.mutation(api.spaces.addItemToSpace, { itemId: a, spaceId });
    await t.mutation(api.spaces.addItemToSpace, { itemId: b, spaceId });
    await t.mutation(api.spaces.addItemToSpace, { itemId: a, spaceId: keep });
    await t.mutation(api.spaces.deleteSpace, { id: spaceId });
    expect(await t.run((ctx) => ctx.db.get(spaceId))).toBeNull();
    const joins = await t.run((ctx) => ctx.db.query("spaceItems").collect());
    expect(joins.map((j) => j.spaceId)).toEqual([keep]);
    expect(await readSpace(t, keep)).toMatchObject({ savedCount: 1, previewItemIds: [a] });
    // Items themselves survive a space delete.
    expect(await t.run((ctx) => ctx.db.get(b))).not.toBeNull();
  });

  it("listSpaces reads counts and covers from the space row, not the joins", async () => {
    const t = await entitledUser("user-a");
    const spaceId = await t.mutation(api.spaces.createSpace, { name: "Recipes" });
    const withImage = await seedItem(t, "user-a", "img");
    const noImage = await seedItem(t, "user-a", "note", false);
    await t.mutation(api.spaces.addItemToSpace, { itemId: withImage, spaceId });
    await t.mutation(api.spaces.addItemToSpace, { itemId: noImage, spaceId });

    let [listed] = await t.query(api.spaces.listSpaces, {});
    expect(listed.itemCount).toBe(2);
    expect(listed.suggestionCount).toBe(0);
    // The newest member has no imagery and is skipped; the older one covers.
    expect(listed.previews).toEqual([
      { url: "https://img.example.com/img.jpg", type: "link", suggested: false },
    ]);

    // Forge the summary: if the query walked spaceItems it would report 2/0
    // and a saved cover. It must report exactly what the row says.
    await t.run((ctx) =>
      ctx.db.patch(spaceId, {
        savedCount: 7, suggestedCount: 3, previewItemIds: [], suggestedPreviewItemIds: [withImage],
      }),
    );
    [listed] = await t.query(api.spaces.listSpaces, {});
    expect(listed.itemCount).toBe(7);
    expect(listed.suggestionCount).toBe(3);
    expect(listed.previews).toEqual([
      { url: "https://img.example.com/img.jpg", type: "link", suggested: true },
    ]);
  });

  it("lists legacy rows without a summary from a bounded fallback, and backfills them", async () => {
    const t = await entitledUser("user-a");
    // Written the old way: no summary fields at all.
    const legacy = await t.run((ctx) =>
      ctx.db.insert("spaces", { userId: "user-a", name: "Legacy" }),
    );
    const a = await seedItem(t, "user-a", "a");
    const b = await seedItem(t, "user-a", "b");
    const s = await seedItem(t, "user-a", "s");
    await t.run(async (ctx) => {
      // A legacy status-less row reads as saved.
      await ctx.db.insert("spaceItems", { userId: "user-a", spaceId: legacy, itemId: a });
      await ctx.db.insert("spaceItems", { userId: "user-a", spaceId: legacy, itemId: b, status: "saved" });
      await ctx.db.insert("spaceItems", { userId: "user-a", spaceId: legacy, itemId: s, status: "suggested" });
    });
    expect(await readSpace(t, legacy)).not.toHaveProperty("savedCount");

    const [listed] = await t.query(api.spaces.listSpaces, {});
    expect(listed.itemCount).toBe(2);
    expect(listed.suggestionCount).toBe(1);
    expect(listed.previews.map((p) => p.url)).toEqual([
      "https://img.example.com/b.jpg", "https://img.example.com/a.jpg", "https://img.example.com/s.jpg",
    ]);
    // A query never writes: the row is still legacy.
    expect(await readSpace(t, legacy)).not.toHaveProperty("savedCount");

    // A second legacy space, empty, so the backfill needs two batches of one.
    const empty = await t.run((ctx) =>
      ctx.db.insert("spaces", { userId: "user-a", name: "Empty legacy" }),
    );
    const result = await t.mutation(internal.spaces.backfillSpaceCounters, { batchSize: 1 });
    expect(result).toMatchObject({ processed: 1, updated: 1, skipped: [], done: false });
    expect(result.cursor).not.toBeNull();
    // Ordering inside the backfill follows join creation, newest first.
    expect(await readSpace(t, legacy)).toMatchObject({
      savedCount: 2, suggestedCount: 1, previewItemIds: [b, a], suggestedPreviewItemIds: [s],
    });
    expect(await readSpace(t, empty)).not.toHaveProperty("savedCount");
    // The continuation was scheduled with the cursor; driving it by hand
    // reaches the end and a second pass over a filled row changes nothing.
    const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(jobs.filter((job) => job.name === "spaces:backfillSpaceCounters")).toHaveLength(1);
    const next = await t.mutation(internal.spaces.backfillSpaceCounters, {
      cursor: result.cursor, batchSize: 1,
    });
    expect(next).toMatchObject({ processed: 1, updated: 1, done: true, cursor: null });
    expect(await readSpace(t, empty)).toMatchObject({
      savedCount: 0, suggestedCount: 0, previewItemIds: [], suggestedPreviewItemIds: [],
    });
    const again = await t.mutation(internal.spaces.backfillSpaceCounters, {});
    expect(again).toMatchObject({ processed: 2, updated: 0, done: true });
  });

  it("refills saved previews from the saved bucket even under a pile of newer dismissed rows", async () => {
    const t = await entitledUser("user-a");
    const spaceId = await t.mutation(api.spaces.createSpace, { name: "Recipes" });
    const a = await seedItem(t, "user-a", "a");
    const b = await seedItem(t, "user-a", "b");
    const c = await seedItem(t, "user-a", "c");
    const d = await seedItem(t, "user-a", "d");
    for (const itemId of [a, b, c, d]) {
      await t.mutation(api.spaces.addItemToSpace, { itemId, spaceId });
    }
    // Sixty dismissals, all newer than the saved joins. Dismissed rows are not
    // counted, so writing them directly leaves the summary truthful.
    await t.run(async (ctx) => {
      for (let i = 0; i < 60; i++) {
        const itemId = await ctx.db.insert("items", {
          userId: "user-a", type: "note", status: "ready", tags: [], searchText: `d${i}`,
        });
        await ctx.db.insert("spaceItems", {
          userId: "user-a", spaceId, itemId, status: "dismissed",
        });
      }
    });
    expect(await readSpace(t, spaceId)).toMatchObject({
      savedCount: 4, previewItemIds: [d, c, b],
    });

    // Removing a cover leaves two covers for three saved rows, which forces a
    // refill. It must find the saved rows behind sixty newer dismissed ones.
    await t.mutation(api.spaces.removeItemFromSpace, { itemId: d, spaceId });
    expect(await readSpace(t, spaceId)).toMatchObject({
      savedCount: 3, previewItemIds: [c, b, a],
    });
  });

  it("refills the saved bucket from legacy status-less rows too", async () => {
    const t = await entitledUser("user-a");
    const spaceId = await t.mutation(api.spaces.createSpace, { name: "Recipes" });
    const legacy = await seedItem(t, "user-a", "legacy");
    await t.run((ctx) =>
      ctx.db.insert("spaceItems", { userId: "user-a", spaceId, itemId: legacy }),
    );
    // The direct insert bypassed the summary; heal the count by hand so the
    // refill condition (count > list length) holds.
    await t.run((ctx) => ctx.db.patch(spaceId, { savedCount: 1 }));
    const a = await seedItem(t, "user-a", "a");
    const b = await seedItem(t, "user-a", "b");
    const c = await seedItem(t, "user-a", "c");
    for (const itemId of [a, b, c]) {
      await t.mutation(api.spaces.addItemToSpace, { itemId, spaceId });
    }
    expect(await readSpace(t, spaceId)).toMatchObject({
      savedCount: 4, previewItemIds: [c, b, a],
    });
    await t.mutation(api.spaces.removeItemFromSpace, { itemId: c, spaceId });
    expect(await readSpace(t, spaceId)).toMatchObject({
      savedCount: 3, previewItemIds: [b, a, legacy],
    });
  });

  it("backfill stops a batch when its read budget is spent and resumes at the next space", async () => {
    const t = await entitledUser("user-a");
    const spaces: Id<"spaces">[] = [];
    for (const name of ["one", "two", "three"]) {
      const spaceId = await t.run((ctx) =>
        ctx.db.insert("spaces", { userId: "user-a", name }),
      );
      spaces.push(spaceId);
      await t.run(async (ctx) => {
        for (let i = 0; i < 5; i++) {
          const itemId = await ctx.db.insert("items", {
            userId: "user-a", type: "note", status: "ready", tags: [], searchText: `${name}${i}`,
          });
          await ctx.db.insert("spaceItems", {
            userId: "user-a", spaceId, itemId, status: "saved",
          });
        }
      });
    }
    const withSummary = async () => {
      const rows = await Promise.all(spaces.map((id) => readSpace(t, id)));
      return rows.filter((row) => row.savedCount !== undefined).map((row) => row._id);
    };

    // Budget 8: the first space reads 5 rows (the first scan always gets the
    // full per-space ceiling), leaving 3, so the second space can only be
    // scanned to a 2-row limit and comes back incomplete. That is a budget
    // stop, not an oversize space: nothing is skipped and the cursor points at
    // the first space so the second is retried with a full budget.
    const first = await t.mutation(internal.spaces.backfillSpaceCounters, {
      readBudget: 8,
    });
    expect(first).toMatchObject({ processed: 1, updated: 1, skipped: [], done: false });
    expect(first.cursor).not.toBeNull();
    expect(await withSummary()).toEqual([first.cursor]);
    const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    const continuation = jobs.filter((job) => job.name === "spaces:backfillSpaceCounters");
    expect(continuation).toHaveLength(1);
    expect(continuation[0].args[0]).toMatchObject({ cursor: first.cursor, readBudget: 8 });

    const second = await t.mutation(internal.spaces.backfillSpaceCounters, {
      cursor: first.cursor, readBudget: 8,
    });
    expect(second).toMatchObject({ processed: 1, updated: 1, done: false });
    expect(second.cursor).not.toBe(first.cursor);
    expect(await withSummary()).toHaveLength(2);
    const third = await t.mutation(internal.spaces.backfillSpaceCounters, {
      cursor: second.cursor, readBudget: 8,
    });
    expect(third).toMatchObject({ processed: 1, updated: 1, done: true, cursor: null });
    for (const spaceId of spaces) {
      expect(await readSpace(t, spaceId)).toMatchObject({ savedCount: 5, suggestedCount: 0 });
      expect((await readSpace(t, spaceId)).previewItemIds).toHaveLength(3);
    }

    // With the default budget the three small spaces fit one transaction, and
    // `force` recomputes rows that already carry a summary.
    await t.run((ctx) => ctx.db.patch(spaces[0], { savedCount: 99 }));
    const forced = await t.mutation(internal.spaces.backfillSpaceCounters, { force: true });
    expect(forced).toMatchObject({ processed: 3, updated: 3, done: true });
    expect(await readSpace(t, spaces[0])).toMatchObject({ savedCount: 5 });
  });

  it("heals a small legacy row on its first write", async () => {
    const t = await entitledUser("user-a");
    const legacy = await t.run((ctx) =>
      ctx.db.insert("spaces", { userId: "user-a", name: "Legacy" }),
    );
    const a = await seedItem(t, "user-a", "a");
    const b = await seedItem(t, "user-a", "b");
    await t.run((ctx) =>
      ctx.db.insert("spaceItems", { userId: "user-a", spaceId: legacy, itemId: a, status: "saved" }),
    );
    await t.mutation(api.spaces.addItemToSpace, { itemId: b, spaceId: legacy });
    expect(await readSpace(t, legacy)).toMatchObject({
      savedCount: 2, suggestedCount: 0, previewItemIds: [b, a], suggestedPreviewItemIds: [],
    });
  });
});

describe("steering spend controls", () => {
  it("blocks a burst of addItemToSpace past the steerItem capacity and rolls the add back", async () => {
    // steerItem capacity is 40; the 41st add in a tight loop must be rejected
    // so a leaked/shared Pro account can't loop and burn LLM spend.
    const t = await entitledUser("rate-user");
    const spaceId = await t.mutation(api.spaces.createSpace, { name: "Bulk" });
    for (let i = 0; i < 40; i++) {
      const itemId = await seedItem(t, "rate-user", `i${i}`, false);
      await t.mutation(api.spaces.addItemToSpace, { itemId, spaceId });
    }
    const over = await seedItem(t, "rate-user", "over", false);
    await expect(
      t.mutation(api.spaces.addItemToSpace, { itemId: over, spaceId }),
    ).rejects.toThrow();
    // The whole mutation rolled back: no join, no count, no job.
    expect((await readSpace(t, spaceId)).savedCount).toBe(40);
    expect(await steeringJobs(t)).toHaveLength(40);
    const joins = await t.run((ctx) =>
      ctx.db.query("spaceItems").withIndex("by_item", (q) => q.eq("itemId", over)).collect(),
    );
    expect(joins).toHaveLength(0);
  });

  it("acceptAllSuggestions keeps accepting once the steering budget is spent", async () => {
    const t = await entitledUser("rate-user");
    const spaceId = await t.mutation(api.spaces.createSpace, { name: "Bulk" });
    const ids: Id<"items">[] = [];
    for (let i = 0; i < 42; i++) {
      ids.push(await seedItem(t, "rate-user", `i${i}`, false));
    }
    await t.mutation(internal.items.suggestItemsForSpace, { spaceId, itemIds: ids });
    expect(await t.mutation(api.spaces.acceptAllSuggestions, { spaceId })).toBe(42);
    expect(await readSpace(t, spaceId)).toMatchObject({ savedCount: 42, suggestedCount: 0 });
    // Only the budget's worth of steering passes were scheduled.
    expect(await steeringJobs(t)).toHaveLength(40);
  });

  it("does not spend a steering token when the item is still processing", async () => {
    const t = await entitledUser("user-a");
    const spaceId = await t.mutation(api.spaces.createSpace, { name: "Recipes" });
    const processing = await t.run((ctx) =>
      ctx.db.insert("items", {
        userId: "user-a", type: "link", status: "processing", tags: [], searchText: "",
      }),
    );
    await t.mutation(api.spaces.addItemToSpace, { itemId: processing, spaceId });
    expect(await readSpace(t, spaceId)).toMatchObject({ savedCount: 1 });
    expect(await steeringJobs(t)).toHaveLength(0);
  });

  it("files items for a non-entitled user but never schedules steering", async () => {
    const t = freeUser("free-user");
    const spaceId = await t.run((ctx) =>
      ctx.db.insert("spaces", {
        userId: "free-user", name: "Mine",
        savedCount: 0, suggestedCount: 0, previewItemIds: [], suggestedPreviewItemIds: [],
      }),
    );
    const a = await seedItem(t, "free-user", "a");
    const s = await seedItem(t, "free-user", "s");
    const s2 = await seedItem(t, "free-user", "s2");
    await t.mutation(internal.items.suggestItemsForSpace, { spaceId, itemIds: [s, s2] });

    // The core organization actions all succeed without Pro.
    await t.mutation(api.spaces.addItemToSpace, { itemId: a, spaceId });
    expect(await t.mutation(api.spaces.acceptSuggestion, { itemId: s, spaceId })).toBe(true);
    expect(await t.mutation(api.spaces.acceptAllSuggestions, { spaceId })).toBe(1);
    expect(await readSpace(t, spaceId)).toMatchObject({ savedCount: 3, suggestedCount: 0 });
    // ...but the paid steering pass follows createSpace's Pro rule.
    expect(await steeringJobs(t)).toHaveLength(0);

    // Space creation itself stays Pro-gated, as before.
    await expect(t.mutation(api.spaces.createSpace, { name: "New" })).rejects.toThrow("Pro required");
  });

  it("rate-limits the recommendation pass on createSpace and on enabling dynamic", async () => {
    // recommendSpace capacity is 10. Retries of an existing name never spend.
    const t = await entitledUser("rate-user");
    for (let i = 0; i < 10; i++) {
      await t.mutation(api.spaces.createSpace, { name: `Space ${i}` });
    }
    const replay = await t.mutation(api.spaces.createSpace, { name: "Space 0" });
    expect(replay).toBeDefined();
    await expect(t.mutation(api.spaces.createSpace, { name: "Space 10" })).rejects.toThrow();
    const spaces = await t.run((ctx) =>
      ctx.db.query("spaces").withIndex("by_user", (q) => q.eq("userId", "rate-user")).collect(),
    );
    expect(spaces).toHaveLength(10);
    // Enabling dynamic draws from the same bucket and is rejected whole.
    await expect(
      t.mutation(api.spaces.updateSpace, { id: spaces[0]._id, dynamic: true }),
    ).rejects.toThrow();
    expect((await readSpace(t, spaces[0]._id)).dynamic).toBe(false);
    // A rename does not touch the recommendation budget.
    await t.mutation(api.spaces.updateSpace, { id: spaces[0]._id, name: "Renamed" });
    expect((await readSpace(t, spaces[0]._id)).name).toBe("Renamed");
    const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(jobs.filter((job) => job.name === "ai:recommendForSpace")).toHaveLength(10);
  });
});
