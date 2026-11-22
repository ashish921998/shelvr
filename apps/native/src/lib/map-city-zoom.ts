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

export type MapView = {
  centre?: LatLng;
  zoom?: number;
  held?: MapLevel;
  worldBelow?: number;
};

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

function worldEdge(to: MapLevel, zoom: number | undefined) {
  if (zoom === undefined || to.kind === "city") return undefined;
  return to.kind === "country"
    ? Math.min(COUNTRY_ZOOM, zoom - LANDING_ROOM)
    : Math.max(COUNTRY_ZOOM, zoom + LANDING_ROOM);
}

export function holdLevel(view: MapView, to: MapLevel): MapView {
  return { ...view, held: to, worldBelow: worldEdge(to, view.zoom) };
}

export function moveView(
  view: MapView,
  centre: LatLng,
  zoom: number | undefined,
  moved: boolean,
): MapView {
  const { held, worldBelow } = view;
  if (held && !moved)
    return { centre, zoom, held, worldBelow: worldEdge(held, zoom) };
  const inCity = zoom !== undefined && zoom >= CITY_ZOOM;
  return { centre, zoom, worldBelow: inCity ? undefined : worldBelow };
}

function stillSaved(level: MapLevel, cities: readonly MapCity[]) {
  if (level.kind === "world") return cities.length > 0;
  return level.kind === "country"
    ? cities.some((city) => city.country === level.country)
    : cities.some((city) => city.key === cityKey(level.city ?? ""));
}

export function mapLevel(
  view: MapView,
  cityInView: string | undefined,
  cities: readonly MapCity[],
): MapLevel {
  const { centre, zoom, held, worldBelow = COUNTRY_ZOOM } = view;
  if (held && stillSaved(held, cities)) return held;
  if (zoom === undefined || zoom >= CITY_ZOOM || cities.length === 0)
    return { kind: "city", city: cityFillingMap(cityInView, zoom) };
  if (!centre || zoom < worldBelow) return { kind: "world" };
  const placed = cities.filter((city) => city.country);
  const under = countryAt(centre);
  const country = placed.some((city) => city.country === under)
    ? under
    : nearestCity(placed, centre)?.country;
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
