// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { expect, it } from "vitest";
import type { TestConvexForDataModel } from "convex-test";
import { internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { AI_CONSENT_VERSION } from "./model/aiConsent";
import {
  consentOf,
  gridArgs,
  itemFields,
  SCENARIOS,
  snapshotRow,
} from "./model/settlement.grid";
import { newConvexTest } from "./test.setup";

type T = TestConvexForDataModel<DataModel>;

async function load(t: T, itemId: Id<"items">) {
  const item = await t.run((ctx) => ctx.db.get(itemId));
  if (item === null) throw new Error("grid item vanished");
  return item;
}

//   pnpm --filter native-app exec vitest run convex/finalizeItem.grid.test.ts -u
// The path must come before -u, which would otherwise take it as its value and
// update every snapshot in the repo.
it("settles every grid scenario as recorded", async () => {
  const t = newConvexTest();
  const { ids, owners } = await t.run(async (ctx) => {
    const blob = (text: string) => ctx.storage.store(new Blob([text]));
    const granted = await ctx.db.insert("users", {});
    const declined = await ctx.db.insert("users", {});
    for (const [userId, status] of [
      [granted, "granted"],
      [declined, "declined"],
    ] as const) {
      await ctx.db.insert("aiConsents", {
        userId,
        status,
        version: AI_CONSENT_VERSION,
        updatedAt: 1,
      });
    }
    return {
      ids: {
        poster: await blob("old poster"),
        newPoster: await blob("new poster"),
        image: await blob("image"),
      },
      owners: { granted, declined },
    };
  });

  const table: Record<string, Record<string, unknown>> = {};
  for (const s of SCENARIOS) {
    const itemId = await t.run((ctx) =>
      ctx.db.insert("items", itemFields(s, ids, owners[consentOf(s.mode)])),
    );
    const args = gridArgs(s, await load(t, itemId), ids);
    expect(
      await t.mutation(internal.items.finalizeItem, { itemId, ...args }),
      s.id,
    ).toBe("applied");
    table[s.id] = snapshotRow(await load(t, itemId), ids);
  }

  const lines = Object.entries(table).map(
    ([id, row]) => `  ${JSON.stringify(id)}: ${JSON.stringify(row)}`,
  );
  await expect(`{\n${lines.join(",\n")}\n}\n`).toMatchFileSnapshot(
    "./testdata/settlement/rows.json",
  );
});
