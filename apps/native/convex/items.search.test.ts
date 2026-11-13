// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

import type { TestConvexForDataModel } from "convex-test";
import { newConvexTest, signedInUser } from "./test.setup";

import { api, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";

type TestCtx = TestConvexForDataModel<DataModel>;

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
