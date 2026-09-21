// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

import type { TestConvexForDataModel } from "convex-test";
import { newConvexTest } from "./test.setup";

import { api, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import {
  buildEmbeddingText,
  CURRENT_EMBEDDING_VERSION,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_SWEEP_PAGE,
  MAX_EMBEDDING_ATTEMPTS,
  MAX_SWEEP_READ_BYTES,
} from "./model/embedding";

type TestCtx = TestConvexForDataModel<DataModel>;

/** A well-formed vector of the indexed width. */
function vector(fill = 0.01): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, () => fill);
}

async function as(userId: string): Promise<TestCtx> {
  const t = newConvexTest().withIdentity({ subject: `${userId}|session-1` });
  await t.run(async (ctx) => {
    await ctx.db.insert("subscriptions", {
      userId,
      status: "pro",
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
      updatedAt: Date.now(),
    });
  });
  return t;
}

async function seedItem(
  t: TestCtx,
  userId: string,
  overrides: Record<string, unknown> = {},
): Promise<Id<"items">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("items", {
      userId,
      type: "link" as const,
      status: "ready" as const,
      title: "A save",
      url: "https://example.com/a",
      tags: ["tag"],
      searchText: "a save",
      ...overrides,
    }),
  );
}

/** The text the sweep would have embedded for `itemId`, so a write-back entry
 * passes the staleness fence the way a real sweep's would. */
async function embeddedText(t: TestCtx, itemId: Id<"items">): Promise<string> {
  const item = await t.run((ctx) => ctx.db.get(itemId));
  return buildEmbeddingText({
    title: item?.title,
    description: item?.description,
    tags: item?.tags ?? [],
    siteName: item?.siteName,
    note: item?.note,
    content: item?.content,
  });
}

