import { MAX_AREA_CHARS, MAX_PLACE_NAME_CHARS } from "./plan";
import type { TripPlace } from "./tripPlan";

export const MAX_APPLE_ID_CHARS = 100;
export const MAX_CATEGORY_CHARS = 60;

export function tidyText(
  text: string | undefined,
  max: number,
): string | undefined {
  const tidy = text?.replace(/\s+/g, " ").trim().slice(0, max);
  return tidy ? tidy : undefined;
}

export function validPoint(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

export type TidyPlace = {
  name: string;
  lat: number;
  lng: number;
  appleId?: string;
  category?: string;
  area?: string;
};

export function tidyPlace(place: TripPlace): TidyPlace {
  const name = tidyText(place.name, MAX_PLACE_NAME_CHARS);
  if (name === undefined || !validPoint(place.lat, place.lng)) {
    throw new Error("Place required");
  }
  const appleId = tidyText(place.appleId, MAX_APPLE_ID_CHARS);
  const category = tidyText(place.category, MAX_CATEGORY_CHARS);
  const area = tidyText(place.area, MAX_AREA_CHARS);
  return {
    name,
    lat: place.lat,
    lng: place.lng,
    ...(appleId !== undefined ? { appleId } : {}),
    ...(category !== undefined ? { category } : {}),
    ...(area !== undefined ? { area } : {}),
  };
}
