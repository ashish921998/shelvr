/**
 * The Map tab's filters. A place's kinds come from Apple Maps' point-of-interest category when the
 * pin has one, and otherwise from the tags of the save that named it. "Date night" has no Apple
 * category, so it always comes from the save's tags, and only for a place you could spend one at.
 */
export const PLACE_KINDS = [
  "food",
  "coffee",
  "dessert",
  "drinks",
  "dateNight",
  "activities",
  "shopping",
  "stay",
] as const;

export type PlaceKind = (typeof PLACE_KINDS)[number];

export const CUISINES = [
  "burger",
  "pizza",
  "tacos",
  "sushi",
  "noodles",
  "dumplings",
  "bbq",
  "steak",
  "seafood",
  "curry",
  "pasta",
  "donuts",
  "ice cream",
  "bakery",
  "bagels",
  "dessert",
  "coffee",
  "tea",
  "beer",
  "wine",
  "cocktails",
  "brunch",
  "sandwiches",
  "salad",
  "chicken",
] as const;

export type Cuisine = (typeof CUISINES)[number];

type CategoryKind = Exclude<PlaceKind, "dateNight">;

const CATEGORY_KINDS: Record<string, CategoryKind> = {
  Restaurant: "food",
  FoodMarket: "food",
  Cafe: "coffee",
  Bakery: "dessert",
  Nightlife: "drinks",
  Brewery: "drinks",
  Winery: "drinks",
  Distillery: "drinks",
  AmusementPark: "activities",
  Aquarium: "activities",
  Beach: "activities",
  Bowling: "activities",
  Castle: "activities",
  Fortress: "activities",
  GoKart: "activities",
  Hiking: "activities",
  Landmark: "activities",
  MiniGolf: "activities",
  MovieTheater: "activities",
  Museum: "activities",
  MusicVenue: "activities",
  NationalMonument: "activities",
  NationalPark: "activities",
  Park: "activities",
  Planetarium: "activities",
  RockClimbing: "activities",
  Skating: "activities",
  Spa: "activities",
  Stadium: "activities",
  Theater: "activities",
  Zoo: "activities",
  Store: "shopping",
  Hotel: "stay",
};

const TAG_KINDS: Record<CategoryKind, readonly string[]> = {
  food: [
    "food",
    "foodie",
    "restaurant",
    "restaurants",
    "eats",
    "brunch",
    "lunch",
    "dinner",
    "dining",
    "street food",
    "pizza",
    "sushi",
    "tacos",
    "ramen",
    "burger",
    "burgers",
  ],
  coffee: ["coffee", "cafe", "café", "cafes", "cafés", "coffee shop", "matcha"],
  dessert: [
    "dessert",
    "desserts",
    "bakery",
    "bakeries",
    "ice cream",
    "gelato",
    "sweets",
    "pastry",
    "pastries",
    "donuts",
    "cake",
  ],
  drinks: [
    "bar",
    "bars",
    "cocktails",
    "cocktail bar",
    "wine",
    "wine bar",
    "nightlife",
    "drinks",
    "beer",
    "rooftop bar",
    "speakeasy",
  ],
  activities: [
    "things to do",
    "activities",
    "museum",
    "museums",
    "hike",
    "hiking",
    "park",
    "sightseeing",
    "attractions",
  ],
  shopping: ["shopping", "shop", "boutique", "vintage", "thrift"],
  stay: ["hotel", "hotels", "stay", "airbnb"],
};

const DATE_TAGS = [
  "date night",
  "date",
  "date ideas",
  "date spot",
  "date spots",
  "romantic",
];

/** Categories an Apple pin can carry and still be a dessert or coffee stop the save is about. */
const FOOD_CATEGORIES = new Set(["Restaurant", "Cafe", "Bakery", "FoodMarket"]);

/** Kinds a date night can happen at. */
const DATE_KINDS = new Set<PlaceKind>([
  "food",
  "coffee",
  "dessert",
  "drinks",
  "activities",
]);

/** Every word or phrase a kind or date night listens for. */
const KNOWN_WORDS = [...Object.values(TAG_KINDS).flat(), ...DATE_TAGS];

