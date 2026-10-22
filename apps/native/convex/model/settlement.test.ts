import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import recorded from "../testdata/settlement/rows.json";
import { CURRENT_EMBEDDING_VERSION, EMBEDDING_DIMENSIONS } from "./embedding";
import {
  completionPatch,
  embeddingText,
  runOf,
  type ItemPatch,
} from "./settlement";
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
    embedding: {
      text: "any text",
      vector: Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.25),
    },
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

describe("the embedding a run brings", () => {
  const reading = { siteName: "Example", content: "Body text" };
  const classification = {
    title: "Soup",
    description: "A soup",
    tags: ["food"],
  };
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.25);

  function lands(item: Doc<"items">, text: string): boolean {
    const patch = completionPatch(
      item,
      {
        reading,
        classification: { ...classification, embedding: { text, vector } },
      },
      true,
    );
    return patch.embeddingVersion === CURRENT_EMBEDDING_VERSION;
  }

  it("embeds the title, description, tags, site and body the save settles to", () => {
    expect(embeddingText(savedItem(), { reading, classification })).toBe(
      "Soup\nA soup\nfood\nExample\n\nBody text",
    );
  });

  it("embeds the note a save holds in place of a page body", () => {
    const note = savedItem({ type: "note", note: "Buy lentils" });
    expect(embeddingText(note, { reading: {}, classification })).toBe(
      "Soup\nA soup\nfood\n\nBuy lentils",
    );
  });

  it("embeds the typed title a save keeps", () => {
    const typed = savedItem({ title: "My soup", titleSource: "user" });
    expect(embeddingText(typed, { reading, classification })).toMatch(
      /^My soup\n/,
    );
  });

  it("lands a vector computed from the text the save settles to", () => {
    const item = savedItem();
    expect(lands(item, embeddingText(item, { reading, classification }))).toBe(
      true,
    );
  });

  it("drops a vector computed before the user typed a title", () => {
    const before = embeddingText(savedItem(), { reading, classification });
    const typed = savedItem({ title: "My soup", titleSource: "user" });
    expect(lands(typed, before)).toBe(false);
  });
});

describe("flat arguments from an action started on the previous deploy", () => {
  const item = savedItem({
    title: "Saved title",
    description: "Saved description",
    tags: ["saved"],
    recipe: { ingredients: ["saved ingredient"], steps: ["saved step"] },
  });
  const classified = {
    title: "Model title",
    description: "Model description",
    tags: ["model"],
    recipe: { ingredients: ["model ingredient"], steps: ["model step"] },
    embedding: Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.25),
    classified: true,
    status: "ready" as const,
  };

  it("settles a classified run like the new arguments", () => {
    expect(completionPatch(item, runOf(classified), true)).toEqual(
      completionPatch(
        item,
        {
          reading: {},
          classification: {
            title: "Model title",
            description: "Model description",
            tags: ["model"],
            recipe: classified.recipe,
          },
        },
        true,
      ),
    );
  });

  it("keeps the save's own words when the decline lands at commit", () => {
    expect(completionPatch(item, runOf(classified), false)).toMatchObject({
      title: "Saved title",
      description: "Saved description",
      tags: ["saved"],
      recipe: item.recipe,
    });
  });

  it("settles an unclassified run from what it read", () => {
    const patch = completionPatch(
      item,
      runOf({ title: "Page title", description: "Page description" }),
      true,
    );
    expect(patch).toMatchObject({
      title: "Page title",
      description: "Page description",
      tags: ["saved"],
    });
  });

  it("leaves the save for the embedding sweep", () => {
    expect(
      completionPatch(item, runOf(classified), true).embeddingVersion,
    ).toBeUndefined();
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
