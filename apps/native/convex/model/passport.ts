import { samePlace } from "./placeIdentity";
import { placeKey } from "./plan";
import { cityKey } from "./trip";

export type PassportPlace = {
  name: string;
  city?: string;
  lat?: number;
  lng?: number;
  countryCode?: string;
};

type NamedPlace = { name: string; city?: string };

export function samePassportPlace(a: PassportPlace, b: PassportPlace): boolean {
  if (cityKey(a.city ?? "") !== cityKey(b.city ?? "")) return false;
  if (
    a.lat !== undefined &&
    a.lng !== undefined &&
    b.lat !== undefined &&
    b.lng !== undefined
  ) {
    return samePlace(
      { name: a.name, lat: a.lat, lng: a.lng },
      { name: b.name, lat: b.lat, lng: b.lng },
    );
  }
  return placeKey(a.name) === placeKey(b.name);
}

function among(place: PassportPlace, others: readonly PassportPlace[]) {
  return others.some((other) => samePassportPlace(place, other));
}

function distinct(places: readonly PassportPlace[]): NamedPlace[] {
  const kept: PassportPlace[] = [];
  for (const place of places) if (!among(place, kept)) kept.push(place);
  return kept.map(({ name, city }) => (city ? { name, city } : { name }));
}

export function placesToSave(
  onlyThem: readonly NamedPlace[],
  saved: readonly PassportPlace[],
): { name: string; city: string }[] {
  const known = [...saved];
  const fresh: { name: string; city: string }[] = [];
  for (const { name, city } of onlyThem) {
    if (city === undefined) continue;
    const place = { name, city };
    if (among(place, known)) continue;
    known.push(place);
    fresh.push(place);
  }
  return fresh;
}

export function comparePassports(
  mine: readonly PassportPlace[],
  theirs: readonly PassportPlace[],
  saved: readonly PassportPlace[],
) {
  const onlyThem = distinct(theirs.filter((place) => !among(place, mine)));
  return {
    both: distinct(mine.filter((place) => among(place, theirs))),
    onlyThem,
    onlyYou: distinct(mine.filter((place) => !among(place, theirs))),
    toSave: placesToSave(onlyThem, saved),
  };
}

export function groupByCity<T extends { city?: string }>(
  items: readonly T[],
): { city: string | null; items: T[] }[] {
  const groups = new Map<string, { city: string | null; items: T[] }>();
  for (const item of items) {
    const key = item.city ? cityKey(item.city) : "";
    const group = groups.get(key);
    if (group) group.items.push(item);
    else groups.set(key, { city: item.city || null, items: [item] });
  }
  return [...groups.values()].sort(
    (a, b) => Number(a.city === null) - Number(b.city === null),
  );
}

export function passportCounts(
  places: readonly { city?: string; countryCode?: string }[],
) {
  const cities = new Set(
    places.flatMap((place) => (place.city ? [cityKey(place.city)] : [])),
  );
  const countries = new Set(
    places.flatMap((place) => (place.countryCode ? [place.countryCode] : [])),
  );
  return {
    places: places.length,
    cities: cities.size,
    countries: countries.size > 0 ? countries.size : null,
  };
}
