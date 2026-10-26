import { v, type Infer, type ObjectType } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import {
  buildEmbeddingText,
  CURRENT_EMBEDDING_VERSION,
  isValidEmbedding,
} from "./embedding";
import {
  articleMediaValidator,
  enrichmentValidator,
  failureReasonValidator,
  intentValidator,
  normalizePlaces,
  postMediaValidator,
  recipeValidator,
  type Recipe,
} from "./itemFields";
import { buildSearchText } from "./searchText";

const readingValidator = v.object({
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

const classificationValidator = v.object({
  title: v.optional(v.string()),
  description: v.string(),
  tags: v.array(v.string()),
  intents: v.optional(v.array(intentValidator)),
  cities: v.optional(v.array(v.string())),
  places: v.optional(v.array(v.string())),
  placesHeard: v.optional(v.boolean()),
  recipe: v.optional(recipeValidator),
  embedding: v.optional(
    v.object({ text: v.string(), vector: v.array(v.float64()) }),
  ),
});

export type Reading = Infer<typeof readingValidator>;
export type Classification = Infer<typeof classificationValidator>;

export const runFields = {
  keepTitle: v.optional(v.boolean()),
  reading: readingValidator,
  classification: v.optional(classificationValidator),
};

export type Settlement = ObjectType<typeof runFields>;

export type ItemPatch = Partial<Omit<Doc<"items">, "_id" | "_creationTime">>;

type Words = {
  title: string | undefined;
  description: string;
  tags: string[];
  intents: Doc<"items">["intents"];
  cities: string[] | undefined;
  places: string[] | undefined;
  placesHeard: boolean | undefined;
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
    places: item.places,
    placesHeard: item.placesHeard,
    recipe: reading.recipe ?? item.recipe,
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
    places:
      classification.places === undefined
        ? undefined
        : normalizePlaces(classification.places, classification.cities),
    placesHeard: classification.placesHeard,
    recipe: reading.recipe ?? classification.recipe,
  };
}

function settledWords(
  item: Doc<"items">,
  { reading, classification }: Settlement,
  aiAllowed: boolean,
): Words {
  return classification !== undefined && aiAllowed
    ? classifiedWords(reading, classification)
    : readingWords(item, reading);
}

function settledTitle(
  item: Doc<"items">,
  keepTitle: boolean | undefined,
  words: Words,
): string | undefined {
  return (item.titleSource === "user" || keepTitle === true) &&
    item.title !== undefined
    ? item.title
    : (words.title ?? item.title);
}

export function embeddingText(item: Doc<"items">, run: Settlement): string {
  const words = settledWords(item, run, true);
  return buildEmbeddingText({
    title: settledTitle(item, run.keepTitle, words),
    description: words.description,
    tags: words.tags,
    siteName: run.reading.siteName,
    note: item.note,
    content: run.reading.content,
  });
}

function embeddingPatch(
  item: Doc<"items">,
  run: Settlement,
  aiAllowed: boolean,
): Pick<ItemPatch, "embedding" | "embeddingVersion" | "embeddingAttempts"> {
  const embedding = run.classification?.embedding;
  // Convex rejects a wrong-width vector at write time, which would fail this whole transaction.
  if (
    aiAllowed &&
    embedding !== undefined &&
    embedding.text === embeddingText(item, run) &&
    isValidEmbedding(embedding.vector)
  ) {
    return {
      embedding: embedding.vector,
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
  const { reading } = run;
  const words = settledWords(item, run, aiAllowed);
  const title = settledTitle(item, run.keepTitle, words);
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
    ...(words.places !== undefined ? { places: words.places } : {}),
    ...(words.placesHeard !== undefined
      ? { placesHeard: words.placesHeard }
      : {}),
    status: "ready",
    enrichment: reading.enrichment,
    failureReason: undefined,
    searchText: buildSearchText({
      title,
      cities: words.cities ?? item.cities,
      places: words.places ?? item.places,
      description: words.description,
      tags: words.tags,
      siteName: reading.siteName,
      note: item.note,
      content: reading.content,
    }),
    ...embeddingPatch(item, run, aiAllowed),
  };
}

/**
 * A failed run writes only how it ended; the save keeps what earlier runs gave it.
 * Null once the run has settled the save ready: a later step's error is not the save's.
 */
export function failurePatch(
  item: Doc<"items">,
  reason: Infer<typeof failureReasonValidator>,
): ItemPatch | null {
  return item.status === "ready"
    ? null
    : { status: "failed", failureReason: reason };
}
