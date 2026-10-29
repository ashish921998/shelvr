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
const KIND_EMOJI: [PlaceKind, string][] = [
  ["coffee", "☕"],
  ["dessert", "🍰"],
  ["drinks", "🍸"],
  ["food", "🍽️"],
  ["stay", "🛏️"],
  ["shopping", "🛍️"],
  ["activities", "🎟️"],
];

/**
 * The emoji a Map tab pin shows, so a steakhouse, a bar and a museum no longer look alike.
 * Undefined when nothing says what the place is, which leaves the plain pin.
 */
export function placeEmoji(place: {
  category?: string;
  kinds: readonly string[];
}): string | undefined {
  const fromCategory = place.category
    ? CATEGORY_EMOJI[place.category]
    : undefined;
  if (fromCategory) return fromCategory;
  return KIND_EMOJI.find(([kind]) => place.kinds.includes(kind))?.[1];
}
