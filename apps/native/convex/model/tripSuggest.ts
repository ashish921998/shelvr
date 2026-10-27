import type { Id } from "../_generated/dataModel";
import type { ApplePoi } from "./appleMaps";
import {
  clip,
  MAX_WHY_CHARS,
  placeKey,
  splitSavedPlace,
  type PlanPlace,
  type PlanSource,
} from "./plan";
import {
  clusterPlaces,
  distanceKm,
  middleOf,
  SAME_PLACE_KM,
  STOPS_PER_DAY,
  type LatLng,
  type TripPace,
  type TripSlot,
} from "./trip";
import { TRIP_INTERESTS, type TripInterest } from "./tripPlan";

// The trip planner's pure rules: which Apple Maps categories and queries each
// interest searches, which results are kept, and how stops are laid out in days.
// Server only: the app never imports this module.

/** Apple Maps Server API `PoiCategory` values each interest searches. */
export const INTEREST_CATEGORIES: Record<TripInterest, readonly string[]> = {
  food: ["Restaurant", "Bakery"],
  coffee: ["Cafe"],
  drinks: ["Nightlife", "Brewery", "Winery", "Distillery"],
  culture: ["Museum", "Theater", "MusicVenue", "Planetarium"],
  sights: ["Landmark", "NationalMonument", "Castle", "Fortress"],
  outdoors: ["Park", "NationalPark", "Beach", "Marina"],
  shopping: ["Store"],
};

/** Plain words that search an interest when the saves offer no taste of their own. Never the bare word "landmark": it returns junk. */
export const GENERIC_QUERIES: Record<TripInterest, readonly string[]> = {
  food: ["restaurants", "local food"],
  coffee: ["coffee", "cafes"],
  drinks: ["bars", "cocktails"],
  culture: ["museums", "galleries"],
  sights: ["attractions", "monuments"],
  outdoors: ["parks", "gardens"],
  shopping: ["shops", "markets"],
};

/** Tag words that place a save without an Apple category under an interest. */
const TASTE_HINTS: Record<TripInterest, readonly string[]> = {
  food: ["food", "foodie", "restaurant", "restaurants", "eats", "brunch"],
  coffee: ["coffee", "cafe", "café", "coffee shop", "espresso", "matcha"],
  drinks: ["bar", "bars", "cocktails", "wine", "wine bar", "nightlife", "beer"],
  culture: ["museum", "museums", "art", "gallery", "theatre", "theater"],
  sights: ["sightseeing", "attractions", "landmarks", "viewpoint", "history"],
  outdoors: ["park", "parks", "hike", "hiking", "beach", "nature", "garden"],
  shopping: ["shopping", "shop", "boutique", "vintage", "thrift", "market"],
};

/** Tags too broad to search by: the interest's own query covers them. */
const GENERIC_TAGS = new Set(
  [
    "food",
    "foodie",
    "restaurant",
    "restaurants",
    "eats",
    "lunch",
    "dinner",
    "breakfast",
    "coffee",
    "cafe",
    "café",
    "cafes",
    "coffee shop",
    "bar",
    "bars",
    "drinks",
    "nightlife",
    "museum",
    "museums",
    "art",
    "culture",
    "park",
    "parks",
    "nature",
    "outdoors",
    "shopping",
    "shop",
    "shops",
    "store",
    "sightseeing",
    "sights",
    "attractions",
    "landmark",
    "landmarks",
    "history",
    "travel",
    "trip",
    "travel tips",
    "vacation",
    "holiday",
    "places",
    "things to do",
    "activities",
    "date",
    "date night",
    "date ideas",
    "romantic",
    "hidden gem",
    "hidden gems",
    "must try",
    "must visit",
    "bucket list",
    "recommendations",
    "guide",
    "list",
    "best",
    "top",
    "local",
    "tiktok",
    "instagram",
    "reel",
    "video",
    "recipe",
    "hotel",
    "hotels",
    "stay",
  ].map((tag) => tag.toLowerCase()),
);

const MAX_TASTE_CHARS = 30;
const MAX_TASTE_WORDS = 3;
/** Taste words searched per interest; the rest of the budget goes to plain words and spread. */
export const TASTES_PER_INTEREST = 2;

