import { cityKey } from "@convex/model/trip";

export const CITY_ZOOM = 9;

export function cityFillingMap(
  city: string | undefined,
  zoom: number | undefined,
): string | undefined {
  return zoom !== undefined && zoom < CITY_ZOOM ? undefined : city;
}

export function canShowAllCities(
  city: string | undefined,
  places: readonly { city?: string }[],
): boolean {
  if (city === undefined) return false;
  const cities = new Set<string>();
  for (const place of places) {
    const key = cityKey(place.city ?? "");
    if (key !== "") cities.add(key);
  }
  return cities.size >= 2;
}
