// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { beforeEach, describe, expect, it, vi } from "vitest";

import { newConvexTest } from "./test.setup";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  CURRENT_EMBEDDING_VERSION,
  EMBEDDING_DIMENSIONS,
} from "./model/embedding";

const embedMany = vi.hoisted(() => vi.fn());
const generateObject = vi.hoisted(() => vi.fn());

// The action runs end to end; only the two provider calls are replaced.
// `ai.ts` builds its language model at import, so wrapLanguageModel is stubbed
// as well.
vi.mock("ai", () => ({
  embedMany,
  generateObject,
  wrapLanguageModel: vi.fn(() => ({})),
}));

/** A vector with the given components set and the rest zero. */
function vec(components: Record<number, number>): number[] {
  const v = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  for (const [index, value] of Object.entries(components)) {
    v[Number(index)] = value;
  }
  return v;
}

// Cosine against vec({0: 1}): 1.0, 0.8, 0.0. Insertion order below is the
// reverse of that, so any assertion on relevance order also proves the read is
// no longer by recency.
const ON_TOPIC = vec({ 0: 1 });
const NEARBY = vec({ 0: 0.8, 1: 0.6 });
const OFF_TOPIC = vec({ 1: 1 });

const USER = "chef";

type SeedItem = {
  title: string;
  embedding?: number[];
  status?: "ready" | "failed" | "processing";
  /** Only set where a test is about the hydration byte budget. */
  content?: string;
};

/**
 * Every seeded item carries an embedding unless a test is explicitly about the
 * no-vector path. convex-test's `vectorSearch` scores every row matching the
 * filter, including rows with no vector field, and throws on them — real
 * Convex simply leaves unembedded documents out of the index.
 */
async function seed(items: SeedItem[]) {
  const t = newConvexTest();
  const ids = await t.run(async (ctx) => {
    const spaceId = await ctx.db.insert("spaces", {
      userId: USER,
      name: "Pasta",
      description: "Recipes I want to cook",
      dynamic: true,
    });
    const itemIds: Record<string, Id<"items">> = {};
    for (const item of items) {
      itemIds[item.title] = await ctx.db.insert("items", {
        userId: USER,
        type: "link" as const,
        status: item.status ?? ("ready" as const),
        title: item.title,
        tags: [],
        searchText: item.title.toLowerCase(),
        ...(item.content === undefined ? {} : { content: item.content }),
        ...(item.embedding === undefined
          ? {}
          : {
              embedding: item.embedding,
              embeddingVersion: CURRENT_EMBEDDING_VERSION,
            }),
      });
    }
    return { spaceId, itemIds };
  });
  return { t, ...ids };
}

/** The numbered candidate list the prompt was built from, in prompt order. */
function promptedTitles(): string[] {
  const { prompt } = generateObject.mock.calls[0][0] as { prompt: string };
  return [...prompt.matchAll(/^\d+\. (.+)$/gm)].map((match) => match[1]);
}

async function suggestedTitles(t: Awaited<ReturnType<typeof seed>>["t"]) {
  return await t.run(async (ctx) => {
    const joins = await ctx.db.query("spaceItems").collect();
    const titles: string[] = [];
    for (const join of joins) {
      if (join.status !== "suggested") {
        continue;
      }
      const item = await ctx.db.get(join.itemId);
      titles.push(item?.title ?? "(missing)");
    }
    return titles.sort();
  });
}

beforeEach(() => {
  embedMany.mockReset();
  generateObject.mockReset();
  // The action's only embed call is the space query.
  embedMany.mockImplementation(async ({ values }: { values: string[] }) => ({
    embeddings: values.map(() => ON_TOPIC),
  }));
  generateObject.mockResolvedValue({ object: { itemNumbers: [] } });
});

