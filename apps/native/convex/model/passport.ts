import { type CityStampEntry, cityStampCounts } from "./cityStamps";
import { normalizePlaceName } from "./itemFields";
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

type SavePlaces = {
  cities?: readonly string[];
  places?: readonly string[];
  placePins?: readonly {
    name: string;
    city?: string;
    lat: number;
    lng: number;
  }[];
};

export function soleCity(
  cities: readonly string[] | undefined,
): string | undefined {
  return cities?.length === 1 ? cities[0] || undefined : undefined;
}

export function placesOnSave(save: SavePlaces): PassportPlace[] {
  const only = soleCity(save.cities);
  const pins = (save.placePins ?? []).flatMap(({ name, city, lat, lng }) => {
    const place = city || only;
    return place
      ? [{ name: normalizePlaceName(name, [place]), city: place, lat, lng }]
      : [];
  });
  const names =
    only === undefined
      ? []
      : (save.places ?? []).map((name) => ({
          name: normalizePlaceName(name, [only]),
          city: only,
        }));
  return [...pins, ...names];
}

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

function distinct(places: readonly PassportPlace[]): PassportPlace[] {
  const kept: PassportPlace[] = [];
  for (const place of places) if (!among(place, kept)) kept.push(place);
  return kept;
}

function named({ name, city }: PassportPlace): NamedPlace {
  return city ? { name, city } : { name };
}

function saveKey({ name, city }: PassportPlace): string | null {
  return city ? `${cityKey(city)}\0${placeKey(name)}` : null;
}

function placesToSave(
  onlyThem: readonly PassportPlace[],
  saved: readonly PassportPlace[],
): { name: string; city: string }[] {
  const taken = new Set(saved.map(saveKey));
  const fresh: { name: string; city: string }[] = [];
  for (const place of onlyThem) {
    if (!place.city) continue;
    const key = saveKey(place);
    if (taken.has(key) || among(place, saved)) continue;
    taken.add(key);
    fresh.push({ name: place.name, city: place.city });
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
    both: distinct(mine.filter((place) => among(place, theirs))).map(named),
    onlyThem: onlyThem.map(named),
    onlyYou: distinct(mine.filter((place) => !among(place, theirs))).map(named),
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
  cityStamps: readonly CityStampEntry[] = [],
) {
  const { cities, countries } = cityStampCounts(
    places.flatMap((place) => (place.city ? [place.city] : [])),
    places.flatMap((place) => (place.countryCode ? [place.countryCode] : [])),
    cityStamps,
  );
  return {
    places: places.length,
    cities,
    countries: countries.size > 0 ? countries.size : null,
  };
}
