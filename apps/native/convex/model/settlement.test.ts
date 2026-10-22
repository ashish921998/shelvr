import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import recorded from "../testdata/settlement/rows.json";
import { completionPatch, type ItemPatch } from "./settlement";
import {
  consentOf,
  itemFields,
  legacyArgs,
  SCENARIOS,
  snapshotRow,
  type GridIds,
  type Scenario,
} from "./settlement.grid";

const ids: GridIds = {
  poster: "poster" as Id<"_storage">,
  newPoster: "newPoster" as Id<"_storage">,
  image: "image" as Id<"_storage">,
};

const rows: Record<string, unknown> = recorded;

function seeded(s: Scenario): Doc<"items"> {
  return {
    _id: "item" as Id<"items">,
    _creationTime: 0,
    ...itemFields(s, ids, "owner" as Id<"users">),
  };
}

function patched(item: Doc<"items">, patch: ItemPatch): Doc<"items"> {
  const next: Record<string, unknown> = { ...item };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  return next as Doc<"items">;
}

describe("completionPatch", () => {
  it("replays exactly the scenarios the database pass recorded", () => {
    expect(Object.keys(rows).sort()).toEqual(SCENARIOS.map((s) => s.id).sort());
  });

  it.each(SCENARIOS.map((s) => [s.id, s] as const))("settles %s", (_id, s) => {
    const item = seeded(s);
    const args = { itemId: item._id, ...legacyArgs(s, item, ids) };
    const patch = completionPatch(item, args, consentOf(s.mode) === "granted");
    expect(snapshotRow(patched(item, patch), ids)).toEqual(rows[s.id]);
  });
});
