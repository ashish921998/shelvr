import { nameWords } from "@convex/model/placeIdentity";
import type { PlaceKind } from "@convex/model/placeKinds";

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

const KIND_EMOJI: [PlaceKind, string][] = [
  ["coffee", "☕"],
  ["dessert", "🍰"],
  ["drinks", "🍸"],
  ["food", "🍽️"],
  ["stay", "🛏️"],
  ["shopping", "🛍️"],
  ["activities", "🎟️"],
];

const BROAD_CATEGORIES = new Set([
  "Restaurant",
  "FoodMarket",
  "Cafe",
  "Bakery",
  "Nightlife",
]);

const NAME_WORDS: [string[], string][] = [
  [["burger", "burgers", "smash"], "🍔"],
  [["pizza", "pizzas", "pizzeria"], "🍕"],
  [["taco", "tacos", "taqueria", "cantina", "mexican"], "🌮"],
  [["sushi", "omakase", "izakaya"], "🍣"],
  [["ramen", "noodle", "noodles", "pho", "udon", "thai"], "🍜"],
  [["dumpling", "dumplings", "dim sum", "bao"], "🥟"],
  [["bbq", "barbecue", "smokehouse"], "🍖"],
  [["steakhouse", "steak", "grill"], "🥩"],
  [["seafood", "oyster", "oysters", "fish", "crab", "lobster"], "🦞"],
  [["curry", "indian", "tandoori", "masala"], "🍛"],
  [["pasta", "trattoria", "osteria"], "🍝"],
  [["donut", "donuts", "doughnut", "doughnuts"], "🍩"],
  [["ice cream", "ice creams", "gelato", "gelateria", "creamery"], "🍨"],
  [["bakery", "boulangerie", "patisserie", "croissant"], "🥐"],
  [["bagel", "bagels"], "🥯"],
  [["cake", "cakes", "dessert", "desserts", "sweets"], "🍰"],
  [["coffee", "espresso", "cafe", "roaster", "roasters"], "☕"],
  [["tea", "matcha", "boba"], "🍵"],
  [["brewery", "brewing", "taproom", "beer", "pub"], "🍺"],
  [["wine", "vino", "enoteca"], "🍷"],
  [["cocktail", "cocktails", "speakeasy", "lounge"], "🍸"],
  [["brunch", "breakfast", "diner", "pancake", "pancakes"], "🥞"],
  [["sandwich", "sandwiches", "deli"], "🥪"],
  [["salad", "poke", "bowl", "bowls"], "🥗"],
  [["chicken", "wings"], "🍗"],
];

function nameEmoji(name: string): string | undefined {
  const padded = ` ${nameWords(name).join(" ")} `;
  return NAME_WORDS.find(([words]) =>
    words.some((word) => padded.includes(` ${word} `)),
  )?.[1];
}

/**
 * The emoji a pin shows, so a steakhouse, a bar and a museum no longer look alike.
 * Apple's category wins unless it is a broad food or drink one; then the name, then the save's tags.
 * Undefined when nothing says what the place is, which leaves the plain pin.
 */
export function placeEmoji(place: {
  name?: string;
  category?: string;
  kinds: readonly string[];
}): string | undefined {
  const fromCategory = place.category
    ? CATEGORY_EMOJI[place.category]
    : undefined;
  if (fromCategory && !BROAD_CATEGORIES.has(place.category ?? "")) {
    return fromCategory;
  }
  const fromName = place.name ? nameEmoji(place.name) : undefined;
  if (fromName) return fromName;
  if (fromCategory) return fromCategory;
  return KIND_EMOJI.find(([kind]) => place.kinds.includes(kind))?.[1];
}
