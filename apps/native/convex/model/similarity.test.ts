import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import { RECALL_MIN_AGE_MS } from "./recallAge";
import {
  hasSimilarSignal,
  rankSimilar,
  SIMILAR_LIMIT,
  similarSearchTerms,
  tagSearchWords,
} from "./similarity";

const NOW = 1_800_000_000_000;

function save(id: string, fields: Partial<Doc<"items">> = {}): Doc<"items"> {
  return {
    _id: id as Id<"items">,
    _creationTime: NOW,
    userId: "user",
    type: "link",
    status: "ready",
    tags: [],
    searchText: "",
    ...fields,
  };
}

const ids = (saves: Doc<"items">[]) => saves.map((match) => match._id);

describe("tagSearchWords", () => {
  it("keeps short tag words but drops filler from multi-word tags", () => {
    expect(tagSearchWords("art")).toEqual(["art"]);
    expect(tagSearchWords("ux")).toEqual(["ux"]);
    expect(tagSearchWords("how to")).toEqual([]);
    expect(tagSearchWords("to do lists")).toEqual(["do", "lists"]);
  });
});

describe("similarSearchTerms", () => {
  it("puts tag words before title words, without repeats", () => {
    const item = save("a", {
      title: "Brass floor lamp brass",
      tags: ["lighting", "floor lamp"],
    });
    expect(similarSearchTerms(item)).toEqual([
      "lighting",
      "floor",
      "lamp",
      "brass",
    ]);
  });

  it("stops at the 16 terms a Convex full-text query allows", () => {
    const tags = Array.from({ length: 20 }, (_, i) => `tag${i}`);
    expect(similarSearchTerms(save("a", { tags }))).toHaveLength(16);
  });

  it("keeps two-character words in non-Latin titles", () => {
    expect(similarSearchTerms(save("a", { title: "真鍮 ランプ" }))).toEqual([
      "真鍮",
      "ランプ",
    ]);
  });
});

describe("hasSimilarSignal", () => {
  it("is false for a save with no tags and only short words", () => {
    expect(hasSimilarSignal(save("a", { title: "a to do" }))).toBe(false);
  });

  it("is true for a tag or a significant word", () => {
    expect(hasSimilarSignal(save("a", { tags: ["x"] }))).toBe(true);
    expect(hasSimilarSignal(save("a", { note: "watercolour" }))).toBe(true);
  });
});

describe("rankSimilar", () => {
  const item = save("item", {
    title: "Watercolour washes",
    tags: ["art", "diy"],
  });

  it("scores three per shared tag and one per shared word, best first", () => {
    const oneTag = save("one-tag", { tags: ["art"] });
    const twoTags = save("two-tags", { tags: ["art", "diy"] });
    const words = save("words", {
      title: "Watercolour washes",
      description: "watercolour",
      tags: ["painting"],
    });
    expect(ids(rankSimilar(item, [oneTag, words, twoTags]))).toEqual([
      "two-tags",
      "one-tag",
    ]);
  });

  it("drops a candidate under three points", () => {
    const twoWords = save("two-words", { title: "Watercolour washes" });
    expect(rankSimilar(item, [twoWords])).toEqual([]);
  });

  it("skips the save itself and saves that are not ready", () => {
    const processing = save("processing", {
      status: "processing",
      tags: ["art", "diy"],
    });
    expect(rankSimilar(item, [item, processing])).toEqual([]);
  });

  it("reserves up to three places for older saves", () => {
    const old = NOW - RECALL_MIN_AGE_MS;
    const strong = Array.from({ length: SIMILAR_LIMIT }, (_, i) =>
      save(`new-${i}`, { tags: ["art", "diy"] }),
    );
    const olderWeak = Array.from({ length: 4 }, (_, i) =>
      save(`old-${i}`, { _creationTime: old, tags: ["art"] }),
    );
    const ranked = ids(rankSimilar(item, [...strong, ...olderWeak]));
    expect(ranked).toHaveLength(SIMILAR_LIMIT);
    expect(ranked.filter((id) => id.startsWith("old-"))).toEqual([
      "old-0",
      "old-1",
      "old-2",
    ]);
    expect(ranked.slice(0, SIMILAR_LIMIT - 3)).toEqual(
      ids(strong.slice(0, SIMILAR_LIMIT - 3)),
    );
  });

  it("does not reserve a place for a save just short of the recall age", () => {
    const strong = Array.from({ length: SIMILAR_LIMIT }, (_, i) =>
      save(`new-${i}`, { tags: ["art", "diy"] }),
    );
    const almostOld = save("almost-old", {
      _creationTime: NOW - RECALL_MIN_AGE_MS + 1,
      tags: ["art"],
    });
    expect(ids(rankSimilar(item, [...strong, almostOld]))).not.toContain(
      "almost-old",
    );
  });
});
