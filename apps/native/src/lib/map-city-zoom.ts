import { framedPins } from "@/lib/city-pins";
import { countryAt, type MapCity, nearestCity } from "@/lib/map-cities";
import { cityKey, type LatLng } from "@convex/model/trip";

export const CITY_ZOOM = 9;
export const COUNTRY_ZOOM = 2.5;
const PILL_ROOM = 0.7;
const WORLD_ZOOM = 1;
const LANDING_ROOM = 0.25;

export type MapLevel =
  | { kind: "city"; city?: string }
  | { kind: "country"; country: string }
  | { kind: "world" };

export type MapFlight = {
  places: LatLng[];
  minZoom?: number;
  maxZoom?: number;
  room?: number;
};

export type MapStep = MapFlight & { to: MapLevel };

export function cityFillingMap(
  city: string | undefined,
  zoom: number | undefined,
): string | undefined {
  return zoom !== undefined && zoom < CITY_ZOOM ? undefined : city;
}

export function mapLevel(
  city: string | undefined,
  centre: LatLng | undefined,
  zoom: number | undefined,
  cities: readonly MapCity[],
): MapLevel {
  if (zoom === undefined || zoom >= CITY_ZOOM || cities.length === 0)
    return { kind: "city", city };
  if (!centre || zoom < COUNTRY_ZOOM) return { kind: "world" };
  const under = countryAt(centre);
  const country = cities.some((here) => here.country === under)
    ? under
    : nearestCity(cities, centre)?.country;
  return country ? { kind: "country", country } : { kind: "world" };
}

export function stepUp(
  level: MapLevel,
  cities: readonly MapCity[],
): MapStep | undefined {
  if (level.kind === "world" || cities.length === 0) return undefined;
  if (level.kind === "city") {
    const here = cities.find((city) => city.key === cityKey(level.city ?? ""));
    if (!here) return undefined;
    if (here.country)
      return {
        to: { kind: "country", country: here.country },
        places: cities.filter((city) => city.country === here.country),
        minZoom: WORLD_ZOOM,
        maxZoom: CITY_ZOOM - 1,
        room: PILL_ROOM,
      };
  }
  return {
    to: { kind: "world" },
    places: [...cities],
    minZoom: WORLD_ZOOM,
    maxZoom: COUNTRY_ZOOM - 0.5,
    room: PILL_ROOM,
  };
}

export function flyToCity(city: MapCity): MapStep {
  return {
    to: { kind: "city", city: city.name },
    places: framedPins(city.places),
    minZoom: CITY_ZOOM + LANDING_ROOM,
  };
}
