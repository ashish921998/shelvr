/**
 * Shared embedding constants and text composition. Lives in `model/` for the
 * same reason as `itemFields.ts`: `schema.ts` needs the dimension count, the
 * AI action needs the text builder, and `items.ts` needs the generation
 * number — one definition, no hand-copied second source to drift.
 *
 * This module must stay runtime-agnostic (no `"use node"`, no provider
 * imports): `schema.ts` imports it, and the schema is evaluated everywhere.
 */

/**
 * Length of every stored vector. Convex enforces that a vector written to a
 * vector index matches the index's declared `dimensions` exactly, so this and
 * `schema.ts` can never disagree — they read the same constant.
 *
 * 768 rather than the model's native width: Matryoshka-trained embeddings
 * truncate with little quality loss, and at ~6 KB per item the field stays
 * small enough that a shelf of saves does not dominate the table.
 */
export const EMBEDDING_DIMENSIONS = 768;

/**
 * Which generation produced a stored vector. Bump this whenever the model or
 * `buildEmbeddingText` changes in a way that makes old vectors incomparable
 * with new ones; the backfill sweeper then re-embeds everything below the
 * current number on its own schedule.
 *
 * `embeddingVersion` is optional on the document, and `undefined` sorts before
 * every number in a Convex index, so a single `lt(CURRENT_EMBEDDING_VERSION)`
 * range covers never-embedded rows and stale rows together. Same trick as
 * `by_status_and_processingStartedAt` in `schema.ts`.
 */
export const CURRENT_EMBEDDING_VERSION = 1;

/**
 * Longest text handed to the embedding model. Embedding models truncate at a
 * fixed input-token limit rather than erroring, so cutting here keeps what is
 * embedded predictable instead of provider-defined. ~6k characters is roughly
 * 1.5k tokens, comfortably inside the limit.
 */
export const MAX_EMBED_CHARS = 6000;

/**
 * How many items one embedding sweep claims.
 *
 * Under the provider's 100-values-per-batch ceiling, so a page is exactly one
 * upstream batch, and small enough that composing the texts and writing the
 * vectors back both stay far inside Convex transaction limits. Lives here
 * rather than in `items.ts` so the query that pages and the action that
 * batches read the same number without importing each other.
 */
export const EMBEDDING_SWEEP_PAGE = 25;

/**
 * Byte budget for the documents one sweep page may read.
 *
 * Page size alone is not a bound: a `ready` link can carry 100k characters of
 * extracted article, so 25 worst-case rows would be megabytes inside a single
 * Convex transaction — and the same page would be re-read on every run, so
 * exceeding the read limit would wedge the sweep permanently on the same rows
 * rather than failing once. The query stops accumulating at whichever of the
 * two limits it reaches first.
 */
export const MAX_SWEEP_READ_BYTES = 1_000_000;

/**
 * Byte budget for one `listReadyItemsByIdInternal` read.
 *
 * The same argument as the sweep's budget, for the same reason: rows are not
 * a bound when one `ready` link can carry 100k characters of extracted
 * article, so a full page of worst-case documents would be megabytes inside
 * one Convex transaction. Truncating is safe there specifically because the
 * ids arrive in descending relevance order, so the budget drops the least
 * relevant tail rather than a strong match.
 *
 * It lives here rather than in `items.ts` so the query and the tests that
 * assert its boundary read the same number, as the sweep's pair already do.
 */
export const MAX_HYDRATE_READ_BYTES = 2_000_000;

/**
 * How many times one item may fail to embed before the sweep gives up on it
 * and stamps it anyway.
 *
 * Without a cap, an item the provider can never embed sits at the front of the
 * sweep range forever and blocks every row behind it. The cap only counts
 * item-specific failures: when a whole batch comes back empty the provider is
 * down, which is not that item's fault, and the sweep defers without spending
 * an attempt. A later CURRENT_EMBEDDING_VERSION bump re-enlists anything that
 * was given up on.
 */
export const MAX_EMBEDDING_ATTEMPTS = 5;

/**
 * The text an item is embedded from.
 *
 * Ordering is deliberate: the classifier's own summary (title, description,
 * tags) leads, because it is the densest description of what the save *is*,
 * and the body follows as supporting detail. Truncation therefore costs the
 * tail of a long article, never the summary.
 *
 * `intents` are excluded for the reason already recorded at the `searchText`
 * write in `items.ts`: they are actions ("Open in Maps"), not descriptive
 * text, and they skew similarity toward items that merely share a button.
 *
 * Returns "" when there is nothing worth embedding; callers skip the model
 * call rather than store a vector for an empty string.
 */
export function buildEmbeddingText(parts: {
  title?: string;
  description?: string;
  tags?: string[];
  siteName?: string;
  note?: string;
  content?: string;
}): string {
  const summary = [
    parts.title,
    parts.description,
    parts.tags !== undefined && parts.tags.length > 0
      ? parts.tags.join(", ")
      : undefined,
    parts.siteName,
  ]
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .join("\n");

  // A note carries its own words; a link carries the extracted article. An
  // item never has both, but preferring the user's own text is the safer rule
  // if one ever does.
  const body = parts.note ?? parts.content ?? "";

  const composed = [summary, body.trim()]
    .filter((p) => p.length > 0)
    .join("\n\n");

  return composed.slice(0, MAX_EMBED_CHARS).trim();
}

/**
 * True when a vector is the exact width the vector index expects and carries
 * only finite components.
 *
 * All three checks matter. Convex rejects a wrong-width vector at write time,
 * which would fail the whole classification transaction over an optional
 * field; a NaN component silently poisons every later similarity comparison;
 * and an all-zero vector has no direction, so cosine similarity against it is
 * 0/0. Callers check before writing and drop the vector instead — an item with
 * no embedding is merely invisible to semantic retrieval until the sweeper
 * repairs it.
 */
export function isValidEmbedding(vector: readonly number[]): boolean {
  if (vector.length !== EMBEDDING_DIMENSIONS) {
    return false;
  }
  let sawNonZero = false;
  for (const component of vector) {
    if (!Number.isFinite(component)) {
      return false;
    }
    if (component !== 0) {
      sawNonZero = true;
    }
  }
  // A zero vector survives normalization untouched (there is no direction to
  // scale) and would otherwise pass every other check. Cosine similarity
  // against it is 0/0, so indexing one poisons ranking rather than merely
  // ranking badly.
  return sawNonZero;
}

/**
 * L2-normalizes a vector to unit length.
 *
 * Applied to every stored vector even though the current model is documented
 * to normalize truncated output itself. Three reasons to not rely on that:
 * Convex vector search scores by cosine similarity, which is only meaningful
 * for unit-length vectors; the sibling model `gemini-embedding-001` explicitly
 * does NOT normalize at any width other than its native 3072, so a fallback or
 * rollback would silently produce wrong rankings; and nothing downstream fails
 * loudly if a future model stops normalizing — results would just quietly get
 * worse. Re-normalizing an already-unit vector is a numerical no-op, so the
 * defensive pass costs one cheap loop and removes the whole class of bug.
 *
 * A zero vector has no direction to preserve and is returned unchanged; the
 * caller's `isValidEmbedding` check is what keeps a degenerate vector out of
 * the index.
 */
export function normalizeEmbedding(vector: readonly number[]): number[] {
  let sumOfSquares = 0;
  for (const component of vector) {
    sumOfSquares += component * component;
  }
  const magnitude = Math.sqrt(sumOfSquares);
  if (magnitude === 0 || !Number.isFinite(magnitude)) {
    return [...vector];
  }
  return vector.map((component) => component / magnitude);
}
