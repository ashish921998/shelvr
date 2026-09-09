// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import type { TestConvexForDataModel } from "convex-test";
import { newConvexTest } from "./test.setup";
import { describe, expect, it } from "vitest";
import { api, internal } from "@convex/_generated/api";
import type { DataModel } from "@convex/_generated/dataModel";

type TestCtx = TestConvexForDataModel<DataModel>;

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
