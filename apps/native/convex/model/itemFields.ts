import { type Infer, v } from "convex/values";

import { placeKey, splitSavedPlace } from "./plan";
import type { Doc } from "../_generated/dataModel";
import { uniquePlacePins } from "./trip";

/** Project user removals over extraction results, including later reprocessing. */
export function visibleItemPlaces(item: Doc<"items">): Doc<"items"> {
  if (!item.removedPlaces?.length) return item;
  const removed = new Set(item.removedPlaces.map((entry) => entry.key));
  const placePins = item.placePins?.filter((pin) => {
    const hidden = item.removedPlaces?.some(
      (entry) => uniquePlacePins([pin, entry]).length === 1,
    );
    if (hidden) removed.add(placeKey(splitSavedPlace(pin.name).name));
    return !hidden;
  });
  const kept = new Set(
    placePins?.map((pin) => placeKey(splitSavedPlace(pin.name).name)),
  );
  const visible = (name: string) => {
    const key = placeKey(splitSavedPlace(name).name);
    return kept.has(key) || !removed.has(key);
  };
  return {
    ...item,
    places: item.places?.filter(visible),
    placePins,
    intents: item.intents?.filter(
      (intent) => intent.kind !== "open_maps" || visible(intent.value),
    ),
  };
}

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
  v.object({
    name: v.string(),
    lat: v.number(),
    lng: v.number(),
    city: v.optional(v.string()),
    appleId: v.optional(v.string()),
    /** Apple Maps' point-of-interest category, e.g. "Bakery"; the Map tab's filters read it. */
    category: v.optional(v.string()),
  }),
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

export const MAX_ITEM_CITIES = 30;

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

/** The place without a trailing ", <city>" qualifier, or null when it has none. Compares the whole city, so "Washington, D.C" works. */
export function withoutCitySuffix(place: string, city: string): string | null {
  const suffix = city.trim().toLowerCase();
  if (suffix === "" || !place.toLowerCase().endsWith(suffix)) return null;
  const head = place.slice(0, place.length - suffix.length).trimEnd();
  if (!head.endsWith(",")) return null;
  const name = head.slice(0, -1).trim();
  return name === "" ? null : name;
}

/** A sole source city is lookup context, not part of the venue's name. */
export function normalizePlaceName(
  raw: string,
  cities: readonly string[] = [],
): string {
  const place = raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:!?]+$/, "")
    .trim();
  const sourceCities = normalizeCities(cities);
  if (sourceCities.length !== 1) return place;
  return withoutCitySuffix(place, sourceCities[0]) ?? place;
}

export function normalizePlaces(
  raw: readonly string[] | undefined,
  cities: readonly string[] = [],
): string[] {
  const seen = new Set<string>();
  const places: string[] = [];
  for (const entry of raw ?? []) {
    const place = normalizePlaceName(entry, cities);
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