const CATEGORY_INTEREST = new Map<string, TripInterest>(
  TRIP_INTERESTS.flatMap((interest) =>
    INTEREST_CATEGORIES[interest].map((category) => [category, interest]),
  ),
);

export function interestOfCategory(
  category: string | undefined,
): TripInterest | undefined {
  return category === undefined ? undefined : CATEGORY_INTEREST.get(category);
}

/** A tag that can search Apple Maps: short, letters only, not generic, and not the city itself. */
export function tasteWord(tag: string, city: string): string | null {
  const word = tag.replace(/\s+/g, " ").trim().toLowerCase();
  if (word.length < 3 || word.length > MAX_TASTE_CHARS) return null;
  if (word.split(" ").length > MAX_TASTE_WORDS) return null;
  if (!/^[\p{L}][\p{L}\p{M}' &-]*$/u.test(word)) return null;
  if (GENERIC_TAGS.has(word)) return null;
  const cityWord = placeKey(city);
  if (cityWord !== "" && placeKey(word).includes(cityWord)) return null;
  return word;
}

function hintedInterests(tags: string[]): TripInterest[] {
  const lower = new Set(tags.map((tag) => tag.trim().toLowerCase()));
  return TRIP_INTERESTS.filter((interest) =>
    TASTE_HINTS[interest].some((hint) => lower.has(hint)),
  );
}

export type SaveTaste = { tags: string[]; categories: string[] };

/** Each interest's taste words from the saves filed under it (by pin category, else by tag), most frequent first. */
export function tasteQueries(
  tastes: SaveTaste[],
  interests: readonly TripInterest[],
  city: string,
): Record<TripInterest, string[]> {
  const counts = new Map<TripInterest, Map<string, number>>();
  for (const taste of tastes) {
    const byCategory = [
      ...new Set(
        taste.categories
          .map(interestOfCategory)
          .filter((interest) => interest !== undefined),
      ),
    ];
    const under =
      byCategory.length > 0 ? byCategory : hintedInterests(taste.tags);
    const words = [
      ...new Set(
        taste.tags
          .map((tag) => tasteWord(tag, city))
          .filter((word) => word !== null),
      ),
    ];
    for (const interest of under) {
      if (!interests.includes(interest)) continue;
      const tally = counts.get(interest) ?? new Map<string, number>();
      for (const word of words) tally.set(word, (tally.get(word) ?? 0) + 1);
      counts.set(interest, tally);
    }
  }
  const result = {} as Record<TripInterest, string[]>;
  for (const interest of interests) {
    // Map keeps insertion order, so a stable sort breaks ties by first seen.
    result[interest] = [...(counts.get(interest) ?? new Map<string, number>())]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TASTES_PER_INTEREST)
      .map(([word]) => word);
  }
  return result;
}

const SPREAD_KM = 4;

/** The centre, then four points a few km off it, so one dense block does not fill the trip. */
export function searchPoints(centre: LatLng): LatLng[] {
  const dLat = SPREAD_KM / 111;
  const dLng =
    SPREAD_KM / (111 * Math.max(0.2, Math.cos((centre.lat * Math.PI) / 180)));
  return [
    centre,
    { lat: centre.lat + dLat, lng: centre.lng + dLng },
    { lat: centre.lat - dLat, lng: centre.lng - dLng },
    { lat: centre.lat + dLat, lng: centre.lng - dLng },
    { lat: centre.lat - dLat, lng: centre.lng + dLng },
  ];
}

export type PlannedSearch = {
  interest: TripInterest;
  query: string;
  at: LatLng;
  categories: readonly string[];
};

/** One queue per interest: every query at the centre first, then the queries again from the spread points. */
export function searchQueues(
  interests: readonly TripInterest[],
  taste: Partial<Record<TripInterest, string[]>>,
  centre: LatLng,
): PlannedSearch[][] {
  const [middle, ...spread] = searchPoints(centre);
  return interests.map((interest) => {
    const queries = [
      ...new Set([...(taste[interest] ?? []), ...GENERIC_QUERIES[interest]]),
    ];
    const categories = INTEREST_CATEGORIES[interest];
    return [
      ...queries.map((query) => ({ interest, query, at: middle, categories })),
      ...spread.map((at, i) => ({
        interest,
        query: queries[i % queries.length],
        at,
        categories,
      })),
    ];
  });
}

/** Takes the next search from each queue still wanted, up to `size`, so every interest gets a turn before any gets two. */
export function nextBatch(
  queues: PlannedSearch[][],
  wanted: (interest: TripInterest) => boolean,
  size: number,
): PlannedSearch[] {
  const batch: PlannedSearch[] = [];
  for (const queue of queues) {
    if (batch.length >= size) break;
    const next = queue[0];
    if (next === undefined || !wanted(next.interest)) continue;
    batch.push(next);
    queue.shift();
  }
  return batch;
}

const KNOWN_CHAINS = new Set(
  [
    "Starbucks",
    "Starbucks Coffee",
    "McDonald's",
    "Burger King",
    "KFC",
    "Subway",
    "Dunkin'",
    "Dunkin' Donuts",
    "Tim Hortons",
    "Costa Coffee",
    "Pret A Manger",
    "Domino's",
    "Domino's Pizza",
    "Pizza Hut",
    "Taco Bell",
    "Wendy's",
    "Chipotle",
    "Chipotle Mexican Grill",
    "Nando's",
    "Five Guys",
    "Panda Express",
    "Chick-fil-A",
    "Popeyes",
    "Papa John's",
    "Greggs",
    "Wagamama",
    "Caffè Nero",
    "Dutch Bros",
    "Peet's Coffee",
    "Hard Rock Cafe",
    "H&M",
    "Zara",
    "Uniqlo",
    "Primark",
    "Sephora",
    "Walmart",
    "Target",
    "7-Eleven",
    "FamilyMart",
    "Lawson",
    "Aldi",
    "Lidl",
    "Tesco",
    "Sainsbury's",
    "Carrefour",
    "IKEA",
    "Walgreens",
    "CVS",
    "Boots",
    "Decathlon",
  ].map(placeKey),
);

/** Long chain names also catch a branch label ("Starbucks Reserve", "McDonald's Rossio"). */
const PREFIX_CHAIN_CHARS = 7;

export function isKnownChain(name: string): boolean {
  const key = placeKey(name);
  if (KNOWN_CHAINS.has(key)) return true;
  for (const chain of KNOWN_CHAINS) {
    if (chain.length >= PREFIX_CHAIN_CHARS && key.startsWith(chain))
      return true;
  }
  return false;
}

/** A name Apple returns under this many different ids in one city is a chain. */
export const CHAIN_BRANCHES = 3;

export function chainNames(
  results: { name: string; appleId?: string }[],
): Set<string> {
  const ids = new Map<string, Set<string>>();
  for (const result of results) {
    if (result.appleId === undefined) continue;
    const key = placeKey(result.name);
    const seen = ids.get(key) ?? new Set<string>();
    seen.add(result.appleId);
    ids.set(key, seen);
  }
  return new Set(
    [...ids]
      .filter(([, seen]) => seen.size >= CHAIN_BRANCHES)
      .map(([key]) => key),
  );
}

/** Results farther than this from the city centre are another town, whatever Apple calls the locality. */
export const SUGGEST_RADIUS_KM = 25;

export type FoundPoi = ApplePoi;

export type Suggestion = FoundPoi & { interest: TripInterest };

type Placed = LatLng & { name: string; appleId?: string };

/** Apple `PoiCategory` values for somewhere to sleep, never a stop. */
export const LODGING_CATEGORIES: ReadonlySet<string> = new Set([
  "Hotel",
  "Campground",
  "RVPark",
]);

function nameWords(name: string): string[] {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/['\u2019\u02bc]/g, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** One name's whole words run inside the other's ("Santa Joana" in "Locke de Santa Joana"), ignoring case and accents. */
export function nameWithin(a: string, b: string): boolean {
  const [short, long] = [nameWords(a), nameWords(b)].sort(
    (x, y) => x.length - y.length,
  );
  if (short.length === 0) return false;
  for (let start = 0; start + short.length <= long.length; start++) {
    if (short.every((word, i) => long[start + i] === word)) return true;
  }
  return false;
}

/**
 * The same venue: one Apple id, or a few doors apart under one name or one name inside the other
 * (often its hotel). Two different Apple ids still match on name within SAME_PLACE_KM, so a
 * restaurant and the hotel it sits in become one stop; uniquePlacePins must not do that, since
 * there distinct Apple ids are distinct places on the map.
 */
export function samePlace(a: Placed, b: Placed): boolean {
  if (a.appleId !== undefined && b.appleId !== undefined) {
    if (a.appleId === b.appleId) return true;
  }
  if (distanceKm(a, b) > SAME_PLACE_KM) return false;
  return placeKey(a.name) === placeKey(b.name) || nameWithin(a.name, b.name);
}

/**
 * A suggestion named after a place already in the trip ("Locke de Santa Joana" beside the saved
 * "Santa Joana") wherever its pin is: a saved pin can be a lookup miss across town, so distance
 * alone lets the venue's hotel back in. One-word names are too common to match city-wide.
 */
export function namesake(a: Placed, b: Placed): boolean {
  const shorter = Math.min(nameWords(a.name).length, nameWords(b.name).length);
  return shorter >= 2 && nameWithin(a.name, b.name);
}

/** Keeps a result that is near the centre, of the interest's kind, not lodging, not a chain, not visited, and new. */
export function keepSuggestion(
  found: Suggestion,
  context: {
    centre: LatLng;
    been: ReadonlySet<string>;
    taken: Placed[];
  },
): boolean {
  if (placeKey(found.name) === "") return false;
  if (distanceKm(found, context.centre) > SUGGEST_RADIUS_KM) return false;
  if (found.category !== undefined && LODGING_CATEGORIES.has(found.category))
    return false;
  if (
    found.category !== undefined &&
    interestOfCategory(found.category) !== found.interest
  )
    return false;
  if (isKnownChain(found.name)) return false;
  if (context.been.has(placeKey(found.name))) return false;
  return !context.taken.some(
    (place) => samePlace(place, found) || namesake(place, found),
  );
}

/** Takes suggestions in turn across the interests (each list best first) until `count`, never the same venue twice. */
export function balanceSuggestions(
  lists: ReadonlyMap<TripInterest, Suggestion[]>,
  interests: readonly TripInterest[],
  count: number,
  chains: ReadonlySet<string> = new Set(),
): Suggestion[] {
  const queues = interests.map((interest) =>
    (lists.get(interest) ?? []).filter(
      (place) => !chains.has(placeKey(place.name)),
    ),
  );
  const picked: Suggestion[] = [];
  while (picked.length < count && queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      if (picked.length >= count) break;
      let next = queue.shift();
      while (next && picked.some((place) => samePlace(place, next!))) {
        next = queue.shift();
      }
      if (next) picked.push(next);
    }
  }
  return picked;
}

export type PlannedStop = LatLng & {
  source: "save" | "suggested";
  itemId?: Id<"items">;
  name: string;
  area?: string;
  appleId?: string;
  category?: string;
  why?: string;
  slot?: TripSlot;
};

function isLodging(stop: PlannedStop): boolean {
  return stop.category !== undefined && LODGING_CATEGORIES.has(stop.category);
}

/**
 * One stop per venue among the saves: a guide can name a restaurant and the hotel it sits in
 * ("Santa Joana", "Locke de Santa Joana"), and their pins can land apart when one lookup missed.
 * The venue keeps the name that isn't lodging, and the pin Apple matched when its own wasn't.
 */
export function mergeSavedNamesakes(stops: PlannedStop[]): PlannedStop[] {
  const kept: PlannedStop[] = [];
  for (const stop of stops) {
    const at = kept.findIndex((other) => namesake(other, stop));
    if (at === -1) {
      kept.push(stop);
      continue;
    }
    const other = kept[at];
    const [keep, drop] =
      isLodging(other) && !isLodging(stop) ? [stop, other] : [other, stop];
    const matched = keep.appleId === undefined && drop.appleId !== undefined;
    // Only the pin moves: the other venue's Apple id would open the hotel's place card.
    kept[at] = matched ? { ...keep, lat: drop.lat, lng: drop.lng } : keep;
  }
  return kept;
}

/** Distinct places a save names, by name. */
function namedPlaces(source: PlanSource): number {
  return new Set(
    source.places
      .map((value) => placeKey(splitSavedPlace(value).name))
      .filter(Boolean),
  ).size;
}

/**
 * Why a saved place is on the trip. A save naming one place keeps its own reason; a guide
 * naming several gives its title (else its site), since its description is about the
 * whole list, not this place. Saves carry no per-place note to prefer.
 */
export function saveWhy(
  place: PlanPlace,
  source: PlanSource | undefined,
): string | undefined {
  if (source === undefined || namedPlaces(source) <= 1) return place.why;
  const label = clip(
    source.title?.trim() || source.siteName?.trim() || "",
    MAX_WHY_CHARS,
  );
  return label === "" ? undefined : label;
}

const MORNING = new Set(["Cafe", "Bakery"]);
const EVENING = new Set(["Nightlife", "Brewery", "Distillery", "Winery"]);

const isMorning = (stop: PlannedStop) =>
  stop.category !== undefined && MORNING.has(stop.category);
const isEvening = (stop: PlannedStop) =>
  stop.category !== undefined && EVENING.has(stop.category);

/** Walking length of a route in order, in km. */
export function routeKm(stops: LatLng[]): number {
  let km = 0;
  for (let i = 1; i < stops.length; i++)
    km += distanceKm(stops[i - 1], stops[i]);
  return km;
}

/** Shorter by more than rounding: keeps ties on the earlier candidate, so the result is deterministic. */
const EPSILON_KM = 1e-9;

/** Nearest next stop from `start` through `middle`, then `end` when the day must finish there. */
function nearestNeighbour(
  start: PlannedStop,
  middle: PlannedStop[],
  end: PlannedStop | undefined,
): PlannedStop[] {
  const route = [start];
  const left = [...middle];
  while (left.length > 0) {
    const from = route[route.length - 1];
    let pick = 0;
    for (let i = 1; i < left.length; i++) {
      if (distanceKm(from, left[i]) < distanceKm(from, left[pick]) - EPSILON_KM)
        pick = i;
    }
    route.push(left.splice(pick, 1)[0]);
  }
  if (end !== undefined) route.push(end);
  return route;
}

/** Reverses any stretch that shortens the route until none does, so no two legs cross. The first stop stays, and the last when `endFixed`. */
function twoOpt(route: PlannedStop[], endFixed: boolean): PlannedStop[] {
  const r = [...route];
  const last = endFixed ? r.length - 2 : r.length - 1;
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < last; i++) {
      for (let j = i + 1; j <= last; j++) {
        const after = r[j + 1];
        const before =
          distanceKm(r[i - 1], r[i]) +
          (after === undefined ? 0 : distanceKm(r[j], after));
        const swapped =
          distanceKm(r[i - 1], r[j]) +
          (after === undefined ? 0 : distanceKm(r[i], after));
        if (swapped < before - EPSILON_KM) {
          r.splice(i, j - i + 1, ...r.slice(i, j + 1).reverse());
          improved = true;
        }
      }
    }
  }
  return r;
}

