// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { expect, it } from "vitest";
import type { WithoutSystemFields } from "convex/server";
import type { TestConvexForDataModel } from "convex-test";
import { internal } from "./_generated/api";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { PROCESSING_STALE_MS } from "./model/itemFields";
import { newConvexTest } from "./test.setup";

type T = TestConvexForDataModel<DataModel>;

const RUN_ID = "run-1";

const EARLIER_RUN = {
  title: "Old title",
  description: "Old description",
  content: "Old content",
};

// reprocessItem clears failureReason and enrichment, so a retry looks the same
// whether the save had failed or settled partial before.
const BEFORES = {
  fresh: { status: "processing" },
  retried: { status: "processing", ...EARLIER_RUN },
  settled: { status: "ready", ...EARLIER_RUN },
  settledPartial: { status: "ready", ...EARLIER_RUN, enrichment: "partial" },
  sweptFirst: { status: "failed", ...EARLIER_RUN, failureReason: "error" },
} as const;

type Before = keyof typeof BEFORES;

const REASONS = ["not_found", "error", "image_too_large"] as const;
const AGES = { stale: PROCESSING_STALE_MS + 60_000, recent: 60_000 };

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

async function snapshotRow(
  t: T,
  itemId: Id<"items">,
  outcome?: string,
): Promise<Record<string, unknown>> {
  const { item, jobs } = await t.run(async (ctx) => ({
    item: await ctx.db.get(itemId),
    jobs: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
  if (item === null) throw new Error("grid item vanished");
  const telemetry = jobs
    .filter(
      (job) =>
        job.name === "analytics:captureItemProcessed" &&
        job.args[0].itemId === itemId,
    )
    .map((job) => `${job.args[0].outcome}:${job.args[0].failureReason}`);
  return {
    ...(outcome !== undefined ? { outcome } : {}),
    status: item.status,
    failureReason: item.failureReason ?? null,
    enrichment: item.enrichment ?? null,
    title: item.title ?? null,
    description: item.description ?? null,
    content: item.content ?? null,
    processingRunId: item.processingRunId ?? null,
    telemetry,
  };
}

//   pnpm --filter native-app exec vitest run convex/failItem.grid.test.ts -u
// The path must come before -u, which would otherwise take it as its value and
// update every snapshot in the repo.
it("fails every grid scenario as recorded", async () => {
  const t = newConvexTest();
  const userId = await t.run((ctx) => ctx.db.insert("users", {}));
  const insert = (before: Before, age = AGES.recent) =>
    t.run((ctx) => ctx.db.insert("items", itemFields(before, userId, age)));

  const table: Record<string, Record<string, unknown>> = {};
  for (const before of Object.keys(BEFORES) as Before[]) {
    for (const reason of REASONS) {
      for (const run of ["own", "superseded"] as const) {
        const itemId = await insert(before);
        const outcome = await t.mutation(internal.items.failItem, {
          itemId,
          reason,
          runId: run === "own" ? RUN_ID : "run-superseded",
        });
        table[`failItem/${before}/${reason}/${run}`] = await snapshotRow(
          t,
          itemId,
          outcome,
        );
      }
    }
  }
  const deleted = await insert("fresh");
  await t.run((ctx) => ctx.db.delete(deleted));
  table["failItem/missing"] = {
    outcome: await t.mutation(internal.items.failItem, {
      itemId: deleted,
      reason: "error",
      runId: RUN_ID,
    }),
  };

  const swept: [string, Id<"items">][] = [];
  for (const before of Object.keys(BEFORES) as Before[]) {
    for (const [age, ms] of Object.entries(AGES)) {
      swept.push([`cron/${before}/${age}`, await insert(before, ms)]);
    }
  }
  await t.mutation(internal.items.failStaleProcessingItems, {});
  for (const [id, itemId] of swept) {
    table[id] = await snapshotRow(t, itemId);
  }

  const lines = Object.entries(table).map(
    ([id, row]) => `  ${JSON.stringify(id)}: ${JSON.stringify(row)}`,
  );
  await expect(`{\n${lines.join(",\n")}\n}\n`).toMatchFileSnapshot(
    "./testdata/settlement/failure-rows.json",
  );
});
