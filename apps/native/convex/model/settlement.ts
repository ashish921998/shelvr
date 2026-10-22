import { v, type Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { CURRENT_EMBEDDING_VERSION, isValidEmbedding } from "./embedding";
import {
  articleMediaValidator,
  enrichmentValidator,
  intentValidator,
  postMediaValidator,
  recipeValidator,
  type Recipe,
} from "./itemFields";
import { buildSearchText } from "./searchText";

export const readingValidator = v.object({
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  recipe: v.optional(recipeValidator),
  content: v.optional(v.string()),
  siteName: v.optional(v.string()),
  author: v.optional(v.string()),
  heroImageUrl: v.optional(v.string()),
  media: v.optional(v.array(postMediaValidator)),
  articleMedia: v.optional(v.array(articleMediaValidator)),
  storageId: v.optional(v.id("_storage")),
  aspectRatio: v.optional(v.number()),
  enrichment: v.optional(enrichmentValidator),
});

export const classificationValidator = v.object({
  title: v.optional(v.string()),
  description: v.string(),
  tags: v.array(v.string()),
  intents: v.optional(v.array(intentValidator)),
  cities: v.optional(v.array(v.string())),
  recipe: v.optional(recipeValidator),
  embedding: v.optional(v.array(v.float64())),
});

export type Reading = Infer<typeof readingValidator>;
export type Classification = Infer<typeof classificationValidator>;

type Settlement = {
  keepTitle?: boolean;
  reading: Reading;
  classification?: Classification;
};

export type ItemPatch = Partial<Omit<Doc<"items">, "_id" | "_creationTime">>;

type Words = {
  title: string | undefined;
  description: string;
  tags: string[];
  intents: Doc<"items">["intents"];
  cities: string[] | undefined;
  recipe: Recipe | undefined;
};

const LEAVE_FOR_EMBEDDING_SWEEP = {
  embeddingVersion: undefined,
  embeddingAttempts: undefined,
};

function readingWords(item: Doc<"items">, reading: Reading): Words {
  return {
    title: reading.title,
    description: reading.description || (item.description ?? ""),
    tags: item.tags,
    intents: item.intents ?? [],
    cities: item.cities,
    recipe: reading.recipe,
  };
}

function classifiedWords(
  reading: Reading,
  classification: Classification,
): Words {
  return {
    title: classification.title,
    description: classification.description,
    tags: classification.tags,
    intents: classification.intents,
    cities: classification.cities,
    recipe: reading.recipe ?? classification.recipe,
  };
}

function withdrawnWords(item: Doc<"items">): Words {
  return {
    title: undefined,
    description: item.description ?? "",
    tags: item.tags,
    intents: item.intents,
    cities: item.cities,
    recipe: item.recipe,
  };
}

function settledWords(
  item: Doc<"items">,
  { reading, classification }: Settlement,
  aiAllowed: boolean,
): Words {
  if (classification === undefined) {
    return readingWords(item, reading);
  }
  return aiAllowed
    ? classifiedWords(reading, classification)
    : withdrawnWords(item);
}

function embeddingPatch(
  vector: number[] | undefined,
  aiAllowed: boolean,
): Pick<ItemPatch, "embedding" | "embeddingVersion" | "embeddingAttempts"> {
  // Convex rejects a wrong-width vector at write time, which would fail this whole transaction.
  if (aiAllowed && vector !== undefined && isValidEmbedding(vector)) {
    return {
      embedding: vector,
      embeddingVersion: CURRENT_EMBEDDING_VERSION,
      embeddingAttempts: undefined,
    };
  }
  return LEAVE_FOR_EMBEDDING_SWEEP;
}

/** A key set to `undefined` removes that field from the row, hence the `??` fallbacks and conditional spreads. */
export function completionPatch(
  item: Doc<"items">,
  run: Settlement,
  aiAllowed: boolean,
): ItemPatch {
  const { reading, classification } = run;
  const words = settledWords(item, run, aiAllowed);
  const title =
    (item.titleSource === "user" || run.keepTitle === true) &&
    item.title !== undefined
      ? item.title
      : (words.title ?? item.title);
  return {
    title,
    description: words.description,
    tags: words.tags,
    content: reading.content,
    recipe: words.recipe,
    siteName: reading.siteName,
    author: reading.author,
    heroImageUrl: reading.heroImageUrl,
    media: reading.media,
    articleMedia: reading.articleMedia,
    ...(reading.storageId !== undefined
      ? { storageId: reading.storageId }
      : {}),
    aspectRatio: reading.aspectRatio,
    intents: words.intents,
    ...(words.cities !== undefined ? { cities: words.cities } : {}),
    status: "ready",
    enrichment: reading.enrichment,
    failureReason: undefined,
    searchText: buildSearchText({
      title,
      description: words.description,
      tags: words.tags,
      siteName: reading.siteName,
      note: item.note,
      content: reading.content,
    }),
    ...embeddingPatch(classification?.embedding, aiAllowed),
  };
}
