const VISIBLE_CITIES = 4;

export type City = { city: string; count: number; cover: string | null };

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
