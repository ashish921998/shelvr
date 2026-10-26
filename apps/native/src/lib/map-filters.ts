import { PLACE_KINDS, type PlaceKind } from "@convex/model/placeKinds";
import { cityKey, distanceKm, type LatLng } from "@convex/model/trip";

/** How far from the person a saved place still counts as nearby when the map opens on them. */
const NEARBY_KM = 50;

/** A filter shows only once enough of your places fit it to be worth a tap. */
const MIN_FILTER_PLACES = 3;

type Kinded = { kinds: string[] };

function isPlaceKind(kind: string): kind is PlaceKind {
  return (PLACE_KINDS as readonly string[]).includes(kind);
}

/** The filters this person's places support, most places first; kinds this build has no label for are skipped. */
export function mapFilters(
  places: readonly Kinded[],
): { kind: PlaceKind; count: number }[] {
  const counts = new Map<PlaceKind, number>();
  for (const place of places)
    for (const kind of new Set(place.kinds))
      if (isPlaceKind(kind)) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  return PLACE_KINDS.flatMap((kind) => {
    const count = counts.get(kind) ?? 0;
    return count >= MIN_FILTER_PLACES ? [{ kind, count }] : [];
  }).sort((a, b) => b.count - a.count);
}

export function filterPlaces<T extends Kinded>(
  places: readonly T[],
  kind: PlaceKind | null,
): T[] {
  return kind === null
    ? [...places]
    : places.filter((place) => place.kinds.includes(kind));
}

/** Without your location, the map opens on the city you saved the most places in. */
export function busiestCityPlaces<T extends { city?: string }>(
  places: readonly T[],
): T[] {
  const counts = new Map<string, number>();
  for (const place of places) {
    const key = cityKey(place.city ?? "");
    if (key !== "") counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let top: string | undefined;
  for (const [key, count] of counts)
    if (top === undefined || count > (counts.get(top) ?? 0)) top = key;
  return top === undefined
    ? [...places]
    : places.filter((place) => cityKey(place.city ?? "") === top);
}

/** Whether opening on the person shows any of their places; if not, the map opens on their busiest city. */
export function hasPlaceNear(
  centre: LatLng | undefined,
  places: readonly LatLng[],
): boolean {
  return (
    centre !== undefined &&
    places.some((place) => distanceKm(centre, place) <= NEARBY_KM)
  );
}
