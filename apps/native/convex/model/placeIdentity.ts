import { placeKey } from "./plan";
import { distanceKm, SAME_PLACE_KM, type LatLng } from "./trip";

// When two pins are one place. Pure and free of server-only packages, so the
// app's Add a place uses the same rule as the server.

export type Placed = LatLng & { name: string; appleId?: string };

/** A trip stop or a place that could become one: a search result, or a save's pin. */
export type TripPlaceRef = Placed & { itemId?: string };

export function nameWords(name: string): string[] {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/['’ʼ]/g, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** One name's whole words run inside the other's ("Santa Joana" in "Locke de Santa Joana"), ignoring case and accents. */
export function nameWithin(a: string, b: string): boolean {
  const [short, long] = [nameWords(a), nameWords(b)].sort(
    (x, y) => x.length - y.length,
  );
  if (short.length === 0) return false;
  for (let start = 0; start + short.length <= long.length; start++) {
    if (short.every((word, i) => long[start + i] === word)) return true;
  }
  return false;
}

/** A few doors apart under one name, or one name inside the other. */
function nearNamesake(a: Placed, b: Placed): boolean {
  if (distanceKm(a, b) > SAME_PLACE_KM) return false;
  return placeKey(a.name) === placeKey(b.name) || nameWithin(a.name, b.name);
}

/**
 * The same venue: one Apple id, or a few doors apart under one name or one name inside the other
 * (often its hotel). Two different Apple ids still match on name within SAME_PLACE_KM, so a
 * restaurant and the hotel it sits in become one stop; uniquePlacePins must not do that, since
 * there distinct Apple ids are distinct places on the map.
 */
export function samePlace(a: Placed, b: Placed): boolean {
  if (a.appleId !== undefined && a.appleId === b.appleId) return true;
  return nearNamesake(a, b);
}

/**
 * Whether a place someone adds is a stop the trip already has. Unlike samePlace, two different
 * Apple ids are two places even next door: the person picked that branch. Otherwise it is the
 * same save's place, or a near namesake when either side has no Apple id. Adding a stop, the
 * "From your saves" list and the "On trip" label all use this.
 */
export function sameTripPlace(a: TripPlaceRef, b: TripPlaceRef): boolean {
  if (a.appleId !== undefined && a.appleId === b.appleId) return true;
  if (
    a.itemId !== undefined &&
    a.itemId === b.itemId &&
    placeKey(a.name) === placeKey(b.name)
  ) {
    return true;
  }
  if (a.appleId !== undefined && b.appleId !== undefined) return false;
  return nearNamesake(a, b);
}
