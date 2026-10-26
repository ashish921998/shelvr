// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { beforeEach, describe, expect, it, vi } from "vitest";

import { newConvexTest, insertConsentingUser } from "./test.setup";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  CURRENT_EMBEDDING_VERSION,
  EMBEDDING_DIMENSIONS,
  MAX_HYDRATE_READ_BYTES,
} from "./model/embedding";

const embedMany = vi.hoisted(() => vi.fn());
const generateObject = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({
  embedMany,
  generateObject,
  wrapLanguageModel: vi.fn(() => ({})),
}));

function vec(components: Record<number, number>): number[] {
  const v = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  for (const [index, value] of Object.entries(components)) {
    v[Number(index)] = value;
  }
  return v;
}

const ON_TOPIC = vec({ 0: 1 });
const NEARBY = vec({ 0: 0.8, 1: 0.6 });
const OFF_TOPIC = vec({ 1: 1 });

let USER: string;

type SeedItem = {
  title: string;
  embedding?: number[];
  status?: "ready" | "failed" | "processing";
  content?: string;
};

// convex-test vectorSearch throws on rows with no vector field; real Convex skips them.
async function seed(items: SeedItem[]) {
  const t = newConvexTest();
  const ids = await t.run(async (ctx) => {
    USER = await insertConsentingUser(ctx);
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

  it("fills the whole candidate budget from the ranking alone", async () => {
    const shelf = Array.from({ length: 101 }, (_, index) => ({
      title: `Save ${index}`,
      embedding: vec({ 0: 1 - index * 0.001, 1: index * 0.001 }),
    }));
    const { t, spaceId } = await seed(shelf);

    await t.action(internal.ai.recommendForSpace, { spaceId });

    const prompted = promptedTitles();
    expect(prompted).toHaveLength(100);
    expect(prompted[0]).toBe("Save 0");
    expect(prompted[99]).toBe("Save 99");
    expect(prompted).not.toContain("Save 100");
  });

  it("fills a short ranked list out with recent items", async () => {
    const half = "x".repeat(Math.ceil(MAX_HYDRATE_READ_BYTES / 2) + 1);
    const { t, spaceId } = await seed([
      { title: "Carbonara", embedding: ON_TOPIC, content: half },
      { title: "Pesto", embedding: NEARBY, content: half },
      { title: "Kubernetes", embedding: OFF_TOPIC },
    ]);

    await t.action(internal.ai.recommendForSpace, { spaceId });

    expect(promptedTitles()).toEqual(["Carbonara", "Pesto", "Kubernetes"]);
  });

  it("does not repeat an item that the ranked half already supplied", async () => {
    const { t, spaceId } = await seed([
      { title: "Carbonara", embedding: ON_TOPIC },
      { title: "Pesto", embedding: NEARBY },
    ]);

    await t.action(internal.ai.recommendForSpace, { spaceId });

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
