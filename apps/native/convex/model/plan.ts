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
  savedAt: v.number(),
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  content: v.optional(v.string()),
  url: v.optional(v.string()),
  siteName: v.optional(v.string()),
  author: v.optional(v.string()),
  pins: v.optional(
    v.array(v.object({ name: v.string(), lat: v.number(), lng: v.number() })),
  ),
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

export function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function clip(text: string, max: number): string {
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

export function isStreetAddress(name: string): boolean {
  const words = wordsOf(name);
  if (
    ["burger", "burgers", "cafe", "bar", "restaurant", "bakery"].includes(
      words.at(-1) ?? "",
    )
  )
    return false;
  const startsWithNumber = /^#?\d/.test(name);
  const hasStreetWord = words.some(
    (word) => STREET_SUFFIXES.has(word) || STREET_PREFIXES.has(word),
  );
  return (
    (startsWithNumber && hasStreetWord) ||
    (words.length > 2 && STREET_PREFIXES.has(words[0]))
  );
}

const LANDMARK_WORDS = new Set([
  "tower",
  "torre",
  "museum",
  "museu",
  "museo",
  "de",
  "da",
  "do",
  "of",
  "la",
  "el",
]);
const PLACE_KINDS: Record<string, string> = {
  tower: "tower",
  torre: "tower",
  museum: "museum",
  museu: "museum",
  museo: "museum",
  cafe: "cafe",
  coffee: "cafe",
  bar: "bar",
  restaurant: "restaurant",
  bakery: "bakery",
  burger: "burger",
  burgers: "burger",
};

function aliasKind(name: string): string {
  return [
    ...new Set(
      wordsOf(name)
        .map((word) => PLACE_KINDS[word])
        .filter(Boolean),
    ),
  ]
    .sort()
    .join(":");
}

function aliasWords(name: string): string[] {
  return [
    ...new Set(
      wordsOf(name).filter(
        (word) =>
          word.length >= 3 &&
          !GENERIC_WORDS.has(word) &&
          !LANDMARK_WORDS.has(word),
      ),
    ),
  ].sort();
}

function oneEditApart(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4) return a === b;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function pinKey(place: PlanPlace, sources: PlanSource[]): string | undefined {
  const key = placeKey(place.name);
  const pins = sources
    .flatMap((source) => source.pins ?? [])
    .filter((pin) => placeKey(splitSavedPlace(pin.name).name) === key);
  const positions = new Set(
    pins.map((pin) => `${pin.lat.toFixed(6)}:${pin.lng.toFixed(6)}`),
  );
  // Conflicting pins cannot establish identity.
  return positions.size === 1 ? [...positions][0] : undefined;
}

/** Merge only matching saved map positions with supporting name similarity; never nearby businesses or name-only guesses. */
export function uniqueUnvisitedPlaces<T extends PlanPlace>(
  places: T[],
  sources: PlanSource[],
  been: ReadonlySet<string>,
): T[] {
  const groups: {
    place: T;
    position?: string;
    words: string[];
    kind: string;
    visited: boolean;
  }[] = [];
  for (const place of places) {
    const position = pinKey(place, sources);
    const words = aliasWords(place.name);
    const kind = aliasKind(place.name);
    const visited = been.has(placeKey(place.name));
    const existing =
      position === undefined
        ? undefined
        : groups.find(
            (group) =>
              group.position === position &&
              (kind === "" || group.kind === "" || kind === group.kind) &&
              words.length > 0 &&
              words.length === group.words.length &&
              words.every((word, index) =>
                oneEditApart(word, group.words[index]),
              ),
          );
    if (existing) existing.visited ||= visited;
    else groups.push({ place, position, words, kind, visited });
  }
  return groups.filter((group) => !group.visited).map((group) => group.place);
}

/** Shuffle stored candidates, never infer a new place from the save's text. */
export function suggestSavedPlaces(
  sources: PlanSource[],
  been: ReadonlySet<string>,
  limit: number,
): PlanPlace[] {
  const raw = sources.flatMap((source, index) =>
    source.places
      .filter((value) => !isStreetAddress(splitSavedPlace(value).name))
      .map((value) => {
        const { name, area } = splitSavedPlace(value);
        return {
          saveNumber: index + 1,
          name,
          area,
          why: source.description?.trim() || source.title?.trim() || name,
        };
      }),
  );
  const candidates = sanitizePicks(raw, sources, new Set(), raw.length).map(
    ({ place }) => place,
  );
  return shuffled(uniqueUnvisitedPlaces(candidates, sources, been)).slice(
    0,
    limit,
  );
}
