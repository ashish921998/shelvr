import { nameWords } from "@convex/model/placeIdentity";
import {
  refiningCuisine,
  type Cuisine,
  type PlaceKind,
} from "@convex/model/placeKinds";

/** Apple Maps' point-of-interest categories; any other category falls back to the place's kinds. */
const CATEGORY_EMOJI: Record<string, string> = {
  Restaurant: "🍽️",
  FoodMarket: "🛒",
  Cafe: "☕",
  Bakery: "🥐",
  Nightlife: "🍸",
  Brewery: "🍺",
  Winery: "🍷",
  Distillery: "🥃",
  Museum: "🏛️",
  Landmark: "📸",
  NationalMonument: "🏛️",
  Castle: "🏰",
  Fortress: "🏰",
  Park: "🌳",
  NationalPark: "🏞️",
  Hiking: "🥾",
  Beach: "🏖️",
  Theater: "🎭",
  MovieTheater: "🎬",
  MusicVenue: "🎵",
  Stadium: "🏟️",
  Zoo: "🦁",
  Aquarium: "🐠",
  Planetarium: "🔭",
  Spa: "💆",
  FitnessCenter: "🏋️",
  AmusementPark: "🎢",
  Bowling: "🎳",
  GoKart: "🏎️",
  MiniGolf: "⛳",
  RockClimbing: "🧗",
  Skating: "⛸️",
  Store: "🛍️",
  Hotel: "🛏️",
};

/** Without a known category, the most specific kind wins: a coffee save tagged food is a café. */
export function categoryEmoji(category: string): string | undefined {
  return CATEGORY_EMOJI[category];
}

export const KIND_EMOJI: Record<PlaceKind, string> = {
  food: "🍽️",
  coffee: "☕",
  dessert: "🍰",
  drinks: "🍸",
  dateNight: "💕",
  activities: "🎟️",
  shopping: "🛍️",
  stay: "🛏️",
};

const PIN_KIND_ORDER: PlaceKind[] = [
  "coffee",
  "dessert",
  "drinks",
  "food",
  "stay",
  "shopping",
  "activities",
];

const BROAD_CATEGORIES = new Set([
  "Restaurant",
  "FoodMarket",
  "Cafe",
  "Bakery",
  "Nightlife",
]);

const CUISINE_EMOJI: Record<Cuisine, string> = {
  burger: "🍔",
  pizza: "🍕",
  tacos: "🌮",
  sushi: "🍣",
  noodles: "🍜",
  dumplings: "🥟",
  bbq: "🍖",
  steak: "🥩",
  seafood: "🦞",
  curry: "🍛",
  pasta: "🍝",
  donuts: "🍩",
  "ice cream": "🍨",
  bakery: "🥐",
  bagels: "🥯",
  dessert: "🍰",
  coffee: "☕",
  tea: "🍵",
  beer: "🍺",
  wine: "🍷",
  cocktails: "🍸",
  brunch: "🥞",
  sandwiches: "🥪",
  salad: "🥗",
  chicken: "🍗",
};

const NAME_WORDS: [string[], Cuisine][] = [
  [["burger", "burgers", "smash"], "burger"],
  [["pizza", "pizzas", "pizzeria"], "pizza"],
  [["taco", "tacos", "taqueria", "cantina"], "tacos"],
  [["sushi", "omakase", "izakaya"], "sushi"],
  [["ramen", "noodle", "noodles", "pho", "udon"], "noodles"],
  [["dumpling", "dumplings", "dim sum", "bao"], "dumplings"],
  [["bbq", "barbecue", "smokehouse"], "bbq"],
  [["steakhouse", "steak"], "steak"],
  [["seafood", "oyster", "oysters", "crab", "lobster"], "seafood"],
  [["curry", "tandoori", "masala"], "curry"],
  [["pasta", "trattoria", "osteria"], "pasta"],
  [["donut", "donuts", "doughnut", "doughnuts"], "donuts"],
  [["ice cream", "ice creams", "gelato", "gelateria", "creamery"], "ice cream"],
  [["bakery", "boulangerie", "patisserie", "croissant"], "bakery"],
  [["bagel", "bagels"], "bagels"],
  [["cake", "cakes", "dessert", "desserts", "sweets"], "dessert"],
  [["coffee", "espresso", "cafe", "roaster", "roasters"], "coffee"],
  [["tea", "matcha", "boba"], "tea"],
  [["brewery", "brewing", "taproom", "beer", "pub"], "beer"],
  [["wine", "vino", "enoteca"], "wine"],
  [["cocktail", "cocktails", "speakeasy"], "cocktails"],
  [["brunch", "breakfast", "diner", "pancake", "pancakes"], "brunch"],
  [["sandwich", "sandwiches", "deli"], "sandwiches"],
  [["salad", "poke"], "salad"],
  [["chicken", "wings"], "chicken"],
];

function nameEmoji(name: string): string | undefined {
  const padded = ` ${nameWords(name).join(" ")} `;
  let best: { at: number; cuisine: Cuisine } | undefined;
  for (const [words, cuisine] of NAME_WORDS)
    for (const word of words) {
      const at = padded.indexOf(` ${word} `);
      if (at >= 0 && (best === undefined || at < best.at))
        best = { at, cuisine };
    }
  return best && CUISINE_EMOJI[best.cuisine];
}

/**
 * The emoji a pin shows, so a steakhouse, a bar and a museum no longer look alike.
 * Apple's category wins unless it is a broad food or drink one; then the place's cuisine (never for a market), then the name (only with no or a broad category), then the save's tags.
 * Undefined when nothing says what the place is, which leaves the plain pin.
 */
export function placeEmoji(place: {
  name?: string;
  category?: string;
  cuisine?: Cuisine;
  kinds: readonly string[];
}): string | undefined {
  const fromCategory = place.category
    ? CATEGORY_EMOJI[place.category]
    : undefined;
  const nameDecides = !place.category || BROAD_CATEGORIES.has(place.category);
  if (fromCategory && !nameDecides) return fromCategory;
  const cuisine = refiningCuisine(place.category, place.cuisine);
  if (cuisine) return CUISINE_EMOJI[cuisine];
  const fromName =
    nameDecides && place.name ? nameEmoji(place.name) : undefined;
  if (fromName) return fromName;
  if (fromCategory) return fromCategory;
  const kind = PIN_KIND_ORDER.find((candidate) =>
    place.kinds.includes(candidate),
  );
  return kind ? KIND_EMOJI[kind] : undefined;
}
