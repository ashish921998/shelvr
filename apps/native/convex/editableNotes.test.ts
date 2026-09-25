// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TestConvexForDataModel } from "convex-test";
import { newConvexTest, spendFreeSaves } from "./test.setup";

import { api, internal } from "./_generated/api";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { NOTE_REFRESH_DELAY_MS } from "./items";
import { MAX_ITEM_TITLE_CHARS, MAX_NOTE_TEXT_CHARS } from "./model/itemFields";

type TestCtx = TestConvexForDataModel<DataModel>;
type ItemFields = Partial<Omit<Doc<"items">, "_id" | "_creationTime">>;

// Scheduled refreshes stay queued rather than calling the model during
// teardown; their `_scheduled_functions` rows are still assertable.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

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

async function readyNote(
  t: TestCtx,
  userId: string,
  fields: ItemFields = {},
): Promise<Id<"items">> {
  return await t.run((ctx) =>
    ctx.db.insert("items", {
      userId,
      type: "note",
      status: "ready",
      note: "Buy oat milk",
      title: "Grocery reminder",
      description: "A shopping note",
      tags: ["groceries"],
      searchText: "grocery reminder a shopping note groceries",
      processingRunId: "run-initial",
      ...fields,
    }),
  );
}

async function refreshJobs(t: TestCtx) {
  const jobs = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  return jobs.filter((job) => job.name === "ai:processItem");
}

describe("updateNoteItem", () => {
  it("saves the text and a typed title, then schedules one quiet refresh", async () => {
    const base = newConvexTest();
    const t = await proUser(base, "editor");
    const id = await readyNote(t, "editor");
    const before = Date.now();

    await t.mutation(api.items.updateNoteItem, {
      id,
      title: "  Milk run ",
      text: "Buy oat milk and eggs",
    });

    const note = await t.run((ctx) => ctx.db.get(id));
    expect(note).toMatchObject({
      status: "ready",
      note: "Buy oat milk and eggs",
      title: "Milk run",
      titleSource: "user",
    });
    expect(note?.processingRunId).not.toBe("run-initial");
    expect(note?.searchText).toContain("milk run");
    expect(note?.searchText).toContain("eggs");

    const jobs = await refreshJobs(t);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].args[0]).toEqual({
      itemId: id,
      runId: note?.processingRunId,
      refresh: true,
    });
    expect(jobs[0].scheduledTime).toBeGreaterThanOrEqual(
      before + NOTE_REFRESH_DELAY_MS,
    );
  });

  it("does not re-classify a title-only edit", async () => {
    const t = await proUser(newConvexTest(), "renamer");
    const id = await readyNote(t, "renamer");

    await t.mutation(api.items.updateNoteItem, {
      id,
      title: "Errands",
      text: "Buy oat milk",
    });

    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      title: "Errands",
      titleSource: "user",
      processingRunId: "run-initial",
    });
    expect(await refreshJobs(t)).toHaveLength(0);
  });

  it("writes nothing when nothing changed", async () => {
    const t = await proUser(newConvexTest(), "idle");
    const id = await readyNote(t, "idle");
    const before = await t.run((ctx) => ctx.db.get(id));

    await t.mutation(api.items.updateNoteItem, {
      id,
      title: "",
      text: "Buy oat milk",
    });

    expect(await t.run((ctx) => ctx.db.get(id))).toEqual(before);
    expect(await refreshJobs(t)).toHaveLength(0);
  });

  it("hands naming back to the classifier when a typed title is cleared", async () => {
    const t = await proUser(newConvexTest(), "clearer");
    const id = await readyNote(t, "clearer", {
      title: "Mine",
      titleSource: "user",
    });

    await t.mutation(api.items.updateNoteItem, {
      id,
      title: "   ",
      text: "Buy oat milk",
    });

    const note = await t.run((ctx) => ctx.db.get(id));
    expect(note?.title).toBeUndefined();
    expect(note?.titleSource).toBeUndefined();
    expect(await refreshJobs(t)).toHaveLength(1);
  });

  it("rejects other users' notes, other item types, empty or long text and long titles", async () => {
    const base = newConvexTest();
    const owner = await proUser(base, "owner");
    const intruder = await proUser(base, "intruder");
    const id = await readyNote(owner, "owner");
    const linkId = await owner.run((ctx) =>
      ctx.db.insert("items", {
        userId: "owner",
        type: "link",
        status: "ready",
        url: "https://example.com",
        tags: [],
        searchText: "",
      }),
    );

    await expect(
      intruder.mutation(api.items.updateNoteItem, {
        id,
        title: "",
        text: "Mine now",
      }),
    ).rejects.toThrow("Item not found");
    await expect(
      owner.mutation(api.items.updateNoteItem, {
        id: linkId,
        title: "",
        text: "A note on a link",
      }),
    ).rejects.toThrow("Item not found");
    await expect(
      owner.mutation(api.items.updateNoteItem, {
        id,
        title: "",
        text: "   ",
      }),
    ).rejects.toThrow("Note text is empty");
    await expect(
      owner.mutation(api.items.updateNoteItem, {
        id,
        title: "",
        text: "x".repeat(MAX_NOTE_TEXT_CHARS + 1),
      }),
    ).rejects.toThrow("Note text is too long");
    await expect(
      owner.mutation(api.items.updateNoteItem, {
        id,
        title: "x".repeat(MAX_ITEM_TITLE_CHARS + 1),
        text: "Buy oat milk",
      }),
    ).rejects.toThrow("Title is too long");
    expect(await owner.run((ctx) => ctx.db.get(id))).toMatchObject({
      note: "Buy oat milk",
      title: "Grocery reminder",
    });
  });

  it("requires Pro once the free allowance is spent", async () => {
    const base = newConvexTest();
    const id = await readyNote(base, "lapsed");
    await spendFreeSaves(base, "lapsed");
    const lapsed = base.withIdentity({ subject: "lapsed|session-1" });

    await expect(
      lapsed.mutation(api.items.updateNoteItem, {
        id,
        title: "",
        text: "Changed",
      }),
    ).rejects.toMatchObject({
      data: { code: "pro_required", message: "Pro required" },
    });
  });

  it("updates only supplied fields while preserving newer body and title changes", async () => {
    const owner = await proUser(newConvexTest(), "partial-editor");
    const id = await readyNote(owner, "partial-editor");
    await owner.mutation(api.items.updateNoteItem, {
      id,
      text: "A newer body",
    });
    await owner.mutation(api.items.updateNoteItem, {
      id,
      title: "A new title",
    });
    expect(await owner.run((ctx) => ctx.db.get(id))).toMatchObject({
      note: "A newer body",
      title: "A new title",
      titleSource: "user",
    });
    await owner.mutation(api.items.updateNoteItem, {
      id,
      text: "Only the body changes",
    });
    expect(await owner.run((ctx) => ctx.db.get(id))).toMatchObject({
      note: "Only the body changes",
      title: "A new title",
      titleSource: "user",
    });
  });
});

