// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import type { TestConvexForDataModel } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { insertMembership } from "./model/memberships";
import { newConvexTest, signedInUser } from "./test.setup";

type TestCtx = TestConvexForDataModel<DataModel>;

// convex-test runs runAfter(0) jobs on a real setTimeout; fake timers keep them queued.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

const ARTICLE = "A paragraph of a long article about slow travel. ".repeat(200);

async function seedSpace(
  t: TestCtx,
  userId: string,
  saved: number,
  suggested: number,
): Promise<{ spaceId: Id<"spaces">; ids: Id<"items">[] }> {
  return await t.run(async (ctx) => {
    const spaceId = await ctx.db.insert("spaces", { userId, name: "Lisbon" });
    const ids: Id<"items">[] = [];
    for (let i = 0; i < saved + suggested; i++) {
      const itemId = await ctx.db.insert("items", {
        userId,
        type: "link",
        status: "ready",
        title: `Lisbon save ${i}`,
        url: `https://example.com/lisbon/${i}`,
        content: ARTICLE,
        recipe:
          i === 0 ? { ingredients: ["salt"], steps: ["stir"] } : undefined,
        tags: ["lisbon"],
        searchText: `lisbon save ${i}`,
      });
      ids.push(itemId);
      await insertMembership(ctx, {
        userId,
        spaceId,
        itemId,
        status: i < saved ? "saved" : "suggested",
      });
    }
    return { spaceId, ids };
  });
}

describe("getSpaceCards", () => {
  it("returns the same saves and suggestions as getSpace, as card rows", async () => {
    const { t, userId } = await signedInUser(newConvexTest(), { pro: true });
    const { spaceId } = await seedSpace(t, userId, 3, 2);

    const full = await t.query(api.spaces.getSpace, { id: spaceId });
    const cards = await t.query(api.spaces.getSpaceCards, { id: spaceId });

    expect(cards?.items.map((item) => item._id)).toEqual(
      full?.items.map((item) => item._id),
    );
    expect(cards?.suggestions.map((item) => item._id)).toEqual(
      full?.suggestions.map((item) => item._id),
    );
    expect(full?.items[0]).toHaveProperty("content");
    for (const row of [
      ...(cards?.items ?? []),
      ...(cards?.suggestions ?? []),
    ]) {
      expect(row).not.toHaveProperty("content");
      expect(row).not.toHaveProperty("recipe");
      expect(row).not.toHaveProperty("userId");
      expect(row).toHaveProperty("imageUrl");
    }
    const recipeRow = [...(cards?.items ?? []), ...(cards?.suggestions ?? [])]
      .filter((row) => row.hasRecipe === true)
      .map((row) => row.title);
    expect(recipeRow).toEqual(["Lisbon save 0"]);
  });

  it("ships a fraction of getSpace's bytes for a space of articles", async () => {
    const { t, userId } = await signedInUser(newConvexTest(), { pro: true });
    const { spaceId } = await seedSpace(t, userId, 20, 5);

    const full = JSON.stringify(
      await t.query(api.spaces.getSpace, { id: spaceId }),
    );
    const cards = JSON.stringify(
      await t.query(api.spaces.getSpaceCards, { id: spaceId }),
    );

    expect(cards.length * 10).toBeLessThan(full.length);
  });

  it("keeps the space's own steering intents on each saved row", async () => {
    const { t, userId } = await signedInUser(newConvexTest(), { pro: true });
    const { spaceId, ids } = await seedSpace(t, userId, 1, 0);
    await t.run(async (ctx) => {
      const join = await ctx.db
        .query("spaceItems")
        .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
        .unique();
      if (join === null) throw new Error("join missing");
      await ctx.db.patch(join._id, {
        intents: [
          { kind: "open_maps", label: "Open in Maps", value: "Lisbon" },
        ],
      });
    });

    const cards = await t.query(api.spaces.getSpaceCards, { id: spaceId });
    expect(cards?.items.map((row) => [row._id, row.spaceIntents])).toEqual([
      [ids[0], [{ kind: "open_maps", label: "Open in Maps", value: "Lisbon" }]],
    ]);
  });

  it("answers null for another user's space", async () => {
    const backend = newConvexTest();
    const owner = await signedInUser(backend, { pro: true });
    const other = await signedInUser(backend, { pro: true });
    const { spaceId } = await seedSpace(owner.t, owner.userId, 1, 0);

    expect(
      await other.t.query(api.spaces.getSpaceCards, { id: spaceId }),
    ).toBeNull();
  });
});

describe("searchItemCards", () => {
  it("finds what searchItems finds, without article bodies", async () => {
    const { t, userId } = await signedInUser(newConvexTest(), { pro: true });
    await seedSpace(t, userId, 3, 0);

    const full = await t.query(api.items.searchItems, { query: "lisbon" });
    const cards = await t.query(api.items.searchItemCards, { query: "lisbon" });

    expect(cards.map((row) => row._id).sort()).toEqual(
      full.map((row) => row._id).sort(),
    );
    expect(cards.length).toBe(3);
    for (const row of cards) expect(row).not.toHaveProperty("content");
  });

  it("answers [] for a blank query and never another user's saves", async () => {
    const backend = newConvexTest();
    const owner = await signedInUser(backend, { pro: true });
    const other = await signedInUser(backend, { pro: true });
    await seedSpace(owner.t, owner.userId, 2, 0);

    expect(
      await owner.t.query(api.items.searchItemCards, { query: "  " }),
    ).toEqual([]);
    expect(
      await other.t.query(api.items.searchItemCards, { query: "lisbon" }),
    ).toEqual([]);
  });
});
