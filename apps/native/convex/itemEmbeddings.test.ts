// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

import type { TestConvexForDataModel } from "convex-test";
import { newConvexTest } from "./test.setup";

import { api, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import {
  CURRENT_EMBEDDING_VERSION,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_SWEEP_PAGE,
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

    for (const row of [...feed, ...page.page, ...found]) {
      expect(row).not.toHaveProperty("embedding");
      expect(row).not.toHaveProperty("embeddingVersion");
    }
    expect(detail).not.toHaveProperty("embedding");
    expect(detail).not.toHaveProperty("embeddingVersion");
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

  it("stamps every item it is handed, including ones with no vector", async () => {
    // Progress is what keeps the sweep from looping: an item that can never
    // produce text must still leave the range.
    const t = await as("stamp");
    const withVector = await seedItem(t, "stamp");
    const withoutVector = await seedItem(t, "stamp");

    const result = await t.mutation(internal.items.setEmbeddingsInternal, {
      entries: [
        { itemId: withVector, embedding: vector(0.05) },
        { itemId: withoutVector },
      ],
    });

    expect(result).toEqual({ written: 1, stamped: 2 });
    const rows = await t.run(async (ctx) => [
      await ctx.db.get(withVector),
      await ctx.db.get(withoutVector),
    ]);
    expect(rows[0]?.embeddingVersion).toBe(CURRENT_EMBEDDING_VERSION);
    expect(rows[1]?.embeddingVersion).toBe(CURRENT_EMBEDDING_VERSION);
    expect(rows[1]?.embedding).toBeUndefined();

    // The range is now empty, so the sweep drains instead of spinning.
    const pending = await t.query(
      internal.items.listItemsNeedingEmbeddingInternal,
      { limit: EMBEDDING_SWEEP_PAGE },
    );
    expect(pending).toEqual([]);
  });

  it("does not overwrite a vector a live pipeline run already wrote", async () => {
    const t = await as("race");
    const itemId = await seedItem(t, "race", {
      embedding: vector(0.5),
      embeddingVersion: CURRENT_EMBEDDING_VERSION,
    });

    const result = await t.mutation(internal.items.setEmbeddingsInternal, {
      entries: [{ itemId, embedding: vector(0.9) }],
    });

    expect(result).toEqual({ written: 0, stamped: 0 });
    const stored = await t.run((ctx) => ctx.db.get(itemId));
    expect(stored?.embedding?.[0]).toBeCloseTo(0.5, 10);
  });

  it("drops a malformed vector but still stamps the row", async () => {
    const t = await as("malformed");
    const itemId = await seedItem(t, "malformed");

    const result = await t.mutation(internal.items.setEmbeddingsInternal, {
      entries: [{ itemId, embedding: vector().slice(0, 10) }],
    });

    expect(result).toEqual({ written: 0, stamped: 1 });
    const stored = await t.run((ctx) => ctx.db.get(itemId));
    expect(stored?.embedding).toBeUndefined();
    expect(stored?.embeddingVersion).toBe(CURRENT_EMBEDDING_VERSION);
  });

  it("skips an item deleted while the action was embedding", async () => {
    const t = await as("deleted");
    const itemId = await seedItem(t, "deleted");
    await t.run((ctx) => ctx.db.delete(itemId));

    await expect(
      t.mutation(internal.items.setEmbeddingsInternal, {
        entries: [{ itemId, embedding: vector() }],
      }),
    ).resolves.toEqual({ written: 0, stamped: 0 });
  });

  it("rebuilds searchText, so existing saves gain body search without the model", async () => {
    // The sweep is the only path by which a save classified before the body
    // was indexed becomes findable by its own words.
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
      entries: [{ itemId, embedding: vector() }],
    });

    const results = await t.query(api.items.searchItems, {
      query: "capybaras",
    });
    expect(results.map((r) => r._id)).toEqual([itemId]);
  });
});
