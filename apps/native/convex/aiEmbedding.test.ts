// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMBEDDING_DIMENSIONS } from "./model/embedding";

const embedMany = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({
  embedMany,
  generateObject: vi.fn(),
  wrapLanguageModel: vi.fn(() => ({})),
}));

const { embedTexts } = await import("./aiEmbeddingSweep");

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
    embedMany.mockResolvedValue({ embeddings: [vector(7)] });

    const [embedding] = (await embedTexts(["something to embed"])).vectors;

    expect(embedding).toBeDefined();
    expect(magnitude(embedding!)).toBeCloseTo(1, 10);
  });

  it("keeps results aligned with the input positions", async () => {
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
    expect(options.providerOptions.google.taskType).toBe("RETRIEVAL_DOCUMENT");
    expect(options.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("drops a wrong-width vector instead of failing the write", async () => {
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
