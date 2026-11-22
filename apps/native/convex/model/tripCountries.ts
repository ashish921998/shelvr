import countries from "./tripCountries.json";

const names: Readonly<Record<string, string>> = countries;

export const TRIP_COUNTRY_CODES = Object.keys(names);
export const MAX_TRIP_COUNTRIES = 12;
export const MAX_TRIP_COVER_CHARS = 96_000;

export function countryName(code: string): string | undefined {
  return Object.hasOwn(names, code) ? names[code] : undefined;
}
