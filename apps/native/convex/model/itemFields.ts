import { type Infer, v } from "convex/values";

export const INTENT_KINDS = [
  "open_url",
  "copy",
  "web_search",
  "open_maps",
  "call",
  "email",
  "message",
  "add_event",
] as const;

export type IntentKind = (typeof INTENT_KINDS)[number];

export const intentKindValidator = v.union(
  ...INTENT_KINDS.map((kind) => v.literal(kind)),
);

export const intentValidator = v.object({
  kind: intentKindValidator,
  label: v.string(),
  value: v.string(),
});

export const placePinsValidator = v.array(
  v.object({ name: v.string(), lat: v.number(), lng: v.number() }),
);

export const postMediaValidator = v.object({
  kind: v.union(v.literal("photo"), v.literal("video"), v.literal("gif")),
  imageUrl: v.string(),
  aspectRatio: v.number(),
});

export type PostMedia = Infer<typeof postMediaValidator>;

export const articleMediaValidator = v.object({
  ...postMediaValidator.fields,
  paragraph: v.number(),
});

export type ArticleMedia = Infer<typeof articleMediaValidator>;

export const failureReasonValidator = v.union(
  v.literal("not_found"),
  v.literal("error"),
  v.literal("image_too_large"),
);

export const recipeValidator = v.object({
  name: v.optional(v.string()),
  servings: v.optional(v.string()),
  ingredients: v.array(v.string()),
  steps: v.array(v.string()),
});

export type Recipe = Infer<typeof recipeValidator>;

export const enrichmentValidator = v.union(
  v.literal("partial"),
  v.literal("no_article"),
);

export function isTerminalFailure(
  reason: Infer<typeof failureReasonValidator> | undefined,
): boolean {
  return reason === "not_found" || reason === "image_too_large";
}

/** Convex actions are killed at 10 minutes; 15 leaves margin. */
export const PROCESSING_STALE_MS = 15 * 60 * 1000;

export function isStaleProcessing(
  item: { status: string; processingStartedAt?: number; _creationTime: number },
  now: number,
): boolean {
  if (item.status !== "processing") {
    return false;
  }
  const startedAt = item.processingStartedAt ?? item._creationTime;
  return startedAt < now - PROCESSING_STALE_MS;
}

export const MAX_ITEM_TITLE_CHARS = 200;

export const MAX_NOTE_TEXT_CHARS = 100_000;

export const MAX_ITEM_CITIES = 3;

const MAX_CITY_CHARS = 60;
const NOT_A_CITY = new Set(["unknown", "n/a", "none", "various", "online"]);

export function normalizeCities(raw: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const cities: string[] = [];
  for (const entry of raw ?? []) {
    const city = entry
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[.,;:!?]+$/, "")
      .trim();
    const key = city.toLowerCase();
    if (
      city === "" ||
      city.length > MAX_CITY_CHARS ||
      NOT_A_CITY.has(key) ||
      seen.has(key)
    ) {
      continue;
    }
    seen.add(key);
    cities.push(city);
    if (cities.length === MAX_ITEM_CITIES) break;
  }
  return cities;
}

export const MAX_ITEM_PLACES = 30;

const MAX_PLACE_CHARS = 80;

export function normalizePlaces(raw: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const places: string[] = [];
  for (const entry of raw ?? []) {
    const place = entry
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[.,;:!?]+$/, "")
      .trim();
    const key = place.toLowerCase();
    if (place === "" || place.length > MAX_PLACE_CHARS || seen.has(key)) {
      continue;
    }
    seen.add(key);
    places.push(place);
    if (places.length === MAX_ITEM_PLACES) break;
  }
  return places;
}