/** A tag or known phrase as its lowercase words, punctuation dropped. */
function wordsOf(text: string): string[] {
  return text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

const KNOWN_PHRASES = KNOWN_WORDS.map((word) => ({
  word,
  parts: wordsOf(word),
}));

/**
 * The known words and phrases a tag names, whole words only, so "parking" never reads as "park".
 * Read left to right, taking the longest phrase at each word: "sf coffee shop" names
 * "coffee shop", not "shop", while "coffee shop and vintage shop" names both.
 */
function tagWords(tag: string): string[] {
  const parts = wordsOf(tag);
  const found: string[] = [];
  let at = 0;
  while (at < parts.length) {
    const longest = KNOWN_PHRASES.filter((phrase) =>
      phrase.parts.every((part, index) => parts[at + index] === part),
    ).reduce<(typeof KNOWN_PHRASES)[number] | undefined>(
      (best, phrase) =>
        !best || phrase.parts.length > best.parts.length ? phrase : best,
      undefined,
    );
    if (longest) found.push(longest.word);
    at += longest ? longest.parts.length : 1;
  }
  return found;
}

/** Whether a save's tags name one of these words, alone ("bars") or inside a longer tag ("sf restaurants"). */
function tagged(tags: ReadonlySet<string>, words: readonly string[]): boolean {
  return [...tags].some((tag) =>
    tagWords(tag).some((word) => words.includes(word)),
  );
}

const CUISINE_KINDS: Partial<Record<Cuisine, CategoryKind>> = {
  coffee: "coffee",
  tea: "coffee",
  bakery: "dessert",
  cocktails: "drinks",
  wine: "drinks",
  beer: "drinks",
  dessert: "dessert",
  "ice cream": "dessert",
  donuts: "dessert",
};

const CUISINE_CATEGORIES = new Set([
  "Restaurant",
  "Cafe",
  "Bakery",
  "Nightlife",
]);

export function refiningCuisine(
  category: string | undefined,
  cuisine: Cuisine | undefined,
): Cuisine | undefined {
  return category === undefined || CUISINE_CATEGORIES.has(category)
    ? cuisine
    : undefined;
}

export function placeKinds(
  category: string | undefined,
  saveTags: readonly string[],
  cuisine?: Cuisine,
): PlaceKind[] {
  const tags = new Set(saveTags.map((tag) => tag.trim().toLowerCase()));
  const kinds = new Set<PlaceKind>();
  const fromCategory = category ? CATEGORY_KINDS[category] : undefined;
  const served = refiningCuisine(category, cuisine);
  if (served) {
    const fromCuisine = CUISINE_KINDS[served] ?? "food";
    kinds.add(fromCuisine);
    if (fromCategory && fromCuisine === "food") kinds.add(fromCategory);
  } else {
    if (fromCategory) kinds.add(fromCategory);
    for (const kind of tagKinds(category, tags)) kinds.add(kind);
  }
  const datable =
    category === undefined || [...kinds].some((kind) => DATE_KINDS.has(kind));
  if (datable && tagged(tags, DATE_TAGS)) kinds.add("dateNight");
  return PLACE_KINDS.filter((kind) => kinds.has(kind));
}

function tagKinds(
  category: string | undefined,
  tags: ReadonlySet<string>,
): CategoryKind[] {
  if (category === undefined)
    return (Object.entries(TAG_KINDS) as [CategoryKind, readonly string[]][])
      .filter(([, words]) => tagged(tags, words))
      .map(([kind]) => kind);
  if (!FOOD_CATEGORIES.has(category)) return [];
  // Apple files most dessert and coffee shops as restaurants; the save says what they are.
  return (["dessert", "coffee"] as const).filter((kind) =>
    tagged(tags, TAG_KINDS[kind]),
  );
}

export function mergeVenueKinds<
  T extends {
    category?: string;
    cuisine?: Cuisine;
    kinds: readonly PlaceKind[];
  },
>(kept: T, repeat: T): T {
  return {
    ...kept,
    ...(kept.category || !repeat.category ? {} : { category: repeat.category }),
    ...(kept.cuisine || !repeat.cuisine ? {} : { cuisine: repeat.cuisine }),
    kinds: PLACE_KINDS.filter(
      (kind) => kept.kinds.includes(kind) || repeat.kinds.includes(kind),
    ),
  };
}
