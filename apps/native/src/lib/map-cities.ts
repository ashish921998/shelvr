import { framedPins } from "@/lib/city-pins";
import { iso1A2Code } from "@rapideditor/country-coder";
import { cityKey, distanceKm, type LatLng } from "@convex/model/trip";

export type MapCity = LatLng & {
  key: string;
  name: string;
  country?: string;
  places: LatLng[];
};

export function countryAt(place: LatLng): string | undefined {
  return iso1A2Code([place.lng, place.lat]) ?? undefined;
}

function mostCommon(values: readonly string[]): string | undefined {
  const counts = new Map<string, number>();
  let top: string | undefined;
  for (const value of values) {
    const count = (counts.get(value) ?? 0) + 1;
    counts.set(value, count);
    if (top === undefined || count > (counts.get(top) ?? 0)) top = value;
  }
  return top;
}

export function mapCities<T extends LatLng & { city?: string }>(
  places: readonly T[],
  countryOf: (place: LatLng) => string | undefined = countryAt,
): MapCity[] {
  const groups = new Map<string, T[]>();
  for (const place of places) {
    const key = cityKey(place.city ?? "");
    if (key === "") continue;
    groups.set(key, [...(groups.get(key) ?? []), place]);
  }
  return [...groups].map(([key, members]) => {
    const middle = framedPins(members);
    const country = mostCommon(
      members.flatMap((place) => countryOf(place) ?? []),
    );
    return {
      key,
      name: mostCommon(members.map((place) => place.city ?? "")) ?? key,
      lat: middle.reduce((sum, place) => sum + place.lat, 0) / middle.length,
      lng: middle.reduce((sum, place) => sum + place.lng, 0) / middle.length,
      places: members,
      ...(country ? { country } : {}),
    };
  });
}

export function nearestCity(
  cities: readonly MapCity[],
  centre: LatLng,
): MapCity | undefined {
  let nearest: MapCity | undefined;
  let best = Infinity;
  for (const city of cities) {
    const gap = distanceKm(centre, city);
    if (gap < best) {
      best = gap;
      nearest = city;
    }
  }
  return nearest;
}

export function cityCounts<T extends { city?: string }>(
  cities: readonly MapCity[],
  places: readonly T[],
): { city: MapCity; count: number }[] {
  const counts = new Map<string, number>();
  for (const place of places) {
    const key = cityKey(place.city ?? "");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return cities.flatMap((city) => {
    const count = counts.get(city.key) ?? 0;
    return count > 0 ? [{ city, count }] : [];
  });
}
