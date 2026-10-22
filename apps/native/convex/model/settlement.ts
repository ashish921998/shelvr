import type { Doc, Id } from "../_generated/dataModel";
import { CURRENT_EMBEDDING_VERSION, isValidEmbedding } from "./embedding";
import type { ArticleMedia, PostMedia, Recipe } from "./itemFields";
import { buildSearchText } from "./searchText";

type FinalizeValues = {
  title?: string;
  keepTitle?: boolean;
  description: string;
  tags: string[];
  content?: string;
  recipe?: Recipe;
  siteName?: string;
  author?: string;
  heroImageUrl?: string;
  media?: PostMedia[];
  articleMedia?: ArticleMedia[];
  storageId?: Id<"_storage">;
  aspectRatio?: number;
  intents?: Doc<"items">["intents"];
  cities?: string[];
  embedding?: number[];
  classified?: boolean;
  status: Doc<"items">["status"];
  enrichment?: Doc<"items">["enrichment"];
};

export type ItemPatch = Partial<Omit<Doc<"items">, "_id" | "_creationTime">>;

const LEAVE_FOR_EMBEDDING_SWEEP = {
  embeddingVersion: undefined,
  embeddingAttempts: undefined,
};

/** A key set to `undefined` removes that field from the row, hence the `??` fallbacks and conditional spreads. */
export function completionPatch(
  item: Doc<"items">,
  args: FinalizeValues,
  aiAllowed: boolean,
): ItemPatch {
  const withdrawn = args.classified === true && !aiAllowed;
  const description = withdrawn ? (item.description ?? "") : args.description;
  const tags = withdrawn ? item.tags : args.tags;
  const intents = withdrawn ? item.intents : args.intents;
  const cities = withdrawn ? item.cities : args.cities;
  const recipe = withdrawn ? item.recipe : args.recipe;
  const title =
    (item.titleSource === "user" || args.keepTitle === true) &&
    item.title !== undefined
      ? item.title
      : ((withdrawn ? undefined : args.title) ?? item.title);
  return {
    title,
    description,
    tags,
    content: args.content,
    recipe,
    siteName: args.siteName,
    author: args.author,
    heroImageUrl: args.heroImageUrl,
    media: args.media,
    articleMedia: args.articleMedia,
    ...(args.storageId !== undefined ? { storageId: args.storageId } : {}),
    aspectRatio: args.aspectRatio,
    intents,
    ...(cities !== undefined ? { cities } : {}),
    status: args.status,
    enrichment: args.enrichment,
    failureReason: undefined,
    searchText: buildSearchText({
      title,
      description,
      tags,
      siteName: args.siteName,
      note: item.note,
      content: args.content,
    }),
    // Convex rejects a wrong-width vector at write time, which would fail this whole transaction.
    ...(aiAllowed &&
    args.embedding !== undefined &&
    isValidEmbedding(args.embedding)
      ? {
          embedding: args.embedding,
          embeddingVersion: CURRENT_EMBEDDING_VERSION,
          embeddingAttempts: undefined,
        }
      : LEAVE_FOR_EMBEDDING_SWEEP),
  };
}
