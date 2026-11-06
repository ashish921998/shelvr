import { nameWords } from "./placeIdentity";
import type { PlaceKind } from "./placeKinds";

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
  let best: { at: number; emoji: string } | undefined;
  for (const [words, emoji] of NAME_WORDS)
    for (const word of words) {
      const at = padded.indexOf(` ${word} `);
      if (at >= 0 && (best === undefined || at < best.at)) best = { at, emoji };
    }
  return best?.emoji;
}

export function placeEmoji(place: {
  name?: string;
  category?: string;
  kinds: readonly string[];
}): string | undefined {
  const fromCategory = place.category
    ? CATEGORY_EMOJI[place.category]
    : undefined;
  const nameDecides = !place.category || BROAD_CATEGORIES.has(place.category);
  if (fromCategory && !nameDecides) return fromCategory;
  const fromName =
    nameDecides && place.name ? nameEmoji(place.name) : undefined;
  if (fromName) return fromName;
  if (fromCategory) return fromCategory;
  const kind = PIN_KIND_ORDER.find((candidate) =>
    place.kinds.includes(candidate),
  );
  return kind ? KIND_EMOJI[kind] : undefined;
}
