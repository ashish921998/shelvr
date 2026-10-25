import { type Infer, v } from "convex/values";

export const MAX_PLAN_ITEMS = 60;
export const MAX_PLAN_PLACES = 5;
export const PLAN_CONTENT_CHARS = 600;
const MAX_NAME_CHARS = 80;
export const MAX_AREA_CHARS = 60;
export const MAX_WHY_CHARS = 140;
export const MAX_PLACE_NAME_CHARS = MAX_NAME_CHARS;

export const planSourceValidator = v.object({
  itemId: v.id("items"),
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  content: v.optional(v.string()),
  url: v.optional(v.string()),
  siteName: v.optional(v.string()),
  author: v.optional(v.string()),
  places: v.array(v.string()),
});

export type PlanSource = Infer<typeof planSourceValidator>;

export const planPlaceValidator = v.object({
  name: v.string(),
  area: v.optional(v.string()),
  why: v.string(),
  itemId: v.id("items"),
  been: v.optional(v.boolean()),
});

export type PlanPlace = Infer<typeof planPlaceValidator>;

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

function squash(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function distinctive(word: string): boolean {
  return word.length >= (/^[a-z0-9]+$/.test(word) ? 3 : 2);
}

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

type Evidence = { text: string; words: Set<string>; handles: string[] };

function splitWords(text: string): string[] {
  return text
    .split(/[^\p{L}\p{N}\p{M}]+/u)
    .map(squash)
    .filter(Boolean);
}

const APOSTROPHES = /['\u2019\u02bc]/g;

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
  const tagged = raw.match(/(?:[@#]|\u{1F4CD}\s*)[\p{L}\p{N}\p{M}_.]+/gu) ?? [];
  const author = source.author?.trim() ?? "";
  const handles = [...tagged, /\s/.test(author) ? "" : author]
    .map((handle) => squash(handle).normalize("NFC"))
    .filter(Boolean);
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

const UNSPACED_SCRIPT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

const HANGUL = /\p{Script=Hangul}/u;

function hangulPrefix(piece: string, evidence: Evidence): boolean {
  const syllables = piece.normalize("NFC");
  return [...evidence.words].some((word) =>
    word.normalize("NFC").startsWith(syllables),
  );
}

function saveSays(piece: string, evidence: Evidence): boolean {
  const composed = piece.normalize("NFC");
  return (
    evidence.words.has(piece) ||
    evidence.handles.some(
      (handle) =>
        handle.startsWith(composed) ||
        handle.endsWith(composed) ||
        (composed.length >= 4 && handle.includes(composed)),
    ) ||
    (HANGUL.test(piece) && hangulPrefix(piece, evidence)) ||
    (UNSPACED_SCRIPT.test(piece) && evidence.text.includes(piece))
  );
}

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
  return (
    distinctive(specific.join("")) &&
    specific.every((word) => evidence.words.has(word))
  );
}

export function placeKey(name: string): string {
  return squash(clip(name, MAX_NAME_CHARS));
}

export function isGrounded(name: string, source: PlanSource): boolean {
  return namesPlace(name, evidenceOf(source));
}

function supportsAreaWord(word: string, evidence: Evidence): boolean {
  return (
    evidence.words.has(word) ||
    (distinctive(word) && evidence.text.includes(word))
  );
}

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

const STREET_SUFFIXES = new Set([
  "street",
  "st",
  "road",
  "rd",
  "avenue",
  "ave",
  "lane",
  "ln",
  "boulevard",
  "blvd",
  "drive",
  "dr",
]);
const STREET_PREFIXES = new Set(["calle", "rue", "via", "strasse"]);

function isAddressPart(part: string): boolean {
  if (/^\s*\p{N}/u.test(part)) return true;
  const words = wordsOf(part);
  if (words.length < 2) return false;
  return (
    STREET_SUFFIXES.has(words[words.length - 1]) ||
    STREET_PREFIXES.has(words[0])
  );
}

function withoutAddress(name: string, evidence: Evidence): string {
  const parts = name.split(",");
  const at = parts.findIndex((part, i) => i > 0 && isAddressPart(part));
  if (at === -1) return name;
  const short = parts.slice(0, at).join(",").trim();
  return short !== "" && namesPlace(short, evidence) ? short : name;
}

/** Keeps deduped picks that point at a real save naming the place; places in `been` are always left out. */
export function sanitizePicks<T extends RawPlanPlace>(
  raw: T[],
  sources: PlanSource[],
  been: ReadonlySet<string>,
  limit: number,
): { pick: T; place: PlanPlace }[] {
  const kept: { pick: T; place: PlanPlace }[] = [];
  const seen = new Set<string>();
  for (const pick of raw) {
    const n = pick.saveNumber;
    if (!Number.isInteger(n) || n < 1 || n > sources.length) continue;
    const source = sources[n - 1];
    const evidence = evidenceOf(source);
    const name = withoutAddress(clip(pick.name, MAX_NAME_CHARS), evidence);
    const key = squash(name);
    if (key === "" || seen.has(key)) continue;
    if (!namesPlace(name, evidence)) continue;
    const why = clip(pick.why, MAX_WHY_CHARS);
    if (why === "") continue;
    seen.add(key);
    const area = groundedArea(clip(pick.area, MAX_AREA_CHARS), evidence);
    kept.push({
      pick,
      place: {
        name,
        ...(area !== "" ? { area } : {}),
        why,
        itemId: source.itemId,
        ...(been.has(key) ? { been: true } : {}),
      },
    });
  }
  const fresh = kept.filter(({ place }) => !place.been);
  return fresh.slice(0, limit);
}

export function sanitizePlan(
  raw: RawPlanPlace[],
  sources: PlanSource[],
  been: ReadonlySet<string> = new Set(),
): PlanPlace[] {
  return sanitizePicks(raw, sources, been, MAX_PLAN_PLACES).map(
    ({ place }) => place,
  );
}

/** Stored map labels may include an area after the name. */
export function splitSavedPlace(value: string): { name: string; area: string } {
  const [name, ...area] = value.split(",");
  return { name: name.trim(), area: area.join(",").trim() };
}

/** Shuffle stored candidates, never infer a new place from the save's text. */
export function suggestSavedPlaces(
  sources: PlanSource[],
  been: ReadonlySet<string>,
  limit: number,
): PlanPlace[] {
  const raw = sources.flatMap((source, index) =>
    source.places.map((value) => {
      const { name, area } = splitSavedPlace(value);
      return {
        saveNumber: index + 1,
        name,
        area,
        why: source.description?.trim() || source.title?.trim() || name,
      };
    }),
  );
  const places = sanitizePicks(raw, sources, been, raw.length).map(
    ({ place }) => place,
  );
  for (let i = places.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [places[i], places[j]] = [places[j], places[i]];
  }
  return places.slice(0, limit);
}
