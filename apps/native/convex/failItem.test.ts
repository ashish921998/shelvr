// @vitest-environment edge-runtime
import { expect, it } from "vitest";
import type { WithoutSystemFields } from "convex/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { PROCESSING_STALE_MS } from "./model/itemFields";
import { failurePatch } from "./model/settlement";
import { newConvexTest, type TestBackend } from "./test.setup";

const RUN_ID = "run-1";
const REASONS = ["not_found", "error", "image_too_large"] as const;
const STALE = PROCESSING_STALE_MS + 60_000;

const EARLIER_RUN = {
  title: "Old title",
  description: "Old description",
  content: "Old content",
};

// reprocessItem clears failureReason and enrichment, so a retry looks the same
// whether the save had failed or settled partial before.
const BEFORES = {
  retried: { status: "processing", ...EARLIER_RUN },
  sweptFirst: { status: "failed", ...EARLIER_RUN, failureReason: "error" },
  settled: { status: "ready", ...EARLIER_RUN },
  settledPartial: { status: "ready", ...EARLIER_RUN, enrichment: "partial" },
} as const;

type Before = keyof typeof BEFORES;

const UNSETTLED = ["retried", "sweptFirst"] as const;
const SETTLED = ["settled", "settledPartial"] as const;

function itemFields(
  before: Before,
  userId: Id<"users">,
  age: number,
): WithoutSystemFields<Doc<"items">> {
  return {
    userId,
    type: "link",
    url: "https://example.com/saved",
    tags: [],
    searchText: "",
    processingRunId: RUN_ID,
    processingStartedAt: Date.now() - age,
    ...BEFORES[before],
  };
}

async function seed(t: TestBackend, before: Before, age = 60_000) {
  const userId = await t.run((ctx) => ctx.db.insert("users", {}));
  const itemId = await t.run((ctx) =>
    ctx.db.insert("items", itemFields(before, userId, age)),
  );
  const item = await t.run((ctx) => ctx.db.get(itemId));
  return { itemId, item: item! };
}

/** "failed:not_found" per processed event scheduled for the save. */
async function telemetry(t: TestBackend, itemId: Id<"items">) {
  const jobs = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  return jobs
    .filter(
      (job) =>
        job.name === "analytics:captureItemProcessed" &&
        job.args[0].itemId === itemId,
    )
    .map((job) => `${job.args[0].outcome}:${job.args[0].failureReason}`);
}

it("writes only how the run ended and keeps what earlier runs gave the save", async () => {
  const t = newConvexTest();
  for (const before of UNSETTLED) {
    for (const reason of REASONS) {
      const { itemId, item } = await seed(t, before);
      const outcome = await t.mutation(internal.items.failItem, {
        itemId,
        reason,
        runId: RUN_ID,
      });
      expect(outcome, `${before}/${reason}`).toBe("applied");
      expect(await t.run((ctx) => ctx.db.get(itemId))).toEqual({
        ...item,
        status: "failed",
        failureReason: reason,
      });
      expect(await telemetry(t, itemId)).toEqual([`failed:${reason}`]);
    }
  }
});

it("leaves a save alone once its run settled it ready", async () => {
  const t = newConvexTest();
  for (const before of SETTLED) {
    for (const reason of REASONS) {
      const { itemId, item } = await seed(t, before);
      expect(failurePatch(item, reason), `${before}/${reason}`).toBeNull();
      const outcome = await t.mutation(internal.items.failItem, {
        itemId,
        reason,
        runId: RUN_ID,
      });
      expect(outcome, `${before}/${reason}`).toBe("settled");
      expect(await t.run((ctx) => ctx.db.get(itemId))).toEqual(item);
      expect(await telemetry(t, itemId)).toEqual([]);
    }
  }
});

it("ignores a superseded run whatever the save's state", async () => {
  const t = newConvexTest();
  for (const before of Object.keys(BEFORES) as Before[]) {
    const { itemId, item } = await seed(t, before);
    const outcome = await t.mutation(internal.items.failItem, {
      itemId,
      reason: "error",
      runId: "run-superseded",
    });
    expect(outcome, before).toBe("stale_run");
    expect(await t.run((ctx) => ctx.db.get(itemId))).toEqual(item);
    expect(await telemetry(t, itemId)).toEqual([]);
  }
});

it("reports a deleted save as missing", async () => {
  const t = newConvexTest();
  const { itemId } = await seed(t, "retried");
  await t.run((ctx) => ctx.db.delete(itemId));
  const outcome = await t.mutation(internal.items.failItem, {
    itemId,
    reason: "error",
    runId: RUN_ID,
  });
  expect(outcome).toBe("missing");
  expect(await telemetry(t, itemId)).toEqual([]);
});

it("sweeps only stale processing saves, as an error", async () => {
  const t = newConvexTest();
  const stale = await seed(t, "retried", STALE);
  const untouched = [
    await seed(t, "retried"),
    await seed(t, "settled", STALE),
    await seed(t, "sweptFirst", STALE),
  ];
  expect(await t.mutation(internal.items.failStaleProcessingItems, {})).toEqual(
    { failed: 1, scanned: 1 },
  );
  expect(await t.run((ctx) => ctx.db.get(stale.itemId))).toEqual({
    ...stale.item,
    status: "failed",
    failureReason: "error",
  });
  expect(await telemetry(t, stale.itemId)).toEqual(["failed:error"]);
  for (const { itemId, item } of untouched) {
    expect(await t.run((ctx) => ctx.db.get(itemId))).toEqual(item);
    expect(await telemetry(t, itemId)).toEqual([]);
  }
});