describe("the retrieval vector stays inside the backend", () => {
  it("is absent from every client-facing item read", async () => {
    // `itemFields` omits the vector and Convex enforces `returns` at runtime,
    // so a leak here does not merely ship 6 KB per row — it throws and takes
    // the whole read down. These four are the reads that share enrichItem.
    const t = await as("reader");
    await seedItem(t, "reader", {
      embedding: vector(),
      embeddingVersion: CURRENT_EMBEDDING_VERSION,
      searchText: "a save about otters",
    });

    const feed = await t.query(api.items.listItems, {});
    const page = await t.query(api.items.listItemsPage, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    const found = await t.query(api.items.searchItems, { query: "otters" });
    const detail = await t.query(api.items.getItem, { id: feed[0]._id });

    // Assert the reads actually returned something: a `not.toHaveProperty`
    // loop over an empty array passes while covering nothing.
    expect(feed).toHaveLength(1);
    expect(page.page).toHaveLength(1);
    expect(found).toHaveLength(1);
    for (const row of [...feed, ...page.page, ...found]) {
      expect(row).not.toHaveProperty("embedding");
      expect(row).not.toHaveProperty("embeddingVersion");
      expect(row).not.toHaveProperty("embeddingAttempts");
    }
    expect(detail).not.toBeNull();
    expect(detail).not.toHaveProperty("embedding");
    expect(detail).not.toHaveProperty("embeddingVersion");
    expect(detail).not.toHaveProperty("embeddingAttempts");
  });

  it("is absent from the internal reads the AI actions use", async () => {
    // These return raw documents under `v.object(itemFields)`, so they would
    // also fail validation — and would drag a vector per row into the action.
    const t = await as("internals");
    const itemId = await seedItem(t, "internals", {
      embedding: vector(),
      embeddingVersion: CURRENT_EMBEDDING_VERSION,
    });

    const one = await t.query(internal.items.getItemInternal, { itemId });
    const many = await t.query(internal.items.listReadyItemsInternal, {
      userId: "internals",
      limit: 10,
    });

    expect(one).not.toBeNull();
    expect(one).not.toHaveProperty("embedding");
    expect(many).toHaveLength(1);
    expect(many[0]).not.toHaveProperty("embedding");
  });
});

describe("finalizeItem", () => {
  it("stores the vector and stamps the generation", async () => {
    const t = await as("finalize");
    const itemId = await seedItem(t, "finalize", { status: "processing" });

    const outcome = await t.mutation(internal.items.finalizeItem, {
      itemId,
      title: "Classified",
      description: "A description",
      tags: ["cooking"],
      embedding: vector(0.02),
      status: "ready",
    });

    expect(outcome).toBe("applied");
    const stored = await t.run((ctx) => ctx.db.get(itemId));
    expect(stored?.embedding).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(stored?.embeddingVersion).toBe(CURRENT_EMBEDDING_VERSION);
  });

  it("keeps an existing vector but clears the stamp when a run could not embed", async () => {
    // A transient provider failure must not delete a good vector (patching
    // `embedding: undefined` would). Clearing the stamp is what hands the row
    // to the sweeper to re-embed against the text just written.
    const t = await as("degrade");
    const itemId = await seedItem(t, "degrade", {
      status: "processing",
      embedding: vector(0.03),
      embeddingVersion: CURRENT_EMBEDDING_VERSION,
    });

    await t.mutation(internal.items.finalizeItem, {
      itemId,
      title: "Reclassified",
      description: "New text, no new vector",
      tags: [],
      status: "ready",
    });

    const stored = await t.run((ctx) => ctx.db.get(itemId));
    expect(stored?.embedding).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(stored?.embeddingVersion).toBeUndefined();
  });

  it("resets the attempt budget when it writes text it could not embed", async () => {
    // The budget belongs to one particular text. Carried across a
    // reclassification, a row with MAX_EMBEDDING_ATTEMPTS - 1 prior failures
    // would be stamped current after a single failure on the new text, keeping
    // a vector that describes what the item used to say.
    const t = await as("budget");
    const itemId = await seedItem(t, "budget", {
      status: "processing",
      embedding: vector(0.05),
      embeddingVersion: CURRENT_EMBEDDING_VERSION,
      embeddingAttempts: MAX_EMBEDDING_ATTEMPTS - 1,
    });

    await t.mutation(internal.items.finalizeItem, {
      itemId,
      title: "Reclassified",
      description: "New text, and this run could not embed it",
      tags: [],
      status: "ready",
    });

    const stored = await t.run((ctx) => ctx.db.get(itemId));
    expect(stored?.embeddingVersion).toBeUndefined();
    expect(stored?.embeddingAttempts).toBeUndefined();
  });

  it("writes no vector for a superseded run", async () => {
    const t = await as("fenced");
    const itemId = await seedItem(t, "fenced", {
      status: "processing",
      processingRunId: "run-current",
      processingStartedAt: Date.now(),
    });

    const outcome = await t.mutation(internal.items.finalizeItem, {
      itemId,
      runId: "run-superseded",
      title: "Stale",
      description: "From a run the user retried past",
      tags: [],
      embedding: vector(0.04),
      status: "ready",
    });

    expect(outcome).toBe("stale_run");
    const stored = await t.run((ctx) => ctx.db.get(itemId));
    expect(stored?.embedding).toBeUndefined();
  });
});

describe("updateNoteItem invalidates the vector", () => {
  async function readyNote(t: TestCtx, userId: string) {
    return await t.run((ctx) =>
      ctx.db.insert("items", {
        userId,
        type: "note" as const,
        status: "ready" as const,
        title: "Shopping",
        note: "Oat milk",
        tags: [],
        searchText: "shopping oat milk",
        embedding: vector(0.06),
        embeddingVersion: CURRENT_EMBEDDING_VERSION,
        embeddingAttempts: MAX_EMBEDDING_ATTEMPTS - 1,
      }),
    );
  }

  it("clears the stamp and the attempt budget on a title-only edit", async () => {
    // A title-only edit schedules no re-classify, so the sweep is the only
    // thing that will re-embed this row — it has to be handed back to it. And
    // the budget has to go with the stamp: kept, one failure on the edited
    // note would reach the cap and stamp the row current with a vector
    // describing the old title.
    const t = await as("note-edit");
    const id = await readyNote(t, "note-edit");

    await t.mutation(api.items.updateNoteItem, { id, title: "Groceries" });

    const stored = await t.run((ctx) => ctx.db.get(id));
    expect(stored?.title).toBe("Groceries");
    expect(stored?.embeddingVersion).toBeUndefined();
    expect(stored?.embeddingAttempts).toBeUndefined();
    // The old vector stays until the sweep replaces it: stale beats absent.
    expect(stored?.embedding).toHaveLength(EMBEDDING_DIMENSIONS);
  });
});

describe("the article body reaches the full-text index", () => {
  it("matches a word that appears only in the extracted body", async () => {
    // Before this, searchText held only the classifier's summary, so a phrase
    // the reader actually remembers from the article was unfindable.
    const t = await as("body");
    const itemId = await seedItem(t, "body", { status: "processing" });

    await t.mutation(internal.items.finalizeItem, {
      itemId,
      title: "An article",
      description: "A summary that never says the word",
      tags: ["reading"],
      content: "Deep in the third paragraph sits the word pangolin.",
      status: "ready",
    });

    const results = await t.query(api.items.searchItems, {
      query: "pangolin",
    });
    expect(results.map((r) => r._id)).toEqual([itemId]);
  });
});

describe("the embedding sweep", () => {
  it("returns composed text for rows that need embedding and skips current ones", async () => {
    const t = await as("sweep");
    const stale = await seedItem(t, "sweep", {
      title: "Needs embedding",
      description: "No vector yet",
    });
    await seedItem(t, "sweep", {
      title: "Already current",
      embedding: vector(),
      embeddingVersion: CURRENT_EMBEDDING_VERSION,
    });
    // Only `ready` rows are worth embedding.
    await seedItem(t, "sweep", { status: "processing", title: "In flight" });
    await seedItem(t, "sweep", { status: "failed", title: "Broken" });

    const pending = await t.query(
      internal.items.listItemsNeedingEmbeddingInternal,
      { limit: EMBEDDING_SWEEP_PAGE },
    );

    expect(pending.map((p) => p.itemId)).toEqual([stale]);
    expect(pending[0].text).toContain("Needs embedding");
    expect(pending[0].text).toContain("No vector yet");
  });

  it("re-enlists rows stamped by an older generation", async () => {
    // The migration path after CURRENT_EMBEDDING_VERSION is bumped: a
    // present-but-stale stamp must fall inside the sweep range, not just an
    // absent one.
    const t = await as("bump");
    const stale = await seedItem(t, "bump", {
      embedding: vector(),
      embeddingVersion: CURRENT_EMBEDDING_VERSION - 1,
    });

    const pending = await t.query(
      internal.items.listItemsNeedingEmbeddingInternal,
      { limit: EMBEDDING_SWEEP_PAGE },
    );

    expect(pending.map((p) => p.itemId)).toEqual([stale]);
  });

  it("caps a page at the sweep size however large a limit is asked for", async () => {
    const t = await as("cap");
    for (let i = 0; i < EMBEDDING_SWEEP_PAGE + 5; i++) {
      await seedItem(t, "cap", { title: `Save ${i}` });
    }

    const pending = await t.query(
      internal.items.listItemsNeedingEmbeddingInternal,
      { limit: 10_000 },
    );

    expect(pending).toHaveLength(EMBEDDING_SWEEP_PAGE);
  });

  it("stops on the byte budget before the row count", async () => {
    // A page of long articles would otherwise blow the transaction read limit,
    // and because the same rows lead the range every run, the sweep would
    // wedge on them permanently rather than failing once.
    const t = await as("bytes");
    const huge = "x".repeat(Math.ceil(MAX_SWEEP_READ_BYTES / 2) + 1);
    for (let i = 0; i < 6; i++) {
      await seedItem(t, "bytes", { title: `Long ${i}`, content: huge });
    }

    const pending = await t.query(
      internal.items.listItemsNeedingEmbeddingInternal,
      { limit: EMBEDDING_SWEEP_PAGE },
    );

    expect(pending.length).toBeLessThan(EMBEDDING_SWEEP_PAGE);
    expect(pending.length).toBeGreaterThan(0);
  });

  it("writes and stamps an embedded item, clearing its attempt count", async () => {
    const t = await as("stamp");
    const itemId = await seedItem(t, "stamp", { embeddingAttempts: 2 });

    const result = await t.mutation(internal.items.setEmbeddingsInternal, {
      entries: [
        {
          itemId,
          text: await embeddedText(t, itemId),
          embedding: vector(0.05),
          outcome: "embedded",
        },
      ],
    });

    expect(result).toEqual({ written: 1, stamped: 1, deferred: 0 });
    const stored = await t.run((ctx) => ctx.db.get(itemId));
    expect(stored?.embeddingVersion).toBe(CURRENT_EMBEDDING_VERSION);
    expect(stored?.embeddingAttempts).toBeUndefined();
  });

  it("finishes an item that has no embeddable text", async () => {
    const t = await as("empty");
    const itemId = await seedItem(t, "empty");

    const result = await t.mutation(internal.items.setEmbeddingsInternal, {
      entries: [
        {
          itemId,
          text: await embeddedText(t, itemId),
          outcome: "nothing_to_embed",
        },
      ],
    });

    expect(result).toEqual({ written: 0, stamped: 1, deferred: 0 });
    // It leaves the range, so the sweep drains instead of spinning on it.
    expect(
      await t.query(internal.items.listItemsNeedingEmbeddingInternal, {
        limit: EMBEDDING_SWEEP_PAGE,
      }),
    ).toEqual([]);
  });

  it("leaves a deferred item completely alone so an outage cannot strand it", async () => {
    // Stamping here would delete the item from the vector index permanently.
    // Across a whole outage that is not one row — it is the entire table.
    const t = await as("outage");
    const itemId = await seedItem(t, "outage", { title: "Embeddable" });

    const result = await t.mutation(internal.items.setEmbeddingsInternal, {
      entries: [
        { itemId, text: await embeddedText(t, itemId), outcome: "deferred" },
      ],
    });

    expect(result).toEqual({ written: 0, stamped: 0, deferred: 1 });
    const stored = await t.run((ctx) => ctx.db.get(itemId));
    expect(stored?.embeddingVersion).toBeUndefined();
    expect(stored?.embeddingAttempts).toBeUndefined();
    // Still queued for a later tick.
    expect(
      await t.query(internal.items.listItemsNeedingEmbeddingInternal, {
        limit: EMBEDDING_SWEEP_PAGE,
      }),
    ).toHaveLength(1);
  });

  it("spends an attempt on an item-specific failure and gives up at the cap", async () => {
    const t = await as("poison");
    const itemId = await seedItem(t, "poison", { title: "Unembeddable" });

    for (let attempt = 1; attempt < MAX_EMBEDDING_ATTEMPTS; attempt++) {
      const result = await t.mutation(internal.items.setEmbeddingsInternal, {
        entries: [
          { itemId, text: await embeddedText(t, itemId), outcome: "failed" },
        ],
      });
      expect(result).toEqual({ written: 0, stamped: 0, deferred: 1 });
      const row = await t.run((ctx) => ctx.db.get(itemId));
      expect(row?.embeddingAttempts).toBe(attempt);
      expect(row?.embeddingVersion).toBeUndefined();
    }

    // The last attempt gives up, so one permanently bad item cannot block
    // every row behind it in the range forever.
    const final = await t.mutation(internal.items.setEmbeddingsInternal, {
      entries: [
        { itemId, text: await embeddedText(t, itemId), outcome: "failed" },
      ],
    });
    expect(final).toEqual({ written: 0, stamped: 1, deferred: 0 });
    const stored = await t.run((ctx) => ctx.db.get(itemId));
    expect(stored?.embeddingVersion).toBe(CURRENT_EMBEDDING_VERSION);
    expect(
      await t.query(internal.items.listItemsNeedingEmbeddingInternal, {
        limit: EMBEDDING_SWEEP_PAGE,
      }),
    ).toEqual([]);
  });

  it("refuses a vector computed from text the item no longer has", async () => {
    // The version guard only catches a pipeline run that embedded
    // successfully. One that re-classified and then FAILED to embed clears the
    // stamp, so the row looks unembedded while its text is newer than what the
    // action read. Writing then would pin a vector describing text the item no
    // longer has, at the current generation, where nothing revisits it.
    const t = await as("moved");
    const itemId = await seedItem(t, "moved", { title: "Before" });
    const embeddedBefore = await embeddedText(t, itemId);

    await t.run((ctx) =>
      ctx.db.patch(itemId, { title: "After", description: "Rewritten" }),
    );

    const result = await t.mutation(internal.items.setEmbeddingsInternal, {
      entries: [
        {
          itemId,
          text: embeddedBefore,
          embedding: vector(),
          outcome: "embedded",
        },
      ],
    });

    expect(result).toEqual({ written: 0, stamped: 0, deferred: 1 });
    const stored = await t.run((ctx) => ctx.db.get(itemId));
    expect(stored?.embedding).toBeUndefined();
    expect(stored?.embeddingVersion).toBeUndefined();
    // Left for the next tick, which reads the new text.
    expect(
      await t.query(internal.items.listItemsNeedingEmbeddingInternal, {
        limit: EMBEDDING_SWEEP_PAGE,
      }),
    ).toHaveLength(1);
  });

  it("does not overwrite a vector a live pipeline run already wrote", async () => {
    const t = await as("race");
    const itemId = await seedItem(t, "race", {
      embedding: vector(0.5),
      embeddingVersion: CURRENT_EMBEDDING_VERSION,
    });

    const result = await t.mutation(internal.items.setEmbeddingsInternal, {
      entries: [
        {
          itemId,
          text: await embeddedText(t, itemId),
          embedding: vector(0.9),
          outcome: "embedded",
        },
      ],
    });

    expect(result).toEqual({ written: 0, stamped: 0, deferred: 0 });
    const stored = await t.run((ctx) => ctx.db.get(itemId));
    expect(stored?.embedding?.[0]).toBeCloseTo(0.5, 10);
  });

  it("treats a malformed vector as an item-specific failure, not a success", async () => {
    const t = await as("malformed");
    const itemId = await seedItem(t, "malformed");

    const result = await t.mutation(internal.items.setEmbeddingsInternal, {
      entries: [
        {
          itemId,
          text: await embeddedText(t, itemId),
          embedding: vector().slice(0, 10),
          outcome: "embedded",
        },
      ],
    });

    expect(result).toEqual({ written: 0, stamped: 0, deferred: 1 });
    const stored = await t.run((ctx) => ctx.db.get(itemId));
    expect(stored?.embedding).toBeUndefined();
    expect(stored?.embeddingAttempts).toBe(1);
  });

  it("rejects an all-zero vector", async () => {
    const t = await as("zero");
    const itemId = await seedItem(t, "zero");

    await t.mutation(internal.items.setEmbeddingsInternal, {
      entries: [
        {
          itemId,
          text: await embeddedText(t, itemId),
          embedding: vector(0),
          outcome: "embedded",
        },
      ],
    });

    const stored = await t.run((ctx) => ctx.db.get(itemId));
    expect(stored?.embedding).toBeUndefined();
  });

  it("skips an item deleted while the action was embedding", async () => {
    const t = await as("deleted");
    const itemId = await seedItem(t, "deleted");
    await t.run((ctx) => ctx.db.delete(itemId));

    await expect(
      t.mutation(internal.items.setEmbeddingsInternal, {
        entries: [
          {
            itemId,
            text: await embeddedText(t, itemId),
            embedding: vector(),
            outcome: "embedded",
          },
        ],
      }),
    ).resolves.toEqual({ written: 0, stamped: 0, deferred: 0 });
  });

  it("rebuilds searchText, so existing saves gain body search without the model", async () => {
    const t = await as("reindex");
    const itemId = await seedItem(t, "reindex", {
      title: "Old save",
      content: "The body mentions capybaras exactly once.",
      searchText: "old save",
    });

    expect(
      await t.query(api.items.searchItems, { query: "capybaras" }),
    ).toEqual([]);

    await t.mutation(internal.items.setEmbeddingsInternal, {
      entries: [
        {
          itemId,
          text: await embeddedText(t, itemId),
          embedding: vector(),
          outcome: "embedded",
        },
      ],
    });

    const results = await t.query(api.items.searchItems, {
      query: "capybaras",
    });
    expect(results.map((r) => r._id)).toEqual([itemId]);
  });

  it("reindexes even when the vector was deferred", async () => {
    // The Phase 0 backfill is independent of the provider being reachable.
    const t = await as("reindex-down");
    const itemId = await seedItem(t, "reindex-down", {
      content: "A body mentioning axolotls.",
      searchText: "a save",
    });

    await t.mutation(internal.items.setEmbeddingsInternal, {
      entries: [
        { itemId, text: await embeddedText(t, itemId), outcome: "deferred" },
      ],
    });

    expect(
      (await t.query(api.items.searchItems, { query: "axolotls" })).map(
        (r) => r._id,
      ),
    ).toEqual([itemId]);
  });
});

describe("similar items", () => {
  it("scores on the summary, not the indexed article body", async () => {
    // searchText now carries the body, and searchTokens has no stopword list —
    // scoring over it would have every pair of English articles share "that",
    // "with", "from" and clear SIMILAR_MIN_SCORE on filler alone.
    const t = await as("similar");
    const source = await seedItem(t, "similar", {
      title: "Sourdough starter",
      tags: ["baking"],
      description: "Keeping a culture alive",
      content: "That which would have been there, with them, from those.",
    });
    await seedItem(t, "similar", {
      title: "Bicycle maintenance",
      tags: ["cycling"],
      description: "Adjusting derailleurs",
      content: "That which would have been there, with them, from those.",
    });

    const similar = await t.query(api.items.similarItems, { id: source });

    // Shared filler prose must not make two unrelated saves similar.
    expect(similar).toEqual([]);
  });

  it("still matches items that share real subject matter", async () => {
    const t = await as("similar-real");
    const source = await seedItem(t, "similar-real", {
      title: "Sourdough starter",
      tags: ["baking", "bread"],
      description: "Keeping a culture alive",
    });
    const related = await seedItem(t, "similar-real", {
      title: "Sourdough troubleshooting",
      tags: ["baking", "bread"],
      description: "Reviving a sluggish culture",
    });

    const similar = await t.query(api.items.similarItems, { id: source });

    expect(similar.map((r) => r._id)).toContain(related);
  });
});

describe("listReadyItemsByIdInternal", () => {
  async function seedReady(userId: string, titles: string[]) {
    const t = newConvexTest();
    const ids = await t.run(async (ctx) => {
      const out: Id<"items">[] = [];
      for (const title of titles) {
        out.push(
          await ctx.db.insert("items", {
            userId,
            type: "link" as const,
            status: "ready" as const,
            title,
            tags: [],
            searchText: title.toLowerCase(),
            embedding: vector(),
            embeddingVersion: CURRENT_EMBEDDING_VERSION,
          }),
        );
      }
      return out;
    });
    return { t, ids };
  }

  it("returns rows in the order the ids were given, not insertion order", async () => {
    const { t, ids } = await seedReady("hydrate", ["A", "B", "C"]);

    const rows = await t.query(internal.items.listReadyItemsByIdInternal, {
      userId: "hydrate",
      itemIds: [ids[2], ids[0], ids[1]],
      limit: 10,
    });

    // The caller's order is a relevance ranking the prompt numbers off, so a
    // re-sort here would silently hand the model a worse shortlist.
    expect(rows.map((row) => row.title)).toEqual(["C", "A", "B"]);
  });

  it("drops rows that are not ready, belong to someone else, or are gone", async () => {
    const t = newConvexTest();
    const { keep, failed, other, deleted } = await t.run(async (ctx) => {
      const base = {
        type: "link" as const,
        tags: [],
        searchText: "x",
        embedding: vector(),
        embeddingVersion: CURRENT_EMBEDDING_VERSION,
      };
      const keep = await ctx.db.insert("items", {
        ...base,
        userId: "owner",
        status: "ready" as const,
        title: "Keep",
      });
      const failed = await ctx.db.insert("items", {
        ...base,
        userId: "owner",
        status: "failed" as const,
        title: "Failed",
      });
      const other = await ctx.db.insert("items", {
        ...base,
        userId: "intruder",
        status: "ready" as const,
        title: "Other",
      });
      const deleted = await ctx.db.insert("items", {
        ...base,
        userId: "owner",
        status: "ready" as const,
        title: "Deleted",
      });
      await ctx.db.delete(deleted);
      return { keep, failed, other, deleted };
    });

    const rows = await t.query(internal.items.listReadyItemsByIdInternal, {
      userId: "owner",
      itemIds: [failed, other, deleted, keep],
      limit: 10,
    });

    expect(rows.map((row) => row.title)).toEqual(["Keep"]);
  });

  it("stops at the requested limit", async () => {
    const { t, ids } = await seedReady("capped", ["A", "B", "C", "D"]);

    const rows = await t.query(internal.items.listReadyItemsByIdInternal, {
      userId: "capped",
      itemIds: ids,
      limit: 2,
    });

    expect(rows.map((row) => row.title)).toEqual(["A", "B"]);
  });

  it("never hands a stored vector back to the caller", async () => {
    const { t, ids } = await seedReady("stripped", ["A"]);

    const rows = await t.query(internal.items.listReadyItemsByIdInternal, {
      userId: "stripped",
      itemIds: ids,
      limit: 10,
    });

    // `itemFields` has no `embedding`, so a raw document here would fail the
    // returns validator at runtime rather than merely bloat the payload.
    expect(rows).toHaveLength(1);
    expect("embedding" in rows[0]).toBe(false);
  });

  it("charges the budget for rows it reads and then drops", async () => {
    const t = newConvexTest();
    const ids = await t.run(async (ctx) => {
      const out: Id<"items">[] = [];
      // A vector outlives its item's flip to `failed`, so these two hits are
      // read in full and then dropped. The read has already cost the
      // transaction by then, which is what the budget is there to bound.
      for (const title of ["Stale one", "Stale two", "Small"]) {
        out.push(
          await ctx.db.insert("items", {
            userId: "stale",
            type: "link" as const,
            status:
              title === "Small" ? ("ready" as const) : ("failed" as const),
            title,
            tags: [],
            searchText: title.toLowerCase(),
            content: title === "Small" ? "tiny" : "x".repeat(1_100_000),
            embedding: vector(),
            embeddingVersion: CURRENT_EMBEDDING_VERSION,
          }),
        );
      }
      return out;
    });

    const rows = await t.query(internal.items.listReadyItemsByIdInternal, {
      userId: "stale",
      itemIds: ids,
      limit: 100,
    });

    // Counting only surviving rows would have walked past 2.2 MB of reads
    // with the budget still reading zero, and kept going.
    expect(rows).toEqual([]);
  });

  it("stops reading once the byte budget is spent", async () => {
    const t = newConvexTest();
    const ids = await t.run(async (ctx) => {
      const out: Id<"items">[] = [];
      // Two rows are enough to cross the 2 MB budget; the third is never read.
      for (const title of ["Big one", "Big two", "Small"]) {
        out.push(
          await ctx.db.insert("items", {
            userId: "heavy",
            type: "link" as const,
            status: "ready" as const,
            title,
            tags: [],
            searchText: title.toLowerCase(),
            content: title === "Small" ? "tiny" : "x".repeat(1_100_000),
            embedding: vector(),
            embeddingVersion: CURRENT_EMBEDDING_VERSION,
          }),
        );
      }
      return out;
    });

    const rows = await t.query(internal.items.listReadyItemsByIdInternal, {
      userId: "heavy",
      itemIds: ids,
      limit: 100,
    });

    // Truncation is safe only because the tail is the least relevant end of
    // the ranking.
    expect(rows.map((row) => row.title)).toEqual(["Big one", "Big two"]);
  });
});