describe("recommendForSpace candidate selection", () => {
  it("embeds the space text as a query, not as a document", async () => {
    const { t, spaceId } = await seed([
      { title: "Carbonara", embedding: ON_TOPIC },
    ]);

    await t.action(internal.ai.recommendForSpace, { spaceId });

    expect(embedMany).toHaveBeenCalledTimes(1);
    const call = embedMany.mock.calls[0][0];
    // Asymmetric retrieval: stored item vectors are RETRIEVAL_DOCUMENT, so a
    // query embedded as a document would silently rank worse rather than fail.
    expect(call.providerOptions.google.taskType).toBe("RETRIEVAL_QUERY");
    expect(call.providerOptions.google.outputDimensionality).toBe(
      EMBEDDING_DIMENSIONS,
    );
    expect(call.values).toEqual(["Pasta\nRecipes I want to cook"]);
  });

  it("orders candidates by relevance rather than recency", async () => {
    const { t, spaceId } = await seed([
      { title: "Carbonara", embedding: ON_TOPIC },
      { title: "Pesto", embedding: NEARBY },
      { title: "Kubernetes", embedding: OFF_TOPIC },
    ]);

    await t.action(internal.ai.recommendForSpace, { spaceId });

    // Newest-first would have been the exact reverse.
    expect(promptedTitles()).toEqual(["Carbonara", "Pesto", "Kubernetes"]);
  });

  it("maps the model's numbers back onto the ranked list", async () => {
    const { t, spaceId } = await seed([
      { title: "Carbonara", embedding: ON_TOPIC },
      { title: "Pesto", embedding: NEARBY },
      { title: "Kubernetes", embedding: OFF_TOPIC },
    ]);
    generateObject.mockResolvedValue({ object: { itemNumbers: [2] } });

    await t.action(internal.ai.recommendForSpace, { spaceId });

    expect(await suggestedTitles(t)).toEqual(["Pesto"]);
  });

  it("leaves items that are already in the space out of the candidates", async () => {
    const { t, spaceId, itemIds } = await seed([
      { title: "Carbonara", embedding: ON_TOPIC },
      { title: "Pesto", embedding: NEARBY },
    ]);
    await t.run(async (ctx) => {
      await ctx.db.insert("spaceItems", {
        userId: USER,
        spaceId,
        itemId: itemIds.Carbonara,
        status: "saved" as const,
      });
    });

    await t.action(internal.ai.recommendForSpace, { spaceId });

    expect(promptedTitles()).toEqual(["Pesto"]);
  });

  it("drops a hit whose vector outlived its ready status", async () => {
    const { t, spaceId } = await seed([
      // Strongest match, but no longer a ready save. The vector index has no
      // status filter field, so only the hydrating query can catch this.
      { title: "Carbonara", embedding: ON_TOPIC, status: "failed" },
      { title: "Pesto", embedding: NEARBY },
    ]);

    await t.action(internal.ai.recommendForSpace, { spaceId });

    expect(promptedTitles()).toEqual(["Pesto"]);
  });

  it("suggests nothing when every hit is already filed", async () => {
    const { t, spaceId, itemIds } = await seed([
      { title: "Carbonara", embedding: ON_TOPIC },
    ]);
    await t.run(async (ctx) => {
      await ctx.db.insert("spaceItems", {
        userId: USER,
        spaceId,
        itemId: itemIds.Carbonara,
        status: "dismissed" as const,
      });
    });

    await t.action(internal.ai.recommendForSpace, { spaceId });

    expect(generateObject).not.toHaveBeenCalled();
    expect(await suggestedTitles(t)).toEqual([]);
  });

  it("falls back to the newest items when the query cannot be embedded", async () => {
    const { t, spaceId } = await seed([
      { title: "Carbonara", embedding: ON_TOPIC },
      { title: "Pesto", embedding: NEARBY },
      { title: "Kubernetes", embedding: OFF_TOPIC },
    ]);
    // A user mid-backfill reaches the same branch by way of an empty index;
    // here the provider is simply down, which is the reachable trigger.
    embedMany.mockRejectedValue(new Error("provider down"));
    generateObject.mockResolvedValue({ object: { itemNumbers: [1] } });

    await t.action(internal.ai.recommendForSpace, { spaceId });

    expect(promptedTitles()).toEqual(["Kubernetes", "Pesto", "Carbonara"]);
    expect(await suggestedTitles(t)).toEqual(["Kubernetes"]);
  });

  it("falls back to the newest items when the search itself fails", async () => {
    const { t, spaceId } = await seed([
      { title: "Carbonara", embedding: ON_TOPIC },
      { title: "Pesto", embedding: NEARBY },
    ]);
    await t.run(async (ctx) => {
      // The trigger is a harness artifact: convex-test scores every row
      // matching the filter, so a row with no vector makes its cosine throw.
      // Real Convex leaves unembedded documents out of the index entirely.
      // What the test is actually for is the catch — the outer action only
      // logs and returns, so an error escaping the search would turn a
      // transient hiccup into no recommendations at all.
      await ctx.db.insert("items", {
        userId: USER,
        type: "link" as const,
        status: "ready" as const,
        title: "Not yet embedded",
        tags: [],
        searchText: "not yet embedded",
      });
    });
    generateObject.mockResolvedValue({ object: { itemNumbers: [1] } });

    await t.action(internal.ai.recommendForSpace, { spaceId });

    expect(promptedTitles()).toEqual([
      "Not yet embedded",
      "Pesto",
      "Carbonara",
    ]);
    expect(await suggestedTitles(t)).toEqual(["Not yet embedded"]);
  });

  it("fills a short ranked list out with recent items", async () => {
    // Hydration's byte budget is the reachable stand-in for a half-drained
    // sweep: either way the index hands back fewer candidates than the shelf
    // holds, and the prompt must not shrink to match. Two bodies cross the
    // 2 MB budget, so the third hit never survives hydration.
    const { t, spaceId } = await seed([
      {
        title: "Carbonara",
        embedding: ON_TOPIC,
        content: "x".repeat(1_100_000),
      },
      { title: "Pesto", embedding: NEARBY, content: "x".repeat(1_100_000) },
      { title: "Kubernetes", embedding: OFF_TOPIC },
    ]);

    await t.action(internal.ai.recommendForSpace, { spaceId });

    // Ranked hits lead; recency supplies what the ranking could not reach.
    // Without the top-up the prompt would have been the first two alone.
    expect(promptedTitles()).toEqual(["Carbonara", "Pesto", "Kubernetes"]);
  });

  it("does not repeat an item that the ranked half already supplied", async () => {
    const { t, spaceId } = await seed([
      { title: "Carbonara", embedding: ON_TOPIC },
      { title: "Pesto", embedding: NEARBY },
    ]);

    await t.action(internal.ai.recommendForSpace, { spaceId });

    // Both reads see both items; the prompt must still number them once.
    expect(promptedTitles()).toEqual(["Carbonara", "Pesto"]);
  });

  it("never reaches across accounts", async () => {
    const { t, spaceId } = await seed([
      { title: "Carbonara", embedding: ON_TOPIC },
    ]);
    await t.run(async (ctx) => {
      await ctx.db.insert("items", {
        userId: "someone-else",
        type: "link" as const,
        status: "ready" as const,
        title: "Somebody else's carbonara",
        tags: [],
        searchText: "somebody",
        embedding: ON_TOPIC,
        embeddingVersion: CURRENT_EMBEDDING_VERSION,
      });
    });

    await t.action(internal.ai.recommendForSpace, { spaceId });

    expect(promptedTitles()).toEqual(["Carbonara"]);
  });
});