/**
 * Orders a day's stops as a short walking route: from each sensible start, nearest next
 * stop, then 2-opt until no reversal shortens it; the shortest wins, ties to the earlier
 * stop. A day with a cafe or bakery starts at one, and a day with a bar ends at one.
 */
export function routeOrder(stops: PlannedStop[]): PlannedStop[] {
  if (stops.length <= 1) return [...stops];
  const evenings = stops.filter(isEvening);
  const ends: (PlannedStop | undefined)[] =
    evenings.length > 0 ? evenings : [undefined];
  let best: PlannedStop[] = [];
  let bestKm = Infinity;
  for (const end of ends) {
    const open = stops.filter((stop) => stop !== end);
    const mornings = open.filter(isMorning);
    for (const start of mornings.length > 0 ? mornings : open) {
      const middle = open.filter((stop) => stop !== start);
      const route = twoOpt(
        nearestNeighbour(start, middle, end),
        end !== undefined,
      );
      const km = routeKm(route);
      if (km < bestKm - EPSILON_KM) {
        best = route;
        bestKm = km;
      }
    }
  }
  return best;
}

/**
 * Slots that agree with the route: a cafe or bakery that opens the day is morning, a bar
 * that closes it is evening, the first restaurant in the first half is lunch and the
 * first in the second half dinner. Any other stop gets no slot rather than a wrong one.
 */
