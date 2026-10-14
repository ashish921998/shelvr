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

/**
 * The embedding model, called through the same provider and API key as
 * classification. Separate from MODEL_NAME because they are different models
 * on different release cadences, and because token usage is logged per call
 * site: embedding spend should be legible on its own.
 */
const EMBEDDING_MODEL_NAME = "gemini-embedding-2";

/**
 * Deadline for one embedding batch. Embedding is a single forward pass with no
 * generated tokens, so it is far quicker than classification; the allowance is
 * generous only so a cold provider does not cost an item its vector. It adds
 * to processItem's budget above, which stays well under the action limit.
 */
const EMBED_TIMEOUT_MS = 20_000;

/**
 * The two sides of retrieval.
 *
 * Google documents these task types as an asymmetric pair: items are the
 * corpus, so they are embedded as documents, and anything searching the index
 * embeds its query text as a query. The pairing lives in one place and callers
 * pick a side by choosing `embedTexts` or `embedQuery` rather than by passing
 * a string.
 *
 * Measured 2026-09-25 against the dev deployment: `gemini-embedding-2` returns
 * the same vector for a query under either task type, so with this model the
 * pairing changes nothing and ranking is plain symmetric similarity. It is
 * kept because the provider forwards it and a later model may honour it; do
 * not read it as a ranking guarantee, and do not expect a mismatch to show up
 * as worse results.
 */
const EMBEDDING_DOCUMENT_TASK_TYPE = "RETRIEVAL_DOCUMENT";
const EMBEDDING_QUERY_TASK_TYPE = "RETRIEVAL_QUERY";

/**
 * What one embedding batch produced.
 *
 * `callFailed` is reported separately from an empty `vectors` slot on purpose.
 * A slot is `undefined` for two unrelated reasons — the call never completed,
 * or the call completed and that particular vector was unusable — and the two
 * demand opposite handling. The first is nobody's fault and must be retried
 * for free; the second is that item's own problem and has to spend an
 * attempt, or a row the provider can never embed leads the sweep range
 * forever. Inferring one from the other ("the batch produced nothing, so the
 * provider must be down") gets it wrong in exactly the case that wedges the
 * sweep: a completed call whose every vector is malformed.
 */
type EmbedBatchResult = {
  vectors: (number[] | undefined)[];
  callFailed: boolean;
};

/**
 * Embeds a batch of texts, in input order.
 *
 * Best effort by contract: it never throws and never rejects. Every failure
 * mode — provider outage, timeout, a malformed vector, an empty input —
 * collapses to `undefined` in that text's slot, because an item is worth
 * saving whether or not it could be embedded. Callers write the vectors they
 * got and leave the rest to the sweeper; `callFailed` tells them which kind
 * of nothing they are looking at.
 *
 * Empty texts are never sent upstream; their slot is `undefined` from the
 * start. Vectors are normalized and width-checked before being returned, so a
 * caller can hand the result straight to a mutation: Convex rejects a vector
 * whose width does not match the index, which would otherwise fail the whole
 * classification transaction over an optional field.
 *
 * Batching is the SDK's: `embedMany` splits at the provider's documented
 * 100-values ceiling on its own, so callers pass a whole page.
 */
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
    // Categories and counts only: an embedding error can echo the text.
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

/** Embeds item texts for storage in the vector index. */
export async function embedTexts(texts: string[]): Promise<EmbedBatchResult> {
  return await embedBatch(texts, EMBEDDING_DOCUMENT_TASK_TYPE);
}

/**
 * Embeds one search string for use as a `ctx.vectorSearch` vector.
 *
 * Same best-effort contract as `embedTexts`: `undefined` means the caller has
 * no vector to search with and must fall back to whatever it did before, not
 * that it should fail. Text bounding is the caller's, via
 * `buildEmbeddingText`, so a query is composed exactly the way the stored
 * summaries were.
 */
export async function embedQuery(text: string): Promise<number[] | undefined> {
  // A search has no sweep behind it to retry for it, so a failed call and an
  // unusable vector mean the same thing here: no vector, take the fallback.
  const { vectors } = await embedBatch([text], EMBEDDING_QUERY_TASK_TYPE);
  return vectors[0];
}

/**
 * Embeds one page of items whose vector is missing or from an older
 * generation, then stamps the whole page.
 *
 * This is three jobs in one, which is why it runs on a schedule rather than
 * once: it backfills saves made before embeddings existed, it repairs saves
 * whose inline embed call failed during classification, and it is the
 * migration path when CURRENT_EMBEDDING_VERSION is bumped. Once the range is
 * empty it costs one indexed read per run and nothing else.
 *
 * A full page that actually embedded something chains itself immediately, the
 * same way the stale-processing sweeper does, so a large existing shelf drains
 * without waiting a cron interval per page. Nothing can sit at the front of
 * the range forever: an item with no embeddable text is finished on sight, and
 * one the provider keeps rejecting is stamped after MAX_EMBEDDING_ATTEMPTS.
 * An item the provider merely could not reach is left exactly as it was.
 */
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

    // Whether the provider answered at all, taken from the call itself rather
    // than inferred from its output. Both directions matter. A real outage
    // must not march the whole table stamping items as done with no vector —
    // that is what the `deferred` outcome prevents. But a call that completes
    // and returns nothing usable is not an outage, and deferring those rows
    // would wedge the sweep: they lead the range every run, so the page would
    // be re-read forever and every ready item behind it would never be
    // reached. Those spend an attempt instead, and the cap eventually clears
    // them.

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

    // Chain only on real progress. Gating on `written` rather than on rows
    // touched is what keeps a provider outage from accelerating: with nothing
    // embedded there is nothing to chain for, and the next cron tick retries
    // at its own pace.
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
