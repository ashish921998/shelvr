import { framedPins } from "@/lib/city-pins";
import {
  SAMPLE_CITIES,
  type LatLng,
  type SampleCityId,
} from "@/lib/sample-cities";
import { CITY_STAMP_CITIES, CITY_STAMP_IDS } from "@convex/model/cityStamps";
import { cityKey } from "@convex/model/trip";

export type StoredView = { lat: number; lng: number; zoom: number };

export type Opening =
  | { kind: "person"; restore?: StoredView }
  | { kind: "last"; view: StoredView }
  | { kind: "fit" }
  | { kind: "sample"; city: SampleCityId; places: LatLng[] }
  | { kind: "default" };

export type OpeningLabel = Opening["kind"] | "frame" | "save";

export type OpeningCamera = {
  coordinates: { latitude: number; longitude: number };
  zoom: number;
};

const MIN_ZOOM = -2;
const MAX_ZOOM = 22;

const REGION_CITIES = new Map<string, SampleCityId>([
  ["US", "new-york"],
  ["CA", "toronto"],
  ["IT", "rome"],
]);

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && value >= min && value <= max;
}

export function parseStoredView(
  raw: string | undefined,
): StoredView | undefined {
  if (raw === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;
  const lat: unknown = "lat" in value ? value.lat : undefined;
  const lng: unknown = "lng" in value ? value.lng : undefined;
  const zoom: unknown = "zoom" in value ? value.zoom : undefined;
  return inRange(lat, -90, 90) &&
    inRange(lng, -180, 180) &&
    inRange(zoom, MIN_ZOOM, MAX_ZOOM)
    ? { lat, lng, zoom }
    : undefined;
}

export function parseKnownSaves(
  raw: string | undefined,
): ReadonlySet<string> | undefined {
  if (raw === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  return Array.isArray(value) &&
    value.every((id): id is string => typeof id === "string")
    ? new Set(value)
    : undefined;
}

export function sampleCityFor(
  regionCode: string | null | undefined,
): SampleCityId | undefined {
  if (!regionCode) return undefined;
  const region = regionCode.toUpperCase();
  return (
    REGION_CITIES.get(region) ??
    CITY_STAMP_IDS.find((id) => CITY_STAMP_CITIES[id].country === region)
  );
}

function samplePlaces(city: SampleCityId): LatLng[] {
  return SAMPLE_CITIES[city].days.flatMap((day) =>
    day.stops.map((stop) => stop.at),
  );
}

export function chooseOpening(input: {
  located: boolean;
  last: StoredView | undefined;
  hasFit: boolean;
  regionCode: string | null | undefined;
}): Opening {
  if (input.located)
    return input.last
      ? { kind: "person", restore: input.last }
      : { kind: "person" };
  if (input.last) return { kind: "last", view: input.last };
  if (input.hasFit) return { kind: "fit" };
  const city = sampleCityFor(input.regionCode);
  return city
    ? { kind: "sample", city, places: samplePlaces(city) }
    : { kind: "default" };
}

export function viewCamera(view: StoredView): OpeningCamera {
  return {
    coordinates: { latitude: view.lat, longitude: view.lng },
    zoom: view.zoom,
  };
}
export function openingCamera<T extends OpeningCamera>(
  opening: Opening,
  fit: T | undefined,
  frame: (points: LatLng[]) => T | undefined,
): OpeningCamera | undefined {
  switch (opening.kind) {
    case "last":
      return viewCamera(opening.view);
    case "fit":
      return fit;
    case "sample":
      return frame(opening.places);
    case "person":
    case "default":
      return undefined;
  }
}

type SavedPlace = { itemId: string; city?: string; lat: number; lng: number };
export function newSaveFrame(
  all: readonly SavedPlace[],
  known: ReadonlySet<string> | undefined,
): { key: string; places: LatLng[] } | undefined {
  if (known === undefined) return undefined;
  const fresh = all.find((place) => !known.has(place.itemId));
  if (!fresh) return undefined;
  const city = cityKey(fresh.city ?? "");
  const places =
    city === ""
      ? [fresh]
      : all.filter((place) => cityKey(place.city ?? "") === city);
  return { key: fresh.itemId, places: framedPins(places) };
}
