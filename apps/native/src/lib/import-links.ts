/** Most URLs one importLinks call accepts. Mirrors the server's batch cap. */
export const IMPORT_BATCH_SIZE = 50;

/** The X archive ships `bookmarks.js` as `window.YTD.bookmarks.part0 = [...]`,
 * so a pasted file starts with this assignment before the JSON array. */
const ARCHIVE_ASSIGNMENT = /^window\.YTD\.[\w.]+\s*=\s*/;

function candidateFromJson(entry: unknown): string | undefined {
  if (typeof entry === "string") return entry;
  if (typeof entry !== "object" || entry === null) return undefined;
  const record = entry as Record<string, unknown>;
  if (typeof record.url === "string") return record.url;
  if (typeof record.link === "string") return record.link;
  // Archive bookmark: { bookmark: { tweetId: "123" } }. Only digit strings are
  // accepted: JSON.parse rounds numeric ids past Number.MAX_SAFE_INTEGER, which
  // would point at a different post.
  const bookmark = record.bookmark;
  if (typeof bookmark === "object" && bookmark !== null) {
    const tweetId = (bookmark as Record<string, unknown>).tweetId;
    if (typeof tweetId === "string" && /^\d+$/.test(tweetId)) {
      return `https://x.com/i/web/status/${tweetId}`;
    }
  }
  return undefined;
}

/** Only the scheme and host of a URL are case-insensitive. */
function dedupKey(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}

/**
 * Pasted import text as a deduplicated list of URL candidates. Accepts a JSON
 * array (strings, `{ url }` / `{ link }` objects, or X archive bookmarks, with
 * or without the archive's `window.YTD` assignment), otherwise whitespace- or
 * newline-separated URLs. Commas are not separators: URLs may contain them.
 * The server still validates and normalizes every candidate.
 */
export function parseImportText(text: string): string[] {
  const trimmed = text.trim().replace(ARCHIVE_ASSIGNMENT, "").trim();
  if (trimmed === "") return [];
  let candidates: string[];
  try {
    const parsed: unknown = JSON.parse(trimmed);
    candidates = Array.isArray(parsed)
      ? parsed.flatMap((entry) => {
          const candidate = candidateFromJson(entry)?.trim();
          return candidate ? [candidate] : [];
        })
      : [];
  } catch {
    candidates = trimmed.split(/\s+/).filter((part) => part !== "");
  }
  const seen = new Set<string>();
  return candidates.filter((url) => {
    const key = dedupKey(url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type ImportBatchResult = {
  created: number;
  skipped: number;
  invalid: number;
  notProcessed: number;
  rateLimited: boolean;
};

export type ImportSummary = {
  created: number;
  skipped: number;
  invalid: number;
  /** URLs never created: the rest of a stopped batch plus every later one. */
  notProcessed: number;
  stopped: "rate_limited" | "failed" | null;
  /** What the failing batch threw, when `stopped` is "failed". */
  error?: unknown;
};

/**
 * Send `urls` in server-sized batches, carrying the created count forward as
 * the processing stagger offset. Stops at the first rate-limited or failed
 * batch and counts everything left as not processed. Links already saved are
 * skipped by the server, so importing the same list again resumes.
 */
export async function importInBatches(
  urls: readonly string[],
  importBatch: (
    batch: string[],
    staggerOffset: number,
  ) => Promise<ImportBatchResult>,
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    created: 0,
    skipped: 0,
    invalid: 0,
    notProcessed: 0,
    stopped: null,
  };
  for (let start = 0; start < urls.length; start += IMPORT_BATCH_SIZE) {
    const batch = urls.slice(start, start + IMPORT_BATCH_SIZE);
    const after = urls.length - start - batch.length;
    let result: ImportBatchResult;
    try {
      result = await importBatch(batch, summary.created);
    } catch (error) {
      summary.notProcessed += batch.length + after;
      summary.stopped = "failed";
      summary.error = error;
      break;
    }
    summary.created += result.created;
    summary.skipped += result.skipped;
    summary.invalid += result.invalid;
    if (result.rateLimited) {
      summary.notProcessed += result.notProcessed + after;
      summary.stopped = "rate_limited";
      break;
    }
  }
  return summary;
}
