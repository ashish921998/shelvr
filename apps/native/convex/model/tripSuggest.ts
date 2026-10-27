import type { Id } from "../_generated/dataModel";
import { placeKey } from "./plan";
import {
  clusterPlaces,
  distanceKm,
  STOPS_PER_DAY,
  TRIP_SLOTS,
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
const SAME_PLACE_KM = 0.3;

export type FoundPoi = LatLng & {
  name: string;
  appleId?: string;
  category?: string;
  area?: string;
};

export type Suggestion = FoundPoi & { interest: TripInterest };

type Placed = LatLng & { name: string; appleId?: string };

/** The same venue: one Apple id, or one name a few doors apart. */
export function samePlace(a: Placed, b: Placed): boolean {
  if (a.appleId !== undefined && b.appleId !== undefined) {
    if (a.appleId === b.appleId) return true;
  }
  return (
    placeKey(a.name) === placeKey(b.name) && distanceKm(a, b) <= SAME_PLACE_KM
  );
}

/** Keeps a result that is near the centre, of the interest's kind, not a chain, not visited, and new. */
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
  if (
    found.category !== undefined &&
    interestOfCategory(found.category) !== found.interest
  )
    return false;
  if (isKnownChain(found.name)) return false;
  if (context.been.has(placeKey(found.name))) return false;
  return !context.taken.some((place) => samePlace(place, found));
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

const MORNING = new Set(["Cafe", "Bakery"]);
const EVENING = new Set(["Nightlife", "Brewery", "Distillery", "Winery"]);

/** The slot a category makes obvious; restaurants take lunch, then dinner, then none. */
function slotsFor(stops: PlannedStop[]): PlannedStop[] {
  let meals = 0;
  return stops.map((stop) => {
    if (stop.slot !== undefined || stop.category === undefined) return stop;
    if (MORNING.has(stop.category)) return { ...stop, slot: "morning" };
    if (EVENING.has(stop.category)) return { ...stop, slot: "evening" };
    if (stop.category === "Restaurant") {
      meals++;
      if (meals === 1) return { ...stop, slot: "lunch" };
      if (meals === 2) return { ...stop, slot: "dinner" };
    }
    return stop;
  });
}

function slotRank(stop: PlannedStop): number {
  return TRIP_SLOTS.indexOf(stop.slot ?? "afternoon");
}

/** By slot (no slot sits with the afternoon), and within a slot the nearest next stop. */
function orderStops(stops: PlannedStop[]): PlannedStop[] {
  const ordered: PlannedStop[] = [];
  const left = [...stops].sort((a, b) => slotRank(a) - slotRank(b));
  while (left.length > 0) {
    const rank = slotRank(left[0]);
    const from = ordered[ordered.length - 1];
    let pick = 0;
    if (from !== undefined) {
      let best = Infinity;
      left.forEach((stop, i) => {
        if (slotRank(stop) !== rank) return;
        const d = distanceKm(from, stop);
        if (d < best) {
          best = d;
          pick = i;
        }
      });
    }
    ordered.push(left.splice(pick, 1)[0]);
  }
  return ordered;
}

/** Lays out ranked stops (saves first) as `days` nearby groups at `pace`; the rest are unplanned, in rank order. */
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
    days: [...groups]
      .sort((a, b) => firstRank(a) - firstRank(b))
      .map((group) => orderStops(slotsFor(group))),
    unplanned: unplanned.sort(
      (a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0),
    ),
  };
}
