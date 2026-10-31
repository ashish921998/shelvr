import { isRemovedSuggestion, type Removal } from "./placeRemovals";
import type { Id } from "../_generated/dataModel";
import type { ApplePoi } from "./appleMaps";
import {
  type DateEvening,
  type DateKind,
  type DateSlot,
  type DateStop,
  MAX_WALK_KM,
  pairs,
  sameVenue,
} from "./datePlan";
import { placeKey } from "./plan";
import { placeKinds } from "./placeKinds";
import { distanceKm } from "./trip";
import { samePlace } from "./placeIdentity";
import { isKnownChain, LODGING_CATEGORIES } from "./tripSuggest";

// The date planner's pure rules: which places fit which stop of which kind of date, and how
// evenings are ranked. Server only: the app reads the result through `./datePlan`.

/** Evenings one plan offers, best first. */
export const MAX_EVENINGS = 8;
/** Below this many evenings from the saves alone, Apple Maps is asked for second stops. */
export const MIN_SAVED_EVENINGS = 3;
/** Saved places that may be searched around for a missing stop. */
export const MAX_FILL_ANCHORS = 3;
/** A save made this recently counts as fresh on the person's mind. */
export const RECENT_SAVE_MS = 60 * 24 * 60 * 60 * 1000;

const DRINKS = new Set(["Nightlife", "Brewery", "Winery", "Distillery"]);
const WALKS = new Set(["Park", "NationalPark", "Beach", "Marina", "Hiking"]);
const WALK_TAGS = new Set([
  "park",
  "parks",
  "walk",
  "walks",
  "walking",
  "hike",
  "hiking",
  "trail",
  "trails",
  "beach",
  "garden",
  "gardens",
  "waterfront",
]);

/** What Apple Maps is asked for when a saved stop has no partner nearby. */
export const SLOT_SEARCHES: Record<
  DateKind,
  Record<DateSlot, { query: string; categories: readonly string[] }>
> = {
  classic: {
    first: { query: "dinner", categories: ["Restaurant"] },
    second: { query: "cocktail bar", categories: [...DRINKS] },
  },
  lowkey: {
    first: { query: "coffee", categories: ["Cafe"] },
    second: { query: "park", categories: [...WALKS] },
  },
};

function tagKinds(tags: readonly string[]) {
  return new Set(placeKinds(undefined, tags));
}

function walkTagged(tags: readonly string[]): boolean {
  return tags.some((tag) => WALK_TAGS.has(tag.trim().toLowerCase()));
}

function classicSlot(
  category: string | undefined,
  tags: readonly string[],
): DateSlot | null {
  const kinds = tagKinds(tags);
  const sweet = kinds.has("dessert") && !kinds.has("food");
  switch (category) {
    case undefined:
      if (kinds.has("food")) return "first";
      return kinds.has("drinks") || kinds.has("dessert") ? "second" : null;
    case "Restaurant":
      // Apple files most dessert and coffee shops as restaurants; the save says what they are.
      if (sweet) return "second";
      return kinds.has("coffee") && !kinds.has("food") ? null : "first";
    case "Bakery":
      return "second";
    case "Cafe":
      return sweet ? "second" : null;
    default:
      return DRINKS.has(category) ? "second" : null;
  }
}

function lowkeySlot(
  category: string | undefined,
  tags: readonly string[],
): DateSlot | null {
  const kinds = tagKinds(tags);
  const coffee = kinds.has("coffee") && !kinds.has("food");
  if (category === undefined) {
    if (kinds.has("coffee")) return "first";
    return walkTagged(tags) ? "second" : null;
  }
  if (category === "Cafe") return "first";
  if (category === "Bakery" || category === "Restaurant")
    return coffee ? "first" : null;
  return WALKS.has(category) ? "second" : null;
}

/**
 * The stop a place can be on this kind of date, or null. A save's tags describe the whole save,
 * so they only speak for a place when the save names that one place (`ownTags`).
 */
export function dateSlotOf(
  kind: DateKind,
  category: string | undefined,
  tags: readonly string[],
  ownTags: boolean,
): DateSlot | null {
  if (category !== undefined && LODGING_CATEGORIES.has(category)) return null;
  const known = ownTags ? tags : [];
  if (category === undefined && known.length === 0) return null;
  return kind === "classic"
    ? classicSlot(category, known)
    : lowkeySlot(category, known);
}

/** A saved place with a pin, and what the save it came from says about it. */
export type DateCandidate = {
  itemId?: Id<"items">;
  name: string;
  area?: string;
  why?: string;
  lat: number;
  lng: number;
  appleId?: string;
  category?: string;
  tags: string[];
  /** The save names this one place, so its tags are about it. */
  ownTags: boolean;
  savedAt: number;
};

export type ScoredStop = { stop: DateStop; score: number };

