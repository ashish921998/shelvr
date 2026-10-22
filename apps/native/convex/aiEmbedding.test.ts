// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import {
  CURRENT_EMBEDDING_VERSION,
  EMBEDDING_DIMENSIONS,
} from "./model/embedding";
import { newConvexTest, signedInUser } from "./test.setup";

const embedMany = vi.hoisted(() => vi.fn());
const generateObject = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({
  embedMany,
  generateObject,
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
    expect(embedMany.mock.calls[0]![0].values).toEqual(["first", "second"]);
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

    const options = embedMany.mock.calls[0]![0];
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

describe("processItem embedding", () => {
  const CLASSIFICATION = {
    title: "Model title",
    description: "Model description.",
    tags: ["model"],
    spaceNames: [],
    intents: [],
  };

  beforeEach(() => {
    embedMany.mockReset();
    embedMany.mockImplementation(async ({ values }: { values: string[] }) => ({
      embeddings: values.map(() => vector(1)),
    }));
    generateObject.mockReset();
    generateObject.mockResolvedValue({ object: CLASSIFICATION });
  });

  async function noteInFlight() {
    const { t, userId } = await signedInUser(newConvexTest(), { pro: true });
    const itemId = await t.run((ctx) =>
      ctx.db.insert("items", {
        userId,
        type: "note",
        status: "processing",
        processingRunId: "run-1",
        processingStartedAt: Date.now(),
        note: "Buy lentils",
        tags: [],
        searchText: "",
      }),
    );
    return { t, itemId };
  }

  it("stamps the vector it computed for the text the save ends up with", async () => {
    const { t, itemId } = await noteInFlight();

    await t.action(internal.ai.processItem, { itemId, runId: "run-1" });

    const item = await t.run((ctx) => ctx.db.get(itemId));
    expect(item).toMatchObject({
      title: "Model title",
      embeddingVersion: CURRENT_EMBEDDING_VERSION,
    });
    expect(item?.embedding).toHaveLength(EMBEDDING_DIMENSIONS);
  });

  it("leaves the save for the sweep when the user types a title while the run is out", async () => {
    const { t, itemId } = await noteInFlight();
    generateObject.mockImplementationOnce(async () => {
      await t.mutation(api.items.updateNoteItem, {
        id: itemId,
        title: "My lentils",
      });
      return { object: CLASSIFICATION };
    });

    await t.action(internal.ai.processItem, { itemId, runId: "run-1" });

    const item = await t.run((ctx) => ctx.db.get(itemId));
    expect(item).toMatchObject({
      status: "ready",
      title: "My lentils",
      titleSource: "user",
      description: "Model description.",
    });
    expect(item?.embeddingVersion).toBeUndefined();
    expect(item?.embedding).toBeUndefined();
  });
});
