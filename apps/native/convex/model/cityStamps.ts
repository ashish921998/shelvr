import { cityKey } from "./trip";

export const CITY_STAMP_CITIES = {
  amsterdam: { names: ["Amsterdam"], country: "NL" },
  austin: { names: ["Austin"], country: "US" },
  barcelona: { names: ["Barcelona"], country: "ES" },
  berlin: { names: ["Berlin"], country: "DE" },
  chicago: { names: ["Chicago"], country: "US" },
  copenhagen: { names: ["Copenhagen", "København"], country: "DK" },
  dallas: { names: ["Dallas"], country: "US" },
  florence: { names: ["Florence", "Firenze"], country: "IT" },
  "las-vegas": { names: ["Las Vegas"], country: "US" },
  lisbon: { names: ["Lisbon", "Lisboa"], country: "PT" },
  london: { names: ["London"], country: "GB" },
  "los-angeles": { names: ["Los Angeles", "LA"], country: "US" },
  madrid: { names: ["Madrid"], country: "ES" },
  milan: { names: ["Milan", "Milano"], country: "IT" },
  montreal: { names: ["Montreal", "Montréal"], country: "CA" },
  "new-york": {
    names: ["New York", "New York City", "NYC"],
    country: "US",
  },
  paris: { names: ["Paris"], country: "FR" },
  prague: { names: ["Prague", "Praha"], country: "CZ" },
  rome: { names: ["Rome", "Roma"], country: "IT" },
  "san-francisco": { names: ["San Francisco", "SF"], country: "US" },
  seattle: { names: ["Seattle"], country: "US" },
  seoul: { names: ["Seoul"], country: "KR" },
  tokyo: { names: ["Tokyo"], country: "JP" },
  toronto: { names: ["Toronto"], country: "CA" },
  vancouver: { names: ["Vancouver"], country: "CA" },
} as const satisfies Record<
  string,
  { names: readonly [string, ...string[]]; country: string }
>;

export type CityStampId = keyof typeof CITY_STAMP_CITIES;

export const CITY_STAMP_IDS = (
  Object.keys(CITY_STAMP_CITIES) as CityStampId[]
).sort();

export const MAX_ONBOARDING_CITY_STAMPS = CITY_STAMP_IDS.length;

export type CityStampEntry = { city: string; country: string };

export function isCityStampId(value: string): value is CityStampId {
  return Object.hasOwn(CITY_STAMP_CITIES, value);
}

export function cityStampName(id: CityStampId): string {
  return CITY_STAMP_CITIES[id].names[0];
}

export function cityStampKeys(id: string): string[] {
  return isCityStampId(id) ? CITY_STAMP_CITIES[id].names.map(cityKey) : [];
}

export function cityStampFor(city: string): CityStampId | undefined {
  const key = cityKey(city);
  if (key === "") return undefined;
  return CITY_STAMP_IDS.find((id) => cityStampKeys(id).includes(key));
}

export function knownCityStamps<T extends CityStampEntry>(
  stamps: readonly T[],
): T[] {
  const seen = new Set<string>();
  return stamps.filter((stamp) => {
    if (!isCityStampId(stamp.city) || seen.has(stamp.city)) return false;
    seen.add(stamp.city);
    return true;
  });
}

export function cityStampCounts(
  placeCities: readonly string[],
  placeCountries: readonly string[],
  cityStamps: readonly CityStampEntry[],
): { cities: number; countries: Set<string> } {
  const keys = new Set(placeCities.map(cityKey).filter((key) => key !== ""));
  const countries = new Set(placeCountries);
  let cities = keys.size;
  for (const stamp of knownCityStamps(cityStamps)) {
    countries.add(stamp.country);
    if (!cityStampKeys(stamp.city).some((key) => keys.has(key))) cities += 1;
  }
  return { cities, countries };
}
