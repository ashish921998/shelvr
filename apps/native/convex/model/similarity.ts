import type { Doc } from "../_generated/dataModel";
import { RECALL_MIN_AGE_MS } from "./recallAge";
import { buildSearchText } from "./searchText";

// Convex caps a full-text query at 16 terms.
const SIMILAR_SEARCH_TERMS = 16;
export const SIMILAR_LIMIT = 10;
const SIMILAR_MIN_SCORE = 3;
const SIMILAR_RESERVED_OLD = 3;
const TAG_SCORE = 3;

const TAG_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "for",
  "how",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
]);

type SimilarFields = Pick<
  Doc<"items">,
  | "_id"
  | "_creationTime"
  | "status"
  | "title"
  | "description"
  | "tags"
  | "siteName"
  | "note"
>;

/** Words long enough to carry meaning: four or more characters in Latin
 * script, two or more in others, where words are shorter. */
function significantWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(
      (word) =>
        word.length >= (/^[\p{Script=Latin}\p{N}]*$/u.test(word) ? 4 : 2),
    );
}

function summaryTokens(item: SimilarFields): Set<string> {
  return new Set(
    significantWords(
      buildSearchText({
        title: item.title,
        description: item.description,
        tags: item.tags,
        siteName: item.siteName,
        note: item.note,
      }),
    ),
  );
}

export function tagSearchWords(tag: string): string[] {
  return tag
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 2 && !TAG_STOPWORDS.has(word));
}

/** The full-text terms that find candidates for a save: its tag words,
 * then its title's significant words, at most the 16 Convex allows. */
export function similarSearchTerms(item: SimilarFields): string[] {
  const terms = new Set<string>();
  const words = [
    ...item.tags.flatMap(tagSearchWords),
    ...significantWords(item.title ?? ""),
  ];
  for (const word of words) {
    terms.add(word);
    if (terms.size >= SIMILAR_SEARCH_TERMS) {
      break;
    }
  }
  return [...terms];
}

/** Whether a save has anything to match on: a tag or a significant word. */
export function hasSimilarSignal(item: SimilarFields): boolean {
  return item.tags.length > 0 || summaryTokens(item).size > 0;
}

/**
 * Ranks candidates by likeness to `item`: three points per shared tag, one
 * per shared significant word, and nothing under three points. Up to three
 * places go to saves at least the recall age older than `item`, so an old
 * save can resurface; the rest are the best of what remains.
 */
export function rankSimilar<T extends SimilarFields>(
  item: SimilarFields,
  candidates: Iterable<T>,
): T[] {
  const tags = new Set(item.tags);
  const tokens = summaryTokens(item);
  const scored: { item: T; score: number }[] = [];
  for (const candidate of candidates) {
    if (candidate._id === item._id || candidate.status !== "ready") {
      continue;
    }
    let score = 0;
    for (const tag of candidate.tags) {
      if (tags.has(tag)) {
        score += TAG_SCORE;
      }
    }
    for (const token of summaryTokens(candidate)) {
      if (tokens.has(token)) {
        score += 1;
      }
    }
    if (score >= SIMILAR_MIN_SCORE) {
      scored.push({ item: candidate, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);

  const oldCutoff = item._creationTime - RECALL_MIN_AGE_MS;
  const reservedOld = scored
    .filter((candidate) => candidate.item._creationTime <= oldCutoff)
    .slice(0, SIMILAR_RESERVED_OLD);
  const reservedIds = new Set(reservedOld.map((s) => s.item._id));
  const rest = scored
    .filter((candidate) => !reservedIds.has(candidate.item._id))
    .slice(0, SIMILAR_LIMIT - reservedOld.length);
  return [...reservedOld, ...rest]
    .sort((a, b) => b.score - a.score)
    .map(({ item: match }) => match);
}