describe("classification after an edit", () => {
  it("keeps a typed title and indexes the note's own words", async () => {
    const t = newConvexTest();
    const id = await readyNote(t, "keeper", {
      title: "Milk run",
      titleSource: "user",
      processingRunId: "run-refresh",
    });

    const outcome = await t.mutation(internal.items.finalizeItem, {
      itemId: id,
      runId: "run-refresh",
      title: "Classifier title",
      description: "Shopping list",
      tags: ["errands"],
      status: "ready",
    });

    expect(outcome).toBe("applied");
    const note = await t.run((ctx) => ctx.db.get(id));
    expect(note).toMatchObject({
      title: "Milk run",
      titleSource: "user",
      tags: ["errands"],
    });
    expect(note?.searchText).toContain("milk run");
    expect(note?.searchText).toContain("oat milk");
  });

  it("keeps the classifier title a note already has on a refresh", async () => {
    const t = newConvexTest();
    const id = await readyNote(t, "steady", { processingRunId: "run-refresh" });

    const outcome = await t.mutation(internal.items.finalizeItem, {
      itemId: id,
      runId: "run-refresh",
      title: "Dairy restock plan",
      keepTitle: true,
      description: "A longer shopping note",
      tags: ["errands"],
      status: "ready",
    });

    expect(outcome).toBe("applied");
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      title: "Grocery reminder",
      description: "A longer shopping note",
      tags: ["errands"],
    });
  });

  it("names an untitled note on a refresh", async () => {
    const t = newConvexTest();
    const id = await readyNote(t, "cleared", {
      title: undefined,
      processingRunId: "run-refresh",
    });

    await t.mutation(internal.items.finalizeItem, {
      itemId: id,
      runId: "run-refresh",
      title: "Dairy restock plan",
      keepTitle: true,
      description: "A shopping note",
      tags: ["groceries"],
      status: "ready",
    });

    const note = await t.run((ctx) => ctx.db.get(id));
    expect(note?.title).toBe("Dairy restock plan");
    expect(note?.searchText).toContain("dairy restock plan");
  });

  it("lets only the latest edit's run claim a refresh", async () => {
    const t = newConvexTest();
    const id = await readyNote(t, "claimer", { processingRunId: "run-latest" });

    expect(
      await t.mutation(internal.items.claimNoteRefresh, {
        itemId: id,
        runId: "run-older",
      }),
    ).toBe(false);
    expect(
      await t.mutation(internal.items.claimNoteRefresh, {
        itemId: id,
        runId: "run-latest",
      }),
    ).toBe(true);
  });

  it("stops claiming refreshes once the bucket is spent", async () => {
    const t = newConvexTest();
    const id = await readyNote(t, "busy", { processingRunId: "run-busy" });

    const claims: boolean[] = [];
    for (let i = 0; i < 30; i++) {
      claims.push(
        await t.mutation(internal.items.claimNoteRefresh, {
          itemId: id,
          runId: "run-busy",
        }),
      );
    }

    expect(claims[0]).toBe(true);
    expect(claims.at(-1)).toBe(false);
  });
});
