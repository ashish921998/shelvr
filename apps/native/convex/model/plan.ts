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
        source.author && `By: ${clip(source.author, 80)}`,
        source.siteName && `From: ${source.siteName}`,
        source.description && `Description: ${clip(source.description, 300)}`,
        source.content && `Text: ${clip(source.content, PLAN_CONTENT_CHARS)}`,
        source.places.length > 0 &&
          `Places: ${source.places.map((place) => clip(place, 120)).join("; ")}`,
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
  "cocktail",
  "cocktails",
  "wine",
  "brunch",
  "diner",
  "tavern",
  "pub",
  "trattoria",
  "osteria",
  "taqueria",
  "eatery",
  "shop",
  "spot",
]);

/** What a save offers as evidence: its text squashed whole, its separate
 * words, and its handles and hashtags squashed ("@parici_cafe" is
 * "paricicafe"), which run a name together with other words. */
type Evidence = { text: string; words: Set<string>; handles: string[] };

/** Squashed words in any script; punctuation and spaces split them. */
function splitWords(text: string): string[] {
  return text
    .split(/[^\p{L}\p{N}\p{M}]+/u)
    .map(squash)
    .filter(Boolean);
}

const APOSTROPHES = /['\u2019\u02bc]/g;

/** Words of a name, an apostrophe kept inside its word, so "McSorley's"
 * reads as "mcsorleys". */
function wordsOf(text: string): string[] {
  return splitWords(text.replace(APOSTROPHES, ""));
}

function evidenceOf(source: PlanSource): Evidence {
  const raw = [
    source.title,
    source.description,
    source.content?.slice(0, PLAN_CONTENT_CHARS),
    source.author,
    ...source.places,
  ]
    .filter(Boolean)
    .join(" ");
  // A pin marks a place the way a handle does ("📍dishoomlondon").
  const tagged = raw.match(/(?:[@#]|\u{1F4CD}\s*)[\p{L}\p{N}\p{M}_.]+/gu) ?? [];
  // The author is a handle even when written without the "@".
  const handles = [...tagged, source.author ?? ""].map(squash).filter(Boolean);
  // Both readings of an apostrophe: "Lilia's" names "Lilia" and a caption's
  // "McSorleys" names "McSorley's". A capital inside a word also starts one,
  // so "GymkhanaLondon" and "#LondonBAO" name "Gymkhana" and "BAO", and so
  // does a change between Latin and Japanese or Chinese ("東京でTsujihanの").
  const camel = raw
    .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, "$1 $2")
    .replace(
      /(\p{Script=Latin})(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu,
      "$1 ",
    )
    .replace(
      /([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])(?=\p{Script=Latin})/gu,
      "$1 ",
    );
  const words = new Set(
    [raw, camel].flatMap((text) => [...wordsOf(text), ...splitWords(text)]),
  );
  return { text: squash(raw), words, handles };
}

// Scripts written without spaces between words, where a name sits inside a
// longer run of text ("四谷のすし匠で").
const UNSPACED_SCRIPT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

// Korean spaces its words but writes particles onto them ("쵸리상경에서").
const HANGUL = /\p{Script=Hangul}/u;

/** A whole word of the save; part of one of its handles, at the start
 * ("@tigrenyc"), at the end ("#londonbao") or, for a word of 4 letters or
 * more, anywhere ("@eatatlilia");
 * in Korean, the start of a word, before a particle ("쵸리상경에서"); or, in a
 * script written without spaces, anywhere in its text. */
function saveSays(piece: string, evidence: Evidence): boolean {
  return (
    evidence.words.has(piece) ||
    evidence.handles.some(
      (handle) =>
        handle.startsWith(piece) ||
        handle.endsWith(piece) ||
        (piece.length >= 4 && handle.includes(piece)),
    ) ||
    (HANGUL.test(piece) &&
      [...evidence.words].some((word) => word.startsWith(piece))) ||
    (UNSPACED_SCRIPT.test(piece) && evidence.text.includes(piece))
  );
}

/**
 * True when the save names the place. The model may only pick places a save
 * names; this drops one it made up. A name made only of generic words
 * ("Cafe") describes a save, not a place, so it never grounds. Otherwise
 * every distinctive word must be something the save says (see `saveSays`),
 * so "Great pasta tonight" does not ground "Pasta Palace" and "Toronto" does
 * not ground "Oro", while "#TigreNYC" grounds "Tigre". A name may also be
 * written run together, so "@barlola_nyc" grounds "Bar Lola". A name with no
 * distinctive word ("Si Si", "Au 79") must appear word for word. A name with
 * an apostrophe is read both ways, so "L'Artusi" is "lartusi" or "artusi".
 */
function namesPlace(name: string, evidence: Evidence): boolean {
  const spelled = name.replace(/&/g, " and ");
  return [wordsOf(spelled), splitWords(spelled)].some((words) =>
    wordsName(words, evidence),
  );
}

function wordsName(words: string[], evidence: Evidence): boolean {
  const specific = words.filter((word) => !GENERIC_WORDS.has(word));
  const strong = specific.filter(distinctive);
  if (strong.length > 0) {
    const runTogether = [words.join(""), specific.join("")];
    return (
      strong.every((word) => saveSays(word, evidence)) ||
      (words.length > 1 &&
        runTogether.some(
          (joined) => distinctive(joined) && saveSays(joined, evidence),
        ))
    );
  }
  // The whole name must still be long enough to prove anything, so a word
  // like "Go" or "A" never grounds on its own.
  return (
    distinctive(specific.join("")) &&
    specific.every((word) => evidence.words.has(word))
  );
}

export function isGrounded(name: string, source: PlanSource): boolean {
  return namesPlace(name, evidenceOf(source));
}

/** A word of an area: a whole word of the save, or a distinctive one inside
 * its squashed text ("#soho"). */
function supportsAreaWord(word: string, evidence: Evidence): boolean {
  return (
    evidence.words.has(word) ||
    (distinctive(word) && evidence.text.includes(word))
  );
}

/**
 * Keep only the parts of an area the save names: it goes to Maps and shares.
 * Every word of each comma-separated part must be in the save, so "SoHo,
 * London" on a save about SoHo in New York keeps "SoHo" and never sends
 * anyone to the wrong city, and a state code ("IL") stays only when the save
 * has it as a word.
 */
function groundedArea(area: string, evidence: Evidence): string {
  return area
    .split(",")
    .map((part) => part.trim())
    .filter((part) => {
      const words = wordsOf(part);
      return (
        words.length > 0 &&
        words.every((word) => supportsAreaWord(word, evidence))
      );
    })
    .join(", ");
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
    if (key === "" || seen.has(key)) continue;
    const evidence = evidenceOf(source);
    if (!namesPlace(name, evidence)) continue;
    const why = clip(pick.why, MAX_WHY_CHARS);
    if (why === "") continue;
    seen.add(key);
    const area = groundedArea(clip(pick.area, MAX_AREA_CHARS), evidence);
    places.push({
      name,
      ...(area !== "" ? { area } : {}),
      why,
      itemId: source.itemId,
    });
  }
  return places;
}

// The model writes each reason in the app's language. Keys are the app's
// catalog locales; anything else gets English.
const PLAN_LANGUAGES: Record<string, string> = {
  en: "English",
  de: "German",
  es: "Spanish",
  "es-MX": "Mexican Spanish",
  fr: "French",
  "fr-CA": "Canadian French",
  ja: "Japanese",
  ko: "Korean",
  "pt-BR": "Brazilian Portuguese",
};

export function planLanguage(locale: string | undefined): string {
  return (locale && PLAN_LANGUAGES[locale]) || "English";
}
