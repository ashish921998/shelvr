"use node";

import { v } from "convex/values";
import { generateObject } from "ai";
import { z } from "zod";
import type { FunctionReturnType, GenericActionCtx } from "convex/server";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { buildEmbeddingText, RECOMMEND_CANDIDATES } from "./model/embedding";
import { logEvent, errorName } from "./model/log";
import { MODEL, modelCallOptions, isModelTimeout } from "./model/aiProvider";
import { fetchErrorCategory } from "./model/pageRead";
import { embedQuery } from "./aiEmbeddingSweep";

const RECOMMEND_TIMEOUT_MS = 45_000;
function summarizeError(error: unknown): string {
  return isModelTimeout(error) ? "model_timeout" : fetchErrorCategory(error);
}

const recommendSchema = z.object({
  itemNumbers: z
    .array(z.number().int())
    .describe(
      "The numbers of the items that clearly belong in this space; empty if none",
    ),
});

// A recommendation pass surfaces "a couple of good picks", not an exhaustive
// sweep: the user can always add more by hand or ask again later.
const MAX_RECOMMENDATIONS = 8;

/**
 * How many hits the candidate vector search asks for.
 *
 * Wider than RECOMMEND_CANDIDATES because the hits are thinned afterwards:
 * items already in the space drop out, and so do items whose stored vector
 * outlived a change of status or belongs to an older generation. The headroom
 * keeps a space whose strongest matches are already filed from arriving at the
 * prompt short-handed.
 *
 * 256 is the most Convex will return from one `vectorSearch`, and a hit is an
 * id and a score rather than a document, so the widest window the platform
 * offers costs almost nothing here; the document reads are bounded separately,
 * by `listReadyItemsByIdInternal`'s row and byte limits. Past 256 filed
 * stronger matches the ranking cannot see further, and the recency half of
 * `recommendationCandidates` is what fills the list instead.
 */
const RECOMMEND_VECTOR_LIMIT = 256;

type RecommendationCandidate = FunctionReturnType<
  typeof internal.items.listReadyItemsInternal
>[number];

/**
 * The semantic half of `recommendationCandidates`.
 *
 * Returns an empty list rather than throwing on any failure. The outer action
 * catches and logs, so an error escaping here would turn a transient search
 * hiccup into no recommendations at all, strictly worse than the recency read
 * this replaced. An empty list is the fallback signal.
 */
async function searchCandidates(
  ctx: GenericActionCtx<DataModel>,
  space: Doc<"spaces">,
  vector: number[],
  memberIds: Set<Id<"items">>,
): Promise<RecommendationCandidate[]> {
  try {
    const matches = await ctx.vectorSearch("items", "by_embedding", {
      vector,
      limit: RECOMMEND_VECTOR_LIMIT,
      // The only filter the index carries, and deliberately so: Convex vector
      // filters cannot AND across fields, and this is the one whose absence
      // would leak another account's saves. Everything else the candidates
      // have to satisfy is enforced when the ids are hydrated.
      filter: (q) => q.eq("userId", space.userId),
    });
    const itemIds = matches
      .map((match) => match._id)
      .filter((itemId) => !memberIds.has(itemId));
    if (itemIds.length === 0) {
      return [];
    }
    return await ctx.runQuery(internal.items.listReadyItemsByIdInternal, {
      userId: space.userId,
      itemIds,
      limit: RECOMMEND_CANDIDATES,
    });
  } catch (error) {
    logEvent("warn", "recommend_vector_search_failed", {
      space_id: space._id,
      error: errorName(error),
    });
    return [];
  }
}

/**
 * Picks the items the recommendation prompt gets to choose from.
 *
 * Semantic first: the space's own name and description are embedded as a
 * query and matched against the item vector index, so a user with a thousand
 * saves is judged on the hundred most *relevant* rather than the hundred most
 * *recent*. That difference is the whole point: the saves worth resurfacing
 * when someone finally makes a "Recipes" space are the old ones they have
 * forgotten, and those are exactly the ones a recency read cannot see.
 *
 * Recency is not an alternative to that, it is the floor underneath it, and
 * it is not optional. A user whose backfill has not drained, whose items all
 * failed to embed, or whose query text could not be embedded at all has no
 * vectors, or too few, to match; unaided, the feature would hand such a
 * user a shorter list than the "newest 100" read it replaced. So the two are
 * combined rather than chosen between: ranked hits first, recency filling
 * whatever is left of the candidate budget. Both halves return the same shape
 * and feed the same prompt, and when the index covers the shelf the recency
 * read is never reached.
 */
