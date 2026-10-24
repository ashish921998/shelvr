import { cityKey } from "@convex/model/trip";

const VISIBLE_CITIES = 4;
const MAX_SPACE_ROWS = 6;

export type City = { city: string; count: number; cover: string | null };

// The same key listCities groups by and ensureCitySpace matches on.
const sameName = (a: string, b: string) => cityKey(a) === cityKey(b);

/** The cities to draw now, and how many the "+ n more" tile stands for. */
export function visibleCities(
  cities: City[],
  expanded: boolean,
): { shown: City[]; hidden: number } {
  if (expanded || cities.length <= VISIBLE_CITIES) {
    return { shown: cities, hidden: 0 };
  }
  return {
    shown: cities.slice(0, VISIBLE_CITIES),
    hidden: cities.length - VISIBLE_CITIES,
  };
}

/** Spaces the city cards do not already stand for, at most MAX_SPACE_ROWS. */
export function spacesWithoutCities<T extends { name: string }>(
  spaces: T[],
  cities: { city: string }[],
): T[] {
  return spaces
    .filter((space) => !cities.some(({ city }) => sameName(space.name, city)))
    .slice(0, MAX_SPACE_ROWS);
}
