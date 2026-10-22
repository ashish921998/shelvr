// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { newConvexTest } from "./test.setup";
import { internal } from "./_generated/api";
import {
  CURRENT_EMBEDDING_VERSION,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_SWEEP_PAGE,
  MAX_EMBEDDING_ATTEMPTS,
} from "./model/embedding";

const embedMany = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({
  embedMany,
  generateObject: vi.fn(),
  wrapLanguageModel: vi.fn(() => ({})),
}));

function unitVector(): number[] {
  const v = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  v[0] = 1;
  return v;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  embedMany.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

async function seedReady(count: number) {
  const t = newConvexTest();
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {});
    for (let i = 0; i < count; i++) {
      await ctx.db.insert("items", {
        userId,
        type: "link" as const,
        status: "ready" as const,
        title: `Save ${i}`,
        description: "Something embeddable",
        tags: ["tag"],
        searchText: `save ${i}`,
      });
    }
  });
  return t;
}

async function chainedRuns(t: Awaited<ReturnType<typeof seedReady>>) {
  const jobs = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  return jobs.filter(
    (job) => job.name === "aiEmbeddingSweep:sweepItemEmbeddings",
  );
}

describe("sweepItemEmbeddings", () => {
  it("advances past more than one page belonging to a deleting owner", async () => {
    const t = await seedReady(EMBEDDING_SWEEP_PAGE + 1);
    await t.run(async (ctx) => {
      const owner = (await ctx.db.query("users").collect())[0];
      await ctx.db.patch(owner._id, { deleting: true });
      const userId = await ctx.db.insert("users", {});
      await ctx.db.insert("items", {
        userId,
        type: "note",
        status: "ready",
        title: "Live owner's save",
        tags: [],
        searchText: "",
      });
    });
    embedMany.mockImplementation(async ({ values }) => ({
      embeddings: values.map(() => unitVector()),
    }));
    await t.action(internal.ai.sweepItemEmbeddings, {});
    await t.action(internal.ai.sweepItemEmbeddings, {});
    expect(embedMany).toHaveBeenCalledOnce();
    expect(embedMany.mock.calls[0][0].values).toEqual(["Live owner's save"]);
    const rows = await t.run((ctx) => ctx.db.query("items").collect());
    expect(
      rows.every((row) => row.embeddingVersion === CURRENT_EMBEDDING_VERSION),
    ).toBe(true);
    expect(rows.filter((row) => row.embedding !== undefined)).toHaveLength(1);
  });

  it("advances past more than one page whose owner row is missing", async () => {
    const t = await seedReady(EMBEDDING_SWEEP_PAGE + 1);
    await t.run(async (ctx) => {
      const owner = (await ctx.db.query("users").collect())[0];
      await ctx.db.delete(owner._id);
      const userId = await ctx.db.insert("users", {});
      await ctx.db.insert("items", {
        userId,
        type: "note",
        status: "ready",
        title: "Live owner's save",
        tags: [],
        searchText: "",
      });
    });
    embedMany.mockImplementation(async ({ values }) => ({
      embeddings: values.map(() => unitVector()),
    }));
    await t.action(internal.ai.sweepItemEmbeddings, {});
    await t.action(internal.ai.sweepItemEmbeddings, {});
    expect(embedMany).toHaveBeenCalledOnce();
    expect(embedMany.mock.calls[0][0].values).toEqual(["Live owner's save"]);
    const rows = await t.run((ctx) => ctx.db.query("items").collect());
    expect(
      rows.every((row) => row.embeddingVersion === CURRENT_EMBEDDING_VERSION),
    ).toBe(true);
  });

  it("embeds a page, stamps it, and chains while there is more to do", async () => {
    const t = await seedReady(EMBEDDING_SWEEP_PAGE + 1);
    embedMany.mockImplementation(async ({ values }) => ({
      embeddings: values.map(() => unitVector()),
    }));

    const result = await t.action(internal.ai.sweepItemEmbeddings, {});

    expect(result).toEqual({
      scanned: EMBEDDING_SWEEP_PAGE,
      written: EMBEDDING_SWEEP_PAGE,
    });
    expect(await chainedRuns(t)).toHaveLength(1);
  });

  it("does not chain once the range is drained", async () => {
    const t = await seedReady(2);
    embedMany.mockImplementation(async ({ values }) => ({
      embeddings: values.map(() => unitVector()),
    }));

    await t.action(internal.ai.sweepItemEmbeddings, {});

    expect(await chainedRuns(t)).toHaveLength(0);
    expect(
      await t.query(internal.items.listItemsNeedingEmbeddingInternal, {
        limit: EMBEDDING_SWEEP_PAGE,
      }),
    ).toEqual([]);
  });

  it("strands nothing and does not accelerate when the provider is down", async () => {
    const t = await seedReady(EMBEDDING_SWEEP_PAGE + 1);
    embedMany.mockRejectedValue(new Error("provider down"));

    const result = await t.action(internal.ai.sweepItemEmbeddings, {});

    expect(result.written).toBe(0);
    expect(await chainedRuns(t)).toHaveLength(0);

    const rows = await t.run((ctx) => ctx.db.query("items").collect());
    for (const row of rows) {
      expect(row.embeddingVersion).toBeUndefined();
      expect(row.embeddingAttempts).toBeUndefined();
    }
  });

  it("spends an attempt when the provider answers with nothing usable", async () => {
    const t = await seedReady(3);
    embedMany.mockImplementation(async ({ values }: { values: string[] }) => ({
      embeddings: values.map(() => [1, 2, 3]),
    }));

    const result = await t.action(internal.ai.sweepItemEmbeddings, {});

    expect(result.written).toBe(0);
    const rows = await t.run((ctx) => ctx.db.query("items").collect());
    for (const row of rows) {
      expect(row.embeddingAttempts).toBe(1);
      expect(row.embeddingVersion).toBeUndefined();
    }
  });

  it("stamps a permanently unembeddable item once it hits the cap", async () => {
    const t = await seedReady(1);
    embedMany.mockImplementation(async ({ values }: { values: string[] }) => ({
      embeddings: values.map(() => [1, 2, 3]),
    }));

    for (let run = 0; run < MAX_EMBEDDING_ATTEMPTS; run++) {
      await t.action(internal.ai.sweepItemEmbeddings, {});
    }

    const [row] = await t.run((ctx) => ctx.db.query("items").collect());
    expect(row.embeddingAttempts).toBe(MAX_EMBEDDING_ATTEMPTS);
    expect(row.embeddingVersion).toBe(CURRENT_EMBEDDING_VERSION);
    expect(row.embedding).toBeUndefined();
    expect(
      await t.query(internal.items.listItemsNeedingEmbeddingInternal, {
        limit: EMBEDDING_SWEEP_PAGE,
      }),
    ).toHaveLength(0);
  });

  it("recovers the whole page once the provider comes back", async () => {
    const t = await seedReady(3);
    embedMany.mockRejectedValueOnce(new Error("provider down"));

    await t.action(internal.ai.sweepItemEmbeddings, {});
    expect(
      await t.query(internal.items.listItemsNeedingEmbeddingInternal, {
        limit: EMBEDDING_SWEEP_PAGE,
      }),
    ).toHaveLength(3);

    embedMany.mockImplementation(async ({ values }) => ({
      embeddings: values.map(() => unitVector()),
    }));
    const result = await t.action(internal.ai.sweepItemEmbeddings, {});

    expect(result.written).toBe(3);
    const rows = await t.run((ctx) => ctx.db.query("items").collect());
    for (const row of rows) {
      expect(row.embeddingVersion).toBe(CURRENT_EMBEDDING_VERSION);
    }
  });

  it("does no provider call and no work when the range is empty", async () => {
    const t = newConvexTest();

    expect(await t.action(internal.ai.sweepItemEmbeddings, {})).toEqual({
      scanned: 0,
      written: 0,
    });
    expect(embedMany).not.toHaveBeenCalled();
  });

  it("finishes items with no embeddable text without calling the provider", async () => {
    const t = newConvexTest();
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {});
      await ctx.db.insert("items", {
        userId,
        type: "image" as const,
        status: "ready" as const,
        tags: [],
        searchText: "",
      });
    });

    const result = await t.action(internal.ai.sweepItemEmbeddings, {});

    expect(result).toEqual({ scanned: 1, written: 0 });
    expect(embedMany).not.toHaveBeenCalled();
    expect(
      await t.query(internal.items.listItemsNeedingEmbeddingInternal, {
        limit: EMBEDDING_SWEEP_PAGE,
      }),
    ).toEqual([]);
  });
});
