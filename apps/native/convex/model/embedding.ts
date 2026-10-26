export const RECOMMEND_CANDIDATES = 100;

export const EMBEDDING_DIMENSIONS = 768;

export const CURRENT_EMBEDDING_VERSION = 1;

export const MAX_EMBED_CHARS = 6000;

export const EMBEDDING_SWEEP_PAGE = 25;

export const MAX_SWEEP_READ_BYTES = 1_000_000;

export const MAX_HYDRATE_READ_BYTES = 2_000_000;

export const MAX_EMBEDDING_ATTEMPTS = 5;

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

  const body = parts.note ?? parts.content ?? "";

  const composed = [summary, body.trim()]
    .filter((p) => p.length > 0)
    .join("\n\n");

  return composed.slice(0, MAX_EMBED_CHARS).trim();
}

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
  return sawNonZero;
}

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