function slotsAlong(route: PlannedStop[]): PlannedStop[] {
  const mid = (route.length - 1) / 2;
  let lunch = false;
  let dinner = false;
  return route.map((stop, i) => {
    const { slot: _old, ...plain } = stop;
    if (i === 0 && isMorning(stop)) return { ...plain, slot: "morning" };
    if (i === route.length - 1 && isEvening(stop))
      return { ...plain, slot: "evening" };
    if (stop.category !== "Restaurant") return plain;
    if (!lunch && i <= mid) {
      lunch = true;
      return { ...plain, slot: "lunch" };
    }
    if (!dinner && i > mid) {
      dinner = true;
      return { ...plain, slot: "dinner" };
    }
    return plain;
  });
}

function savesIn(day: PlannedStop[]): number {
  return day.filter((stop) => stop.source === "save").length;
}

function nearestIndex(
  stops: PlannedStop[],
  to: LatLng | null,
  source: PlannedStop["source"],
): number {
  let pick = -1;
  let best = Infinity;
  stops.forEach((stop, i) => {
    if (stop.source !== source) return;
    const d = to === null ? 0 : distanceKm(stop, to);
    if (d < best) {
      best = d;
      pick = i;
    }
  });
  return pick;
}

/**
 * Gives every day at least its whole share of the saves (saves ÷ days, rounded down), so
 * one day is not all suggestions. A short day takes the save nearest it from a day with
 * more than its share, and hands that day its own nearest suggestion so day lengths hold.
 */
