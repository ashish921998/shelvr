import type { Id } from "@convex/_generated/dataModel";
import { placeKinds } from "@convex/model/placeKinds";
import { uniquePlacePins } from "@convex/model/trip";

export type GoOutPlace = {
  name: string;
  lat: number;
  lng: number;
  city?: string;
  appleId?: string;
  category?: string;
  itemId?: Id<"items">;
  kinds?: string[];
};

export const GO_OUT_CATEGORIES = [
  "food",
  "drinks",
  "activities",
  "shopping",
] as const;
export type GoOutCategory = (typeof GO_OUT_CATEGORIES)[number];

export function goOutMatches(
  place: GoOutPlace,
  category: GoOutCategory | null,
) {
  if (category === null) return true;
  const kinds = place.kinds ?? placeKinds(place.category, []);
  return category === "food"
    ? kinds.some((kind) => ["food", "coffee", "dessert"].includes(kind))
    : kinds.includes(category);
}

export function goOutPlaces(places: GoOutPlace[]) {
  return uniquePlacePins(places);
}

export function rollPlace(places: GoOutPlace[], previous?: GoOutPlace) {
  const other = places.filter((place) => place !== previous);
  const pool = other.length > 0 ? other : places;
  return pool[Math.floor(Math.random() * pool.length)];
}
