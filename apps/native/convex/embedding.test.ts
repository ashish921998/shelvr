import { describe, expect, it } from "vitest";

import {
  buildEmbeddingText,
  CURRENT_EMBEDDING_VERSION,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_SWEEP_PAGE,
  isValidEmbedding,
  MAX_EMBED_CHARS,
  normalizeEmbedding,
} from "./model/embedding";

function magnitude(vector: number[]): number {
  return Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0));
}

describe("buildEmbeddingText", () => {
  it("leads with the classifier's summary so truncation costs the body tail", () => {
    const text = buildEmbeddingText({
      title: "Searing meat",
      description: "Why the crust is not about moisture",
      tags: ["cooking", "science"],
      siteName: "Serious Eats",
      content: "The body of the article.",
    });
    const lines = text.split("\n").filter(Boolean);
    expect(lines[0]).toBe("Searing meat");
    expect(lines[1]).toBe("Why the crust is not about moisture");
    expect(lines[2]).toBe("cooking, science");
    expect(lines[3]).toBe("Serious Eats");
    expect(lines.at(-1)).toBe("The body of the article.");
  });

  it("truncates to MAX_EMBED_CHARS, keeping the summary", () => {
    const text = buildEmbeddingText({
      title: "Short title",
      description: "Short description",
      tags: [],
      content: "x".repeat(MAX_EMBED_CHARS * 3),
    });
    expect(text.length).toBe(MAX_EMBED_CHARS);
    expect(text.startsWith("Short title")).toBe(true);
  });

  it("prefers a note's own words over extracted content", () => {
    const text = buildEmbeddingText({
      title: "A note",
      tags: [],
      note: "what the user typed",
      content: "an extracted article",
    });
    expect(text).toContain("what the user typed");
    expect(text).not.toContain("an extracted article");
  });

  it("returns an empty string when there is nothing worth embedding", () => {
    expect(buildEmbeddingText({ tags: [] })).toBe("");
    expect(buildEmbeddingText({ title: "   ", tags: [], content: "" })).toBe(
      "",
    );
  });

  it("ignores empty tag lists rather than emitting a blank line", () => {
    expect(buildEmbeddingText({ title: "Only a title", tags: [] })).toBe(
      "Only a title",
    );
  });
});

describe("normalizeEmbedding", () => {
  it("scales a vector to unit length", () => {
    const normalized = normalizeEmbedding([3, 4]);
    expect(magnitude(normalized)).toBeCloseTo(1, 12);
    expect(normalized).toEqual([0.6, 0.8]);
  });

  it("is a no-op on an already-unit vector", () => {
    // The model is documented to normalize its own truncated output, so this
    // is the case that runs in production: it must not perturb the vector.
    const unit = [0, 1, 0];
    expect(normalizeEmbedding(unit)).toEqual(unit);
  });

  it("returns a zero vector unchanged rather than dividing by zero", () => {
    expect(normalizeEmbedding([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it("does not mutate its input", () => {
    const input = [3, 4];
    normalizeEmbedding(input);
    expect(input).toEqual([3, 4]);
  });
});

describe("isValidEmbedding", () => {
  const good = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.01);

  it("accepts a vector of exactly the indexed width", () => {
    expect(isValidEmbedding(good)).toBe(true);
  });

  it("rejects a wrong width, which Convex would reject at write time", () => {
    expect(isValidEmbedding(good.slice(0, EMBEDDING_DIMENSIONS - 1))).toBe(
      false,
    );
    expect(isValidEmbedding([...good, 0.01])).toBe(false);
  });

  it("rejects non-finite components, which would poison comparisons", () => {
    const withNaN = [...good];
    withNaN[0] = Number.NaN;
    expect(isValidEmbedding(withNaN)).toBe(false);

    const withInfinity = [...good];
    withInfinity[5] = Number.POSITIVE_INFINITY;
    expect(isValidEmbedding(withInfinity)).toBe(false);
  });
});

describe("sweep constants", () => {
  it("keeps a page inside the provider's per-batch ceiling", () => {
    expect(EMBEDDING_SWEEP_PAGE).toBeLessThanOrEqual(100);
  });

  it("starts the generation above the absent-field sentinel", () => {
    // setEmbeddingsInternal compares `embeddingVersion ?? -1`, and the sweep
    // range is `lt(CURRENT)`, so an unstamped row must sort strictly below.
    expect(CURRENT_EMBEDDING_VERSION).toBeGreaterThan(0);
  });
});
