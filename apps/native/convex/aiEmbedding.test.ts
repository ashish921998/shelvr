// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMBEDDING_DIMENSIONS } from "./model/embedding";

const embedMany = vi.hoisted(() => vi.fn());

// `ai.ts` builds its language model at module load, so the mock has to supply
// wrapLanguageModel too — only embedMany is under test here.
vi.mock("ai", () => ({
  embedMany,
  generateObject: vi.fn(),
  wrapLanguageModel: vi.fn(() => ({})),
}));

const { embedTexts } = await import("./ai");

/** A vector of the indexed width whose components are all `fill`. */
function vector(fill: number): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, () => fill);
}

function magnitude(v: number[]): number {
  return Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
}

describe("embedTexts", () => {
  beforeEach(() => {
    embedMany.mockReset();
  });

  it("normalizes what the provider returns", async () => {
    // Deliberately un-normalized: the sibling model gemini-embedding-001 does
    // not normalize truncated output, and cosine scoring assumes unit length.
    embedMany.mockResolvedValue({ embeddings: [vector(7)] });

    const [embedding] = (await embedTexts(["something to embed"])).vectors;

    expect(embedding).toBeDefined();
    expect(magnitude(embedding!)).toBeCloseTo(1, 10);
  });

  it("keeps results aligned with the input positions", async () => {
    // Empty texts are never sent upstream, so the provider's Nth vector does
    // NOT correspond to the Nth input. Mis-mapping here would file every
    // save's vector under a different save — silently, and only visible as
    // bad recommendations much later.
    //
    // The two vectors are basis vectors so they stay distinguishable after
    // normalization; two uniform vectors would both normalize to the same
    // unit vector and the assertion would hold no matter how they were mapped.
    const firstAxis = vector(0);
    firstAxis[0] = 5;
    const secondAxis = vector(0);
    secondAxis[1] = 5;
    embedMany.mockResolvedValue({ embeddings: [firstAxis, secondAxis] });

    const { vectors: result } = await embedTexts(["first", "", "second", ""]);

    expect(embedMany).toHaveBeenCalledTimes(1);
    expect(embedMany.mock.calls[0][0].values).toEqual(["first", "second"]);
    expect(result[1]).toBeUndefined();
    expect(result[3]).toBeUndefined();
    // Each vector landed in its own text's slot, not the provider's ordinal.
    expect(result[0]?.[0]).toBeCloseTo(1, 10);
    expect(result[0]?.[1]).toBeCloseTo(0, 10);
    expect(result[2]?.[0]).toBeCloseTo(0, 10);
    expect(result[2]?.[1]).toBeCloseTo(1, 10);
  });

  it("never calls the provider when every text is empty", async () => {
    const { vectors: result } = await embedTexts(["", ""]);

    expect(embedMany).not.toHaveBeenCalled();
    expect(result).toEqual([undefined, undefined]);
  });

  it("requests the indexed width, so stored vectors match the index", async () => {
    embedMany.mockResolvedValue({ embeddings: [vector(1)] });

    await embedTexts(["text"]);

    const options = embedMany.mock.calls[0][0];
    expect(options.providerOptions.google.outputDimensionality).toBe(
      EMBEDDING_DIMENSIONS,
    );
    // Stored vectors are the corpus side of an asymmetric pairing.
    expect(options.providerOptions.google.taskType).toBe("RETRIEVAL_DOCUMENT");
    expect(options.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("drops a wrong-width vector instead of failing the write", async () => {
    // Convex rejects a vector whose width differs from the index's dimensions.
    // Letting one through would fail the whole classification transaction
    // over a field that is optional by design.
    embedMany.mockResolvedValue({
      embeddings: [vector(1).slice(0, EMBEDDING_DIMENSIONS - 1)],
    });

    expect(await embedTexts(["text"])).toEqual({
      vectors: [undefined],
      callFailed: false,
    });
  });

  it("drops a vector carrying a non-finite component", async () => {
    const poisoned = vector(1);
    poisoned[0] = Number.NaN;
    embedMany.mockResolvedValue({ embeddings: [poisoned] });

    expect(await embedTexts(["text"])).toEqual({
      vectors: [undefined],
      callFailed: false,
    });
  });

  it("resolves instead of throwing when the provider fails", async () => {
    // The contract the whole design rests on: an embedding failure must never
    // cost the user their save.
    embedMany.mockRejectedValue(new Error("provider exploded"));

    await expect(embedTexts(["a", "b"])).resolves.toEqual({
      callFailed: true,
      vectors: [undefined, undefined],
    });
  });

  it("resolves when the call times out", async () => {
    const timeout = new DOMException("timed out", "TimeoutError");
    embedMany.mockRejectedValue(timeout);

    await expect(embedTexts(["a"])).resolves.toEqual({
      vectors: [undefined],
      callFailed: true,
    });
  });
});
