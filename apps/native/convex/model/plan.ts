import { type Infer, v } from "convex/values";

// "Make a plan": one model call over a space's saved items picks a shortlist
// of real places to go. Nothing is stored; the client holds the result. This
// module is the pure half (bounds, prompt lines, sanitizing), so it is tested
// without a model.

/** Saved items sent to the model, newest filed first. */
export const MAX_PLAN_ITEMS = 60;
/** Places in a plan. */
export const MAX_PLAN_PLACES = 5;
/** Per-item body excerpt. Captions name the place early; the rest is noise. */
export const PLAN_CONTENT_CHARS = 600;
const MAX_NAME_CHARS = 80;
const MAX_AREA_CHARS = 60;
const MAX_WHY_CHARS = 140;

/** What the claim mutation hands the action for one saved item. */
export const planSourceValidator = v.object({
  itemId: v.id("items"),
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  content: v.optional(v.string()),
  url: v.optional(v.string()),
  siteName: v.optional(v.string()),
  author: v.optional(v.string()),
  // The `open_maps` values the classifier already attached to the save.
  places: v.array(v.string()),
});

export type PlanSource = Infer<typeof planSourceValidator>;

export const planPlaceValidator = v.object({
  name: v.string(),
  area: v.optional(v.string()),
  why: v.string(),
  itemId: v.id("items"),
});

export type PlanPlace = Infer<typeof planPlaceValidator>;

/** What the model returns, before sanitizing. */
export type RawPlanPlace = {
  saveNumber: number;
  name: string;
  area: string;
  why: string;
};

function clip(text: string, max: number): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

/** One numbered prompt entry per save. */
export function planSourceLines(sources: PlanSource[]): string {
  return sources
    .map((source, i) => {
      const parts = [
        source.title && `Title: ${clip(source.title, 200)}`,
        source.author && `By: ${source.author}`,
        source.siteName && `From: ${source.siteName}`,
        source.description && `Description: ${clip(source.description, 300)}`,
        source.content && `Text: ${clip(source.content, PLAN_CONTENT_CHARS)}`,
        source.places.length > 0 && `Places: ${source.places.join("; ")}`,
      ].filter(Boolean);
      return `Save ${i + 1}\n${parts.join("\n")}`;
    })
    .join("\n\n");
}

/** Lowercase letters and digits only, in any script, accents folded. */
function squash(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** Shortest word that proves anything: 3 Latin letters, 2 in scripts like
 * Japanese or Korean, where a two-character name is common. */
function distinctive(word: string): boolean {
  return word.length >= (/^[a-z0-9]+$/.test(word) ? 3 : 2);
}

// Words that name a kind of place, not a place. A name made only of these
// ("the cafe") proves nothing about the save.
const GENERIC_WORDS = new Set([
  "the",
  "and",
  "bar",
  "cafe",
  "coffee",
  "restaurant",
  "kitchen",
  "bistro",
  "grill",
  "bakery",
  "pizza",
  "pizzeria",
  "club",
  "house",
  "room",
  "lounge",
]);

/**
 * True when the save's own text carries the place name. The model may only
 * pick places a save names; this drops one it made up. Loose on purpose: one
 * distinctive word of the name is enough, matched against the text with
 * spaces and punctuation removed, so "@parici_cafe" grounds "Par Ici Café".
 */
export function isGrounded(name: string, source: PlanSource): boolean {
  const haystack = squash(
    [
      source.title,
      source.description,
      source.content?.slice(0, PLAN_CONTENT_CHARS),
      source.author,
      ...source.places,
    ]
      .filter(Boolean)
      .join(" "),
  );
  if (haystack === "") return false;
  const words = name
    .split(/[\s\-–—&/,.']+/)
    .map(squash)
    .filter((word) => distinctive(word) && !GENERIC_WORDS.has(word));
  if (words.length === 0) {
    const whole = squash(name);
    return distinctive(whole) && haystack.includes(whole);
  }
  return words.some((word) => haystack.includes(word));
}

/**
 * Keep the model's picks that point at a real save, name a place that save
 * carries, and are not repeats. Order is the model's (best first).
 */
export function sanitizePlan(
  raw: RawPlanPlace[],
  sources: PlanSource[],
): PlanPlace[] {
  const places: PlanPlace[] = [];
  const seen = new Set<string>();
  for (const pick of raw) {
    if (places.length >= MAX_PLAN_PLACES) break;
    const n = pick.saveNumber;
    if (!Number.isInteger(n) || n < 1 || n > sources.length) continue;
    const source = sources[n - 1];
    const name = clip(pick.name, MAX_NAME_CHARS);
    const key = squash(name);
    if (key === "" || seen.has(key) || !isGrounded(name, source)) continue;
    const why = clip(pick.why, MAX_WHY_CHARS);
    if (why === "") continue;
    seen.add(key);
    const area = clip(pick.area, MAX_AREA_CHARS);
    places.push({
      name,
      ...(area !== "" ? { area } : {}),
      why,
      itemId: source.itemId,
    });
  }
  return places;
}