async function recommendationCandidates(
  ctx: GenericActionCtx<DataModel>,
  space: Doc<"spaces">,
  memberIds: Set<Id<"items">>,
): Promise<RecommendationCandidate[]> {
  // Composed exactly the way an item's own summary is, so the query sits in
  // the same region of the space as the corpus text it has to match.
  const queryText = buildEmbeddingText({
    title: space.name,
    description: space.description,
  });
  const vector = queryText.length > 0 ? await embedQuery(queryText) : undefined;
  const ranked =
    vector === undefined
      ? []
      : await searchCandidates(ctx, space, vector, memberIds);

  if (ranked.length >= RECOMMEND_CANDIDATES) {
    logEvent("info", "recommend_candidates", {
      space_id: space._id,
      source: "vector",
      count: ranked.length,
    });
    return ranked;
  }

  // A short ranked list does not mean the shelf is short. While the sweep is
  // draining, a user can have a thousand saves and fifty vectors, and the
  // index can only ever offer the fifty. Returning those alone would hand the
  // prompt less than the newest-100 read this replaced, so partial coverage
  // would be a regression for exactly the users the feature is for. The
  // ranked hits lead (they are the relevant ones, and the prompt numbers
  // what it is given), and recency fills the rest of the list behind them.
  const seen = new Set(ranked.map((item) => item._id));
  const recent = (
    await ctx.runQuery(internal.items.listReadyItemsInternal, {
      userId: space.userId,
      limit: RECOMMEND_CANDIDATES,
    })
  ).filter((item) => !memberIds.has(item._id) && !seen.has(item._id));
  const candidates = [...ranked, ...recent].slice(0, RECOMMEND_CANDIDATES);
  logEvent("info", "recommend_candidates", {
    space_id: space._id,
    source: ranked.length === 0 ? "recent" : "mixed",
    count: candidates.length,
    ranked: ranked.length,
  });
  return candidates;
}

/**
 * Recommend existing items for a space, off nothing but its name and
 * description. Runs when a space is created, and again whenever its dynamic
 * toggle turns on. Writes
 * `suggested` rows only (the user decides what actually enters the space),
 * and never re-suggests anything they already filed or dismissed.
 */
export const recommendForSpace = internalAction({
  args: { spaceId: v.id("spaces") },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const context = await ctx.runQuery(
        internal.spaces.recommendationContext,
        {
          spaceId: args.spaceId,
        },
      );
      if (context === null) return null;
      const { space } = context;
      const memberIds = new Set(context.memberIds);
      const candidates = await recommendationCandidates(ctx, space, memberIds);
      if (candidates.length === 0) {
        return null;
      }
      // Asked again: picking the candidates embeds the space, which is slow,
      // and the next call sends their titles, descriptions and tags.
      const surviving = await ctx.runQuery(
        internal.spaces.survivingCandidates,
        {
          userId: space.userId,
          spaceId: space._id,
          itemIds: candidates.map((item) => item._id),
        },
      );
      if (surviving === null || surviving.length === 0) return null;
      const survivingIds = new Set(surviving);
      const items = candidates.filter((item) => survivingIds.has(item._id));

      const itemLines = items
        .map((item, i) => {
          const parts = [
            item.title ?? "(untitled)",
            item.description ?? "",
            item.tags.length > 0 ? `tags: ${item.tags.join(", ")}` : "",
          ].filter((p) => p !== "");
          return `${i + 1}. ${parts.join(" — ")}`;
        })
        .join("\n");

      const { object } = await generateObject({
        model: MODEL,
        ...modelCallOptions(RECOMMEND_TIMEOUT_MS),
        schema: recommendSchema,
        prompt: [
          "You are helping organize a save-it-for-later app. The user just created a space (a themed collection) and Shelvr recommends a few existing saves for it — the user decides which to keep.",
          `Space name: "${space.name}"${space.description ? `\nSpace description: ${space.description}` : ""}`,
          `Below is a numbered list of the user's saved items. Return the numbers of the items that clearly belong in this space, at most ${MAX_RECOMMENDATIONS}, or an empty array if none do. The user reviews each pick, so leave out borderline ones.`,
          itemLines,
        ].join("\n\n"),
      });

      const itemIds: Id<"items">[] = [];
      for (const n of object.itemNumbers) {
        if (Number.isInteger(n) && n >= 1 && n <= items.length) {
          itemIds.push(items[n - 1]._id);
        }
        if (itemIds.length >= MAX_RECOMMENDATIONS) {
          break;
        }
      }
      if (itemIds.length > 0) {
        await ctx.runMutation(internal.items.suggestItemsForSpace, {
          spaceId: args.spaceId,
          itemIds,
        });
      }
    } catch (error) {
      // Sanitized: log a category, not the raw error object.
      logEvent("error", "recommend_for_space_failed", {
        space_id: args.spaceId,
        error_category: summarizeError(error),
      });
    }
    return null;
  },
});
