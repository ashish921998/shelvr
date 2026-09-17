// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { newConvexTest } from "./test.setup";
import { internal } from "./_generated/api";
import {
  CURRENT_EMBEDDING_VERSION,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_SWEEP_PAGE,
} from "./model/embedding";

const embedMany = vi.hoisted(() => vi.fn());

// The sweep action runs the real pipeline code end to end; only the provider
// call is replaced. `ai.ts` builds its language model at import, so
// wrapLanguageModel has to be stubbed too.
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

// convex-test runs `runAfter(0, ...)` through a real setTimeout, which would
// fire during teardown. Fake timers keep the rows assertable without executing.
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
    for (let i = 0; i < count; i++) {
      await ctx.db.insert("items", {
        userId: "sweeper",
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
  return jobs.filter((job) => job.name === "ai:sweepItemEmbeddings");
}

describe("sweepItemEmbeddings", () => {
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
    // The failure this guards: stamping on a provider error would march the
    // whole table, marking every item as embedded with no vector, and chaining
    // at full speed while doing it. Nothing would ever revisit those rows.
    const t = await seedReady(EMBEDDING_SWEEP_PAGE + 1);
    embedMany.mockRejectedValue(new Error("provider down"));

    const result = await t.action(internal.ai.sweepItemEmbeddings, {});

    expect(result.written).toBe(0);
    expect(await chainedRuns(t)).toHaveLength(0);

    const rows = await t.run((ctx) => ctx.db.query("items").collect());
    for (const row of rows) {
      expect(row.embeddingVersion).toBeUndefined();
      // An outage is not the item's fault, so it costs no attempt either.
      expect(row.embeddingAttempts).toBeUndefined();
    }
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
      await ctx.db.insert("items", {
        userId: "sweeper",
        type: "image" as const,
        status: "ready" as const,
        tags: [],
        searchText: "",
      });
    });

    const result = await t.action(internal.ai.sweepItemEmbeddings, {});

    expect(result).toEqual({ scanned: 1, written: 0 });
    expect(embedMany).not.toHaveBeenCalled();
    // Stamped anyway, so the sweep drains rather than spinning on it.
    expect(
      await t.query(internal.items.listItemsNeedingEmbeddingInternal, {
        limit: EMBEDDING_SWEEP_PAGE,
      }),
    ).toEqual([]);
  });
});
