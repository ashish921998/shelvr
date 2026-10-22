import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import recorded from "../testdata/settlement/rows.json";
import { EMBEDDING_DIMENSIONS } from "./embedding";
import { completionPatch, type ItemPatch } from "./settlement";
import {
  consentOf,
  gridArgs,
  itemFields,
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

function savedItem(fields: Partial<Doc<"items">> = {}): Doc<"items"> {
  return {
    _id: "item" as Id<"items">,
    _creationTime: 0,
    userId: "owner" as Id<"users">,
    type: "link",
    status: "failed",
    tags: [],
    searchText: "",
    ...fields,
  };
}

describe("a run without the model", () => {
  const saved = { ingredients: ["saved ingredient"], steps: ["saved step"] };
  const page = { ingredients: ["page ingredient"], steps: ["page step"] };

  it("keeps the recipe the save already has when the page offers none", () => {
    const patch = completionPatch(
      savedItem({ recipe: saved }),
      { reading: {} },
      true,
    );
    expect(patch.recipe).toEqual(saved);
  });

  it("takes the page's recipe when the page offers one", () => {
    const patch = completionPatch(
      savedItem({ recipe: saved }),
      { reading: { recipe: page } },
      true,
    );
    expect(patch.recipe).toEqual(page);
  });
});

describe("a decline that lands at commit", () => {
  const item = savedItem({
    title: "Saved title",
    description: "Saved description",
    tags: ["saved"],
  });
  const reading = { title: "Page title", description: "Page description" };
  const classification = {
    title: "Model title",
    description: "Model description",
    tags: ["model"],
    intents: [],
    cities: ["Paris"],
    embedding: Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.25),
  };

  it.each(
    SCENARIOS.filter((s) => s.mode === "late").map((s) => [s.id, s] as const),
  )("settles %s like a decline that came earlier", (_id, s) => {
    const saved = seeded(s);
    expect(completionPatch(saved, gridArgs(s, saved, ids), false)).toEqual(
      completionPatch(
        saved,
        gridArgs({ ...s, mode: "early" }, saved, ids),
        false,
      ),
    );
  });

  it("shows what Shelvr read and none of the model's words", () => {
    const patch = completionPatch(item, { reading, classification }, false);
    expect(patch).toMatchObject({
      title: "Page title",
      description: "Page description",
      tags: ["saved"],
    });
    expect(patch.cities).toBeUndefined();
    expect(patch.embeddingVersion).toBeUndefined();
  });
});

describe("completionPatch", () => {
  it("replays exactly the scenarios the database pass recorded", () => {
    expect(Object.keys(rows).sort()).toEqual(SCENARIOS.map((s) => s.id).sort());
  });

  it.each(SCENARIOS.map((s) => [s.id, s] as const))("settles %s", (_id, s) => {
    const item = seeded(s);
    const args = { itemId: item._id, ...gridArgs(s, item, ids) };
    const patch = completionPatch(item, args, consentOf(s.mode) === "granted");
    expect(snapshotRow(patched(item, patch), ids)).toEqual(rows[s.id]);
  });
});
