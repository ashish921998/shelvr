// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

import type { TestConvexForDataModel } from "convex-test";
import { newConvexTest, signedInUser } from "./test.setup";

import { api, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import {
  buildEmbeddingText,
  CURRENT_EMBEDDING_VERSION,
  EMBEDDING_DIMENSIONS,
  MAX_EMBEDDING_ATTEMPTS,
} from "./model/embedding";

type TestCtx = TestConvexForDataModel<DataModel>;

function vector(fill = 0.01): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, () => fill);
}

async function as(): Promise<{ t: TestCtx; userId: string }> {
  return await signedInUser(newConvexTest(), { pro: true });
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
    const { t, userId } = await as();
    await seedItem(t, userId, {
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
    const { t, userId } = await as();
    const itemId = await seedItem(t, userId, {
      embedding: vector(),
      embeddingVersion: CURRENT_EMBEDDING_VERSION,
    });

    const one = await t.query(internal.items.getItemInternal, { itemId });
    const many = await t.query(internal.items.listReadyItemsInternal, {
      userId,
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
    const { t, userId } = await as();
    const itemId = await seedItem(t, userId, { status: "processing" });

    const outcome = await t.mutation(internal.items.finalizeItem, {
      itemId,
      reading: {},
      classification: {
        title: "Classified",
        description: "A description",
        tags: ["cooking"],
        embedding: {
          text: buildEmbeddingText({
            title: "Classified",
            description: "A description",
            tags: ["cooking"],
          }),
          vector: vector(0.02),
        },
      },
    });

    expect(outcome).toBe("applied");
    const stored = await t.run((ctx) => ctx.db.get(itemId));
    expect(stored?.embedding).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(stored?.embeddingVersion).toBe(CURRENT_EMBEDDING_VERSION);
  });

  it("keeps an existing vector but clears the stamp when a run could not embed", async () => {
    const { t, userId } = await as();
    const itemId = await seedItem(t, userId, {
      status: "processing",
      embedding: vector(0.03),
      embeddingVersion: CURRENT_EMBEDDING_VERSION,
    });

    await t.mutation(internal.items.finalizeItem, {
      itemId,
      reading: {},
      classification: {
        title: "Reclassified",
        description: "New text, no new vector",
        tags: [],
      },
    });

    const stored = await t.run((ctx) => ctx.db.get(itemId));
    expect(stored?.embedding).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(stored?.embeddingVersion).toBeUndefined();
  });

  it("resets the attempt budget when it writes text it could not embed", async () => {
    const { t, userId } = await as();
    const itemId = await seedItem(t, userId, {
      status: "processing",
      embedding: vector(0.05),
      embeddingVersion: CURRENT_EMBEDDING_VERSION,
      embeddingAttempts: MAX_EMBEDDING_ATTEMPTS - 1,
    });

    await t.mutation(internal.items.finalizeItem, {
      itemId,
      reading: {},
      classification: {
        title: "Reclassified",
        description: "New text, and this run could not embed it",
        tags: [],
      },
    });

    const stored = await t.run((ctx) => ctx.db.get(itemId));
    expect(stored?.embeddingVersion).toBeUndefined();
    expect(stored?.embeddingAttempts).toBeUndefined();
  });

  it("writes no vector for a superseded run", async () => {
    const { t, userId } = await as();
    const itemId = await seedItem(t, userId, {
      status: "processing",
      processingRunId: "run-current",
      processingStartedAt: Date.now(),
    });

    const outcome = await t.mutation(internal.items.finalizeItem, {
      itemId,
      runId: "run-superseded",
      reading: {},
      classification: {
        title: "Stale",
        description: "From a run the user retried past",
        tags: [],
        embedding: {
          text: buildEmbeddingText({
            title: "Stale",
            description: "From a run the user retried past",
          }),
          vector: vector(0.04),
        },
      },
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
    const { t, userId } = await as();
    const id = await readyNote(t, userId);

    await t.mutation(api.items.updateNoteItem, { id, title: "Groceries" });

    const stored = await t.run((ctx) => ctx.db.get(id));
    expect(stored?.title).toBe("Groceries");
    expect(stored?.embeddingVersion).toBeUndefined();
    expect(stored?.embeddingAttempts).toBeUndefined();
    expect(stored?.embedding).toHaveLength(EMBEDDING_DIMENSIONS);
  });
});

describe("the article body reaches the full-text index", () => {
  it("matches a word that appears only in the extracted body", async () => {
    const { t, userId } = await as();
    const itemId = await seedItem(t, userId, { status: "processing" });

    await t.mutation(internal.items.finalizeItem, {
      itemId,
      reading: {
        content: "Deep in the third paragraph sits the word pangolin.",
      },
      classification: {
        title: "An article",
        description: "A summary that never says the word",
        tags: ["reading"],
      },
    });

    const results = await t.query(api.items.searchItems, {
      query: "pangolin",
    });
    expect(results.map((r) => r._id)).toEqual([itemId]);
  });
});

describe("similar items", () => {
  it("scores on the summary, not the indexed article body", async () => {
    const { t, userId } = await as();
    const source = await seedItem(t, userId, {
      title: "Sourdough starter",
      tags: ["baking"],
      description: "Keeping a culture alive",
      content: "That which would have been there, with them, from those.",
    });
    await seedItem(t, userId, {
      title: "Bicycle maintenance",
      tags: ["cycling"],
      description: "Adjusting derailleurs",
      content: "That which would have been there, with them, from those.",
    });

    const similar = await t.query(api.items.similarItems, { id: source });

    expect(similar).toEqual([]);
  });

  it("still matches items that share real subject matter", async () => {
    const { t, userId } = await as();
    const source = await seedItem(t, userId, {
      title: "Sourdough starter",
      tags: ["baking", "bread"],
      description: "Keeping a culture alive",
    });
    const related = await seedItem(t, userId, {
      title: "Sourdough troubleshooting",
      tags: ["baking", "bread"],
      description: "Reviving a sluggish culture",
    });

    const similar = await t.query(api.items.similarItems, { id: source });

    expect(similar.map((r) => r._id)).toContain(related);
  });
});