export function spreadSaves(groups: PlannedStop[][]): PlannedStop[][] {
  const days = groups.map((day) => [...day]);
  const share = Math.floor(
    days.reduce((n, day) => n + savesIn(day), 0) / Math.max(1, days.length),
  );
  for (;;) {
    const short = days.findIndex((day) => savesIn(day) < share);
    if (short === -1) return days;
    const target = middleOf(days[short]);
    let from = -1;
    let at = -1;
    let best = Infinity;
    days.forEach((day, i) => {
      if (i === short || savesIn(day) <= share) return;
      const pick = nearestIndex(day, target, "save");
      const d = target === null ? -savesIn(day) : distanceKm(day[pick], target);
      if (d < best) {
        best = d;
        from = i;
        at = pick;
      }
    });
    // Unreachable: a day under the share means another is over it.
    if (from === -1) return days;
    const [save] = days[from].splice(at, 1);
    const back = nearestIndex(
      days[short],
      middleOf(days[from]) ?? save,
      "suggested",
    );
    if (back !== -1) days[from].push(days[short].splice(back, 1)[0]);
    days[short].push(save);
  }
}

/** Lays out ranked stops (saves first) as `days` nearby groups at `pace`, saves spread across them; the rest are unplanned, in rank order. */
export function layoutTripPlan(
  stops: PlannedStop[],
  options: { days: number; pace: TripPace },
): { days: PlannedStop[][]; unplanned: PlannedStop[] } {
  const perDay = STOPS_PER_DAY[options.pace];
  const room = perDay * options.days;
  const chosen = stops.slice(0, room);
  const unplanned = stops.slice(room);
  const groups: PlannedStop[][] = Array.from(
    { length: options.days },
    () => [],
  );
  const assignment = clusterPlaces(chosen, options.days, perDay);
  chosen.forEach((stop, i) => {
    const day = assignment[i];
    if (day === undefined || day < 0) unplanned.push(stop);
    else groups[day].push(stop);
  });
  const rank = new Map(stops.map((stop, i) => [stop, i]));
  const firstRank = (group: PlannedStop[]) =>
    group.length === 0
      ? Infinity
      : Math.min(...group.map((stop) => rank.get(stop) ?? Infinity));
  return {
    days: spreadSaves(groups)
      .sort((a, b) => firstRank(a) - firstRank(b))
      .map((group) => slotsAlong(routeOrder(group))),
    unplanned: unplanned.sort(
      (a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0),
    ),
  };
}
