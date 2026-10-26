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
import { MODEL, modelCallOptions } from "./model/aiProvider";
import { embedQuery } from "./aiEmbeddingSweep";
import { summarizeError } from "./ai";

const RECOMMEND_TIMEOUT_MS = 45_000;

const recommendSchema = z.object({
  itemNumbers: z
    .array(z.number().int())
    .describe(
      "The numbers of the items that clearly belong in this space; empty if none",
    ),
});

const MAX_RECOMMENDATIONS = 8;

const RECOMMEND_VECTOR_LIMIT = 256;

type RecommendationCandidate = FunctionReturnType<
  typeof internal.items.listReadyItemsInternal
>[number];

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

async function recommendationCandidates(
  ctx: GenericActionCtx<DataModel>,
  space: Doc<"spaces">,
  memberIds: Set<Id<"items">>,
): Promise<RecommendationCandidate[]> {
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
      logEvent("error", "recommend_for_space_failed", {
        space_id: args.spaceId,
        error_category: summarizeError(error),
      });
    }
    return null;
  },
});
