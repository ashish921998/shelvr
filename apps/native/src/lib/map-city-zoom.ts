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
  const here = cityKey(city ?? "");
  if (here === "") return false;
  return places.some((place) => {
    const key = cityKey(place.city ?? "");
    return key !== "" && key !== here;
  });
}
