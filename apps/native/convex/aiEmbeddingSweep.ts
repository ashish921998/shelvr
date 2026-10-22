"use node";

import { v } from "convex/values";
import { embedMany } from "ai";
import { google } from "@ai-sdk/google";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_SWEEP_PAGE,
  isValidEmbedding,
  normalizeEmbedding,
} from "./model/embedding";
import { logEvent, errorName } from "./model/log";
import { modelCallOptions, isModelTimeout } from "./model/aiProvider";

const EMBEDDING_MODEL_NAME = "gemini-embedding-2";

const EMBED_TIMEOUT_MS = 20_000;

const EMBEDDING_DOCUMENT_TASK_TYPE = "RETRIEVAL_DOCUMENT";
const EMBEDDING_QUERY_TASK_TYPE = "RETRIEVAL_QUERY";

type EmbedBatchResult = {
  vectors: (number[] | undefined)[];
  callFailed: boolean;
};

/** Never throws; a text that could not be embedded gets `undefined` in its slot. */
async function embedBatch(
  texts: string[],
  taskType: string,
): Promise<EmbedBatchResult> {
  const vectors: (number[] | undefined)[] = texts.map(() => undefined);
  const sendable = texts
    .map((text, index) => ({ text, index }))
    .filter((entry) => entry.text.length > 0);
  if (sendable.length === 0) {
    return { vectors, callFailed: false };
  }
  try {
    const { embeddings } = await embedMany({
      model: google.embedding(EMBEDDING_MODEL_NAME),
      values: sendable.map((entry) => entry.text),
      providerOptions: {
        google: {
          outputDimensionality: EMBEDDING_DIMENSIONS,
          taskType,
        },
      },
      ...modelCallOptions(EMBED_TIMEOUT_MS),
    });
    embeddings.forEach((raw, position) => {
      const vector = normalizeEmbedding(raw);
      if (isValidEmbedding(vector)) {
        vectors[sendable[position].index] = vector;
      }
    });
  } catch (error) {
    logEvent("warn", "embedding_failed", {
      model: EMBEDDING_MODEL_NAME,
      task_type: taskType,
      count: sendable.length,
      timed_out: isModelTimeout(error),
      error: errorName(error),
    });
    return { vectors, callFailed: true };
  }
  return { vectors, callFailed: false };
}

export async function embedTexts(texts: string[]): Promise<EmbedBatchResult> {
  return await embedBatch(texts, EMBEDDING_DOCUMENT_TASK_TYPE);
}

export async function embedQuery(text: string): Promise<number[] | undefined> {
  const { vectors } = await embedBatch([text], EMBEDDING_QUERY_TASK_TYPE);
  return vectors[0];
}

export const sweepItemEmbeddings = internalAction({
  args: {},
  returns: v.object({ scanned: v.number(), written: v.number() }),
  handler: async (ctx): Promise<{ scanned: number; written: number }> => {
    const pending = await ctx.runQuery(
      internal.items.listItemsNeedingEmbeddingInternal,
      { limit: EMBEDDING_SWEEP_PAGE },
    );
    if (pending.length === 0) {
      return { scanned: 0, written: 0 };
    }
    const dispositions = await ctx.runQuery(
      internal.aiConsent.revalidateEmbeddingBatch,
      {
        entries: pending.map(({ itemId, userId }) => ({ itemId, userId })),
      },
    );
    const eligible = pending.flatMap((entry, index) =>
      dispositions[index].disposition === "gone"
        ? []
        : [
            {
              ...entry,
              aiDeclined: dispositions[index].disposition === "declined",
            },
          ],
    );
    const { vectors, callFailed } = await embedTexts(
      eligible.map((entry) => (entry.aiDeclined ? "" : entry.text)),
    );

    const { written, stamped, deferred } = await ctx.runMutation(
      internal.items.setEmbeddingsInternal,
      {
        entries: eligible.map((entry, index) => ({
          itemId: entry.itemId,
          text: entry.text,
          embedding: vectors[index],
          outcome: entry.aiDeclined
            ? ("ai_declined" as const)
            : vectors[index] !== undefined
              ? ("embedded" as const)
              : entry.text.length === 0
                ? ("nothing_to_embed" as const)
                : callFailed
                  ? ("deferred" as const)
                  : ("failed" as const),
        })),
      },
    );
    logEvent("info", "embedding_sweep", {
      scanned: pending.length,
      written,
      stamped,
      deferred,
      provider_down: callFailed,
    });

    if (pending.length === EMBEDDING_SWEEP_PAGE && written > 0) {
      await ctx.scheduler.runAfter(
        0,
        internal.aiEmbeddingSweep.sweepItemEmbeddings,
        {},
      );
    }
    return { scanned: pending.length, written };
  },
});
