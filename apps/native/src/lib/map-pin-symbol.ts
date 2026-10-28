import type { PlaceKind } from "@convex/model/placeKinds";
import type { SFSymbol } from "expo-symbols";

/** The SF Symbol a Map tab pin shows, so a steakhouse, a bar and a museum no longer look alike. */
export const DEFAULT_PIN_SYMBOL: SFSymbol = "mappin";

/** Apple Maps' point-of-interest categories; any other category falls back to the place's kinds. */
const CATEGORY_SYMBOLS: Record<string, SFSymbol> = {
  Restaurant: "fork.knife",
  FoodMarket: "basket.fill",
  Cafe: "cup.and.saucer.fill",
  Bakery: "birthday.cake.fill",
  Nightlife: "wineglass.fill",
  Brewery: "wineglass.fill",
  Winery: "wineglass.fill",
  Distillery: "wineglass.fill",
  Museum: "building.columns.fill",
  Landmark: "camera.fill",
  NationalMonument: "camera.fill",
  Castle: "camera.fill",
  Fortress: "camera.fill",
  Park: "tree.fill",
  NationalPark: "tree.fill",
  Hiking: "figure.hiking",
  Beach: "beach.umbrella.fill",
  Theater: "theatermasks.fill",
  MovieTheater: "film.fill",
  MusicVenue: "music.note",
  Stadium: "sportscourt.fill",
  Zoo: "pawprint.fill",
  Aquarium: "fish.fill",
  Planetarium: "sparkles",
  Spa: "leaf.fill",
  AmusementPark: "ticket.fill",
  Bowling: "ticket.fill",
  GoKart: "ticket.fill",
  MiniGolf: "ticket.fill",
  RockClimbing: "ticket.fill",
  Skating: "ticket.fill",
  Store: "bag.fill",
  Hotel: "bed.double.fill",
};

/** Without a known category, the most specific kind wins: a coffee save tagged food is a café. */
const KIND_SYMBOLS: [PlaceKind, SFSymbol][] = [
  ["coffee", "cup.and.saucer.fill"],
  ["dessert", "birthday.cake.fill"],
  ["drinks", "wineglass.fill"],
  ["food", "fork.knife"],
  ["stay", "bed.double.fill"],
  ["shopping", "bag.fill"],
  ["activities", "camera.fill"],
];

export function placeSymbol(place: {
  category?: string;
  kinds: readonly string[];
}): SFSymbol {
  const fromCategory = place.category
    ? CATEGORY_SYMBOLS[place.category]
    : undefined;
  if (fromCategory) return fromCategory;
  const match = KIND_SYMBOLS.find(([kind]) => place.kinds.includes(kind));
  return match ? match[1] : DEFAULT_PIN_SYMBOL;
}
