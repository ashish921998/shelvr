const VISIBLE_CITIES = 4;

export type City = {
  city: string;
  count: number;
  placeCount?: number;
  cover: string | null;
};

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

type PlaceableSave = {
  _id: string;
  status: "processing" | "ready" | "failed";
  cities?: string[];
};

/** Saves that no city card shows: still reading, failed, or no place found. */
export function unplacedSaves<T extends PlaceableSave>(saves: T[]): T[] {
  return saves.filter(
    (save) => save.status !== "ready" || (save.cities ?? []).length === 0,
  );
}
