// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import type { TestConvexForDataModel } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { newConvexTest, signedInUser } from "./test.setup";

type TestCtx = TestConvexForDataModel<DataModel>;

async function entitledUser(): Promise<{ t: TestCtx; userId: string }> {
  return await signedInUser(newConvexTest(), { pro: true });
}

async function seedReadyNote(
  t: TestCtx,
  userId: string,
  note: string,
): Promise<Id<"items">> {
  return await t.run((ctx) =>
    ctx.db.insert("items", {
      userId,
      type: "note",
      status: "ready",
      note,
      tags: [],
      searchText: note,
    }),
  );
}

async function joinsOf(t: TestCtx, itemId: Id<"items">) {
  return await t.run((ctx) =>
    ctx.db
      .query("spaceItems")
      .withIndex("by_item", (q) => q.eq("itemId", itemId))
      .collect(),
  );
}

/**
 * Regression: re-classifying a save (a retry through reprocessItem, or a note
 * edit through updateNoteItem) runs the classifier against DYNAMIC spaces
 * only, so a quiet space is never in its answer. The suggestion the one
 * recommendation pass left in that quiet space was never evaluated and must
 * not be withdrawn; nothing would ever bring it back.
 */
describe("setSpacesForItem and quiet-space suggestions", () => {
  it("keeps a recommendation-pass suggestion in a non-dynamic space the classifier was never shown", async () => {
    const { t, userId } = await entitledUser();
    const quiet = await t.mutation(api.spaces.createSpace, {
      name: "Date night",
      dynamic: false,
    });
    const itemId = await seedReadyNote(t, userId, "Tigre for cocktails");
    await t.mutation(internal.items.suggestItemsForSpace, {
      spaceId: quiet,
      itemIds: [itemId],
    });
    expect(await joinsOf(t, itemId)).toMatchObject([
      { spaceId: quiet, status: "suggested" },
    ]);

    // The re-classification names no space at all.
    await t.mutation(internal.items.setSpacesForItem, {
      itemId,
      spaceIds: [],
    });

    expect(await joinsOf(t, itemId)).toMatchObject([
      { spaceId: quiet, status: "suggested" },
    ]);
    const listed = await t.query(api.spaces.listSpaces, {});
    expect(listed.find((space) => space._id === quiet)?.suggestionCount).toBe(
      1,
    );
  });

  it("still withdraws a suggestion in a dynamic space the classifier dropped", async () => {
    const { t, userId } = await entitledUser();
    const quiet = await t.mutation(api.spaces.createSpace, {
      name: "Date night",
      dynamic: false,
    });
    const dynamic = await t.mutation(api.spaces.createSpace, {
      name: "Recipes",
      dynamic: true,
    });
    const itemId = await seedReadyNote(t, userId, "Tigre for cocktails");
    await t.mutation(internal.items.suggestItemsForSpace, {
      spaceId: quiet,
      itemIds: [itemId],
    });
    await t.mutation(internal.items.setSpacesForItem, {
      itemId,
      spaceIds: [dynamic],
    });
    expect((await joinsOf(t, itemId)).map((join) => join.spaceId)).toEqual(
      expect.arrayContaining([quiet, dynamic]),
    );

    await t.mutation(internal.items.setSpacesForItem, {
      itemId,
      spaceIds: [],
    });

    const joins = await joinsOf(t, itemId);
    expect(joins).toHaveLength(1);
    expect(joins[0]).toMatchObject({ spaceId: quiet, status: "suggested" });
  });
});
