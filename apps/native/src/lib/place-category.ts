import { t } from "@/lib/i18n";
import { categoryEmoji } from "@/lib/map-pin-emoji";

const LABEL = {
  Restaurant: "placeCategory.restaurant",
  FoodMarket: "placeCategory.foodMarket",
  Cafe: "placeCategory.cafe",
  Bakery: "placeCategory.bakery",
  Nightlife: "placeCategory.nightlife",
  Brewery: "placeCategory.brewery",
  Winery: "placeCategory.winery",
  Distillery: "placeCategory.distillery",
  Museum: "placeCategory.museum",
  Landmark: "placeCategory.landmark",
  NationalMonument: "placeCategory.nationalMonument",
  Castle: "placeCategory.castle",
  Fortress: "placeCategory.fortress",
  Park: "placeCategory.park",
  NationalPark: "placeCategory.nationalPark",
  Hiking: "placeCategory.hiking",
  Beach: "placeCategory.beach",
  Theater: "placeCategory.theater",
  MovieTheater: "placeCategory.movieTheater",
  MusicVenue: "placeCategory.musicVenue",
  Stadium: "placeCategory.stadium",
  Zoo: "placeCategory.zoo",
  Aquarium: "placeCategory.aquarium",
  Planetarium: "placeCategory.planetarium",
  Spa: "placeCategory.spa",
  FitnessCenter: "placeCategory.fitnessCenter",
  AmusementPark: "placeCategory.amusementPark",
  Bowling: "placeCategory.bowling",
  GoKart: "placeCategory.goKart",
  MiniGolf: "placeCategory.miniGolf",
  RockClimbing: "placeCategory.rockClimbing",
  Skating: "placeCategory.skating",
  Store: "placeCategory.store",
  Hotel: "placeCategory.hotel",
} as const;

export function placeCategoryLabel(
  category: string | undefined,
): string | undefined {
  if (category === undefined || !Object.hasOwn(LABEL, category))
    return undefined;
  const label = t(LABEL[category as keyof typeof LABEL]);
  const emoji = categoryEmoji(category);
  return emoji ? `${emoji} ${label}` : label;
}
