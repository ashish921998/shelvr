// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

import type { TestConvexForDataModel } from "convex-test";
import { newConvexTest } from "./test.setup";

import { api } from "./_generated/api";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { MAX_USER_NOTE_CHARS } from "./model/itemFields";

type TestCtx = TestConvexForDataModel<DataModel>;
type ItemFields = Partial<Omit<Doc<"items">, "_id" | "_creationTime">>;

/** An identity on `base` with an active Pro subscription. */
async function proUser(
  base: ReturnType<typeof newConvexTest>,
  userId: string,
): Promise<TestCtx> {
  await base.run(async (ctx) => {
    await ctx.db.insert("subscriptions", {
      userId,
      status: "pro",
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
      updatedAt: Date.now(),
    });
  });
  return base.withIdentity({ subject: `${userId}|session-1` });
}

async function readyPhoto(
  t: TestCtx,
  userId: string,
  fields: ItemFields = {},
): Promise<Id<"items">> {
  return await t.run((ctx) =>
    ctx.db.insert("items", {
      userId,
      type: "image",
      status: "ready",
      title: "Swiss Alpine Sunset",
      description: "Mountains above the clouds",
      tags: ["alps"],
      searchText: "swiss alpine sunset mountains above the clouds alps",
      ...fields,
    }),
  );
}

describe("setItemUserNote", () => {
  it("saves the trimmed note and makes it searchable", async () => {
    const t = await proUser(newConvexTest(), "owner");
    const id = await readyPhoto(t, "owner");

    await t.mutation(api.items.setItemUserNote, {
      id,
      note: "  Hotel view for the March trip ",
    });

    const item = await t.run((ctx) => ctx.db.get(id));
    expect(item?.userNote).toBe("Hotel view for the March trip");
    expect(item?.searchText).toContain("hotel view for the march trip");
    expect(item?.searchText).toContain("swiss alpine sunset");
    expect((await t.query(api.items.getItem, { id }))?.userNote).toBe(
      "Hotel view for the March trip",
    );
    const found = await t.query(api.items.searchItems, { query: "march" });
    expect(found.map((row) => row._id)).toEqual([id]);
  });

  it("clears the note, and its words leave search", async () => {
    const t = await proUser(newConvexTest(), "owner");
    const id = await readyPhoto(t, "owner");
    await t.mutation(api.items.setItemUserNote, { id, note: "for March" });

    await t.mutation(api.items.setItemUserNote, { id, note: "   " });

    const item = await t.run((ctx) => ctx.db.get(id));
    expect(item).not.toHaveProperty("userNote");
    expect(item?.searchText).not.toContain("march");
  });

  it("refuses someone else's save, a note save and an overlong note", async () => {
    const base = newConvexTest();
    const owner = await proUser(base, "owner");
    const other = await proUser(base, "other");
    const id = await readyPhoto(owner, "owner");
    const noteId = await readyPhoto(owner, "owner", {
      type: "note",
      note: "Buy oat milk",
    });

    await expect(
      other.mutation(api.items.setItemUserNote, { id, note: "mine now" }),
    ).rejects.toThrow("Item not found");
    await expect(
      owner.mutation(api.items.setItemUserNote, { id: noteId, note: "x" }),
    ).rejects.toThrow("Item not found");
    await expect(
      owner.mutation(api.items.setItemUserNote, {
        id,
        note: "x".repeat(MAX_USER_NOTE_CHARS + 1),
      }),
    ).rejects.toThrow("Note text is too long");
    expect(await owner.run((ctx) => ctx.db.get(id))).not.toHaveProperty(
      "userNote",
    );
  });

  it("requires Pro", async () => {
    const base = newConvexTest();
    const id = await readyPhoto(base, "free");
    const free = base.withIdentity({ subject: "free|session-1" });

    await expect(
      free.mutation(api.items.setItemUserNote, { id, note: "hello" }),
    ).rejects.toThrow();
    expect(await base.run((ctx) => ctx.db.get(id))).not.toHaveProperty(
      "userNote",
    );
  });
});