/** A saved place's weight: its own (+2), tagged for a date (+3), saved in the last 60 days (+1). */
export function savedScore(candidate: DateCandidate, now: number): number {
  const dateNight = placeKinds(candidate.category, candidate.tags).includes(
    "dateNight",
  );
  const recent = now - candidate.savedAt <= RECENT_SAVE_MS;
  return 2 + (dateNight ? 3 : 0) + (recent ? 1 : 0);
}

/** The candidates that fit this kind of date, one stop per venue, each with its weight. */
export function savedDateStops(
  kind: DateKind,
  candidates: readonly DateCandidate[],
  now: number,
): ScoredStop[] {
  const kept: ScoredStop[] = [];
  for (const candidate of candidates) {
    const slot = dateSlotOf(
      kind,
      candidate.category,
      candidate.tags,
      candidate.ownTags,
    );
    if (slot === null) continue;
    const score = savedScore(candidate, now);
    const {
      tags: _tags,
      ownTags: _ownTags,
      savedAt: _savedAt,
      ...place
    } = candidate;
    const stop: DateStop = { ...place, slot, source: "save" };
    const twin = kept.findIndex(
      (other) => other.stop.slot === slot && samePlace(other.stop, stop),
    );
    if (twin === -1) kept.push({ stop, score });
    else if (score > kept[twin].score) kept[twin] = { stop, score };
  }
  return kept;
}

/** Up to two points for a pair next door, falling to none at the walk limit. */
function closeness(a: DateStop, b: DateStop): number {
  return 2 * Math.max(0, 1 - distanceKm(a, b) / MAX_WALK_KM);
}

/** A playground is a park to Apple, not somewhere for a date's walk. */
const PLAYGROUND =
  /playground|spielplatz|aire de jeux|parque infantil|parquinho|児童遊園|어린이\s*공원|놀이터/i;

/**
 * Ranks every evening the stops can make, as whole pairs: the pair's weights, up to two points
 * for being close, and up to two points of chance, so the same saves deal a different order each time. Stops come back each
 * slot's best first, and evenings point into that order.
 */
export function rankEvenings(
  scored: readonly ScoredStop[],
  random: () => number = Math.random,
): { stops: DateStop[]; evenings: DateEvening[] } {
  const order = scored
    .map((entry) => ({ ...entry, rank: entry.score + random() }))
    .sort((a, b) => b.rank - a.rank);
  const stops = order.map((entry) => entry.stop);
  const candidates: (DateEvening & { rank: number })[] = [];
  order.forEach((a, first) => {
    if (a.stop.slot !== "first") return;
    order.forEach((b, second) => {
      if (!pairs(a.stop, b.stop)) return;
      candidates.push({
        first,
        second,
        rank: a.score + b.score + closeness(a.stop, b.stop) + random() * 2,
      });
    });
  });
  candidates.sort((a, b) => b.rank - a.rank);
  return {
    stops,
    evenings: candidates
      .slice(0, MAX_EVENINGS)
      .map(({ first, second }) => ({ first, second })),
  };
}

/** Saved stops to search around, best first, and the stop each one is missing. */
export function fillTargets(
  scored: readonly ScoredStop[],
): { anchor: DateStop; slot: DateSlot }[] {
  const targets: { anchor: DateStop; slot: DateSlot }[] = [];
  const byWeight = [...scored].sort((a, b) => b.score - a.score);
  for (const { stop } of byWeight) {
    if (targets.length >= MAX_FILL_ANCHORS) break;
    // Two anchors a few doors apart would ask Apple the same question twice.
    if (targets.some(({ anchor }) => distanceKm(anchor, stop) < 0.3)) continue;
    targets.push({
      anchor: stop,
      slot: stop.slot === "first" ? "second" : "first",
    });
  }
  return targets;
}

/** Keeps an Apple result that is the missing stop's kind, a walk from the anchor, and new. */
export function keepDateSuggestion(
  found: ApplePoi,
  context: {
    kind: DateKind;
    slot: DateSlot;
    anchor: DateStop;
    been: ReadonlySet<string>;
    removed?: readonly Removal[];
    taken: readonly DateStop[];
    chains: ReadonlySet<string>;
  },
): boolean {
  if (isRemovedSuggestion(context.removed ?? [], found)) return false;
  const key = placeKey(found.name);
  if (key === "" || context.been.has(key) || context.chains.has(key))
    return false;
  if (isKnownChain(found.name) || PLAYGROUND.test(found.name)) return false;
  // A result with no category cannot show it is a bar or a park.
  if (found.category === undefined) return false;
  if (dateSlotOf(context.kind, found.category, [], true) !== context.slot)
    return false;
  if (distanceKm(found, context.anchor) > MAX_WALK_KM) return false;
  return !context.taken.some((stop) => sameVenue(stop, found));
}

export function suggestedDateStop(found: ApplePoi, slot: DateSlot): DateStop {
  return {
    slot,
    source: "suggested",
    name: found.name,
    ...(found.area ? { area: found.area } : {}),
    lat: found.lat,
    lng: found.lng,
    ...(found.appleId !== undefined ? { appleId: found.appleId } : {}),
    ...(found.category !== undefined ? { category: found.category } : {}),
  };
}
