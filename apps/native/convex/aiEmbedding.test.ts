// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { beforeEach, describe, expect, it, vi } from "vitest";

import { internal } from "./_generated/api";
import {
  CURRENT_EMBEDDING_VERSION,
  EMBEDDING_DIMENSIONS,
} from "./model/embedding";
import { newConvexTest, signedInUser } from "./test.setup";

const embedMany = vi.hoisted(() => vi.fn());
const generateObject = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({
  embedMany,
  generateObject,
  wrapLanguageModel: vi.fn(() => ({})),
}));

const VECTOR = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.5);

describe("processItem", () => {
  beforeEach(() => {
    embedMany.mockReset();
    generateObject.mockReset();
    generateObject.mockResolvedValue({
      object: {
        title: "Model title",
        description: "Model description.",
        tags: ["model"],
        spaceNames: [],
        intents: [],
      },
    });
  });

  it("settles a save without asking the embedding model", async () => {
    const { t, userId } = await signedInUser(newConvexTest(), { pro: true });
    const itemId = await t.run((ctx) =>
      ctx.db.insert("items", {
        userId,
        type: "note",
        status: "processing",
        processingRunId: "run-1",
        processingStartedAt: Date.now(),
        note: "Buy lentils",
        tags: [],
        searchText: "",
      }),
    );

    await t.action(internal.ai.processItem, { itemId, runId: "run-1" });

    const item = await t.run((ctx) => ctx.db.get(itemId));
    expect(item).toMatchObject({ status: "ready", title: "Model title" });
    expect(item?.embedding).toBeUndefined();
    expect(item?.embeddingVersion).toBeUndefined();
    expect(embedMany).not.toHaveBeenCalled();
  });
});

describe("the retired embedding sweep", () => {
  it("does nothing if a queued run still fires", async () => {
    const t = newConvexTest();
    await expect(
      t.action(internal.aiEmbeddingSweep.sweepItemEmbeddings, {}),
    ).resolves.toEqual({ scanned: 0, written: 0 });
    expect(embedMany).not.toHaveBeenCalled();
  });
});

describe("clearEmbeddings", () => {
  async function shelf(count: number) {
    const { t, userId } = await signedInUser(newConvexTest(), { pro: true });
    await t.run(async (ctx) => {
      for (let index = 0; index < count; index++) {
        await ctx.db.insert("items", {
          userId,
          type: "link",
          status: "ready",
          title: `Save ${index}`,
          tags: [],
          searchText: `save ${index}`,
          // Every other save carries a vector; the rest carry only a stale stamp or nothing.
          ...(index % 2 === 0
            ? {
                embedding: VECTOR,
                embeddingVersion: CURRENT_EMBEDDING_VERSION,
              }
            : index % 3 === 0
              ? { embeddingAttempts: 2 }
              : {}),
        });
      }
    });
    return t;
  }

  async function leftovers(t: Awaited<ReturnType<typeof shelf>>) {
    return await t.run(async (ctx) =>
      (await ctx.db.query("items").collect()).filter(
        (item) =>
          item.embedding !== undefined ||
          item.embeddingVersion !== undefined ||
          item.embeddingAttempts !== undefined,
      ),
    );
  }

  it("removes the vector, stamp and attempts from every save across pages", async () => {
    vi.useFakeTimers();
    try {
      const t = await shelf(60);

      await t.mutation(internal.items.clearEmbeddings, { cursor: null });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      expect(await leftovers(t)).toEqual([]);
      const titles = await t.run(async (ctx) =>
        (await ctx.db.query("items").collect()).map((item) => item.title),
      );
      expect(titles).toHaveLength(60);
    } finally {
      vi.useRealTimers();
    }
  });

  it("is safe to run again", async () => {
    vi.useFakeTimers();
    try {
      const t = await shelf(5);
      await t.mutation(internal.items.clearEmbeddings, { cursor: null });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      await t.mutation(internal.items.clearEmbeddings, { cursor: null });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      expect(await leftovers(t)).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
