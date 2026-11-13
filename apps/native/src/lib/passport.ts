import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { CityCompletion } from "@convex/model/cityCompletion";
import { groupByCity } from "@convex/model/passport";
import { cityKey } from "@convex/model/trip";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth } from "convex/react";
import type { FunctionReturnType } from "convex/server";

export type Stamp = FunctionReturnType<
  typeof api.placeVisits.getPassport
>[number];

export type UnstampedPlace = FunctionReturnType<
  typeof api.placeVisits.listUnstampedPlaces
>[number];

export type OpenStamp = {
  itemId: Id<"items">;
  name: string;
  city: string;
  cover: string | null;
  at: number | null;
  spot?: { lat: number; lng: number };
};

export function usePassport() {
  const { isAuthenticated } = useConvexAuth();
  const passport = useQuery(
    convexQuery(api.placeVisits.getPassport, isAuthenticated ? {} : "skip"),
  );
  return {
    stamps: passport.data,
    failed: passport.isError,
    error: passport.error,
  };
}

export function useCityCompletion() {
  const { isAuthenticated } = useConvexAuth();
  const completion = useQuery(
    convexQuery(api.placeVisits.cityCompletion, isAuthenticated ? {} : "skip"),
  );
  return { rows: completion.data, error: completion.error };
}

export type PassportSection = {
  key: string;
  city: string | null;
  stamps: Stamp[];
  completion: CityCompletion | null;
};

export function passportSections(
  stamps: readonly Stamp[],
  completion: readonly CityCompletion[],
): { stamped: PassportSection[]; waiting: PassportSection[] } {
  const rows = new Map(completion.map((row) => [cityKey(row.city), row]));
  const used = new Set<string>();
  const stamped = groupByCity(stamps).map((group): PassportSection => {
    const key = group.city === null ? "" : cityKey(group.city);
    const row = key === "" ? undefined : rows.get(key);
    if (row) used.add(key);
    return {
      key: key === "" ? "~elsewhere" : key,
      city: row?.city ?? group.city,
      stamps: group.items,
      completion: row ?? null,
    };
  });
  const rest = completion.filter((row) => !used.has(cityKey(row.city)));
  const toSection = (row: CityCompletion): PassportSection => ({
    key: cityKey(row.city),
    city: row.city,
    stamps: [],
    completion: row,
  });
  const elsewhere = stamped.findIndex((section) => section.city === null);
  const withStamps = rest.filter((row) => row.stamped > 0).map(toSection);
  if (elsewhere === -1) stamped.push(...withStamps);
  else stamped.splice(elsewhere, 0, ...withStamps);
  return {
    stamped,
    waiting: rest.filter((row) => row.stamped === 0).map(toSection),
  };
}

export function completionFor(
  rows: readonly CityCompletion[] | undefined,
  city: string,
): CityCompletion | undefined {
  const key = cityKey(city);
  return rows?.find((row) => cityKey(row.city) === key);
}

export function stampDate(stamp: Pick<Stamp, "visitedAt" | "backfilled">) {
  return stamp.backfilled ? null : stamp.visitedAt;
}

export function unstampedCities(places: readonly UnstampedPlace[]) {
  const groups = new Map<string, { city: string; places: UnstampedPlace[] }>();
  for (const place of places) {
    const key = cityKey(place.city);
    const group = groups.get(key);
    if (group) group.places.push(place);
    else groups.set(key, { city: place.city, places: [place] });
  }
  return [...groups.values()];
}

export function unstampedIn(
  places: readonly UnstampedPlace[],
  city: string,
): UnstampedPlace[] {
  const key = cityKey(city);
  return places.filter((place) => cityKey(place.city) === key);
}

export function stampId(stamp: Stamp): string {
  return `${stamp.key}:${stamp.lat ?? ""}:${stamp.lng ?? ""}`;
}

export function wentInCity(stamps: readonly Stamp[] | undefined, city: string) {
  const key = cityKey(city);
  return (stamps ?? []).filter(
    (stamp) => stamp.city && cityKey(stamp.city) === key,
  ).length;
}

export const CARD_PLACES = 6;

export type CardPlace = {
  number: number;
  name: string;
  lat?: number;
  lng?: number;
};

export type SavedOn = "instagram" | "tiktok" | "both" | "elsewhere";

function savedOnOf(stamps: readonly Stamp[]): SavedOn {
  const apps = new Set(stamps.map((stamp) => stamp.source));
  if (apps.has("instagram") && apps.has("tiktok")) return "both";
  if (apps.has("instagram")) return "instagram";
  if (apps.has("tiktok")) return "tiktok";
  return "elsewhere";
}

export function shareCardOf(stamps: readonly Stamp[], city: string) {
  const key = cityKey(city);
  const inCity = stamps.filter(
    (stamp) => stamp.city && cityKey(stamp.city) === key,
  );
  const dated = inCity.find((stamp) => stampDate(stamp) !== null);
  return {
    total: inCity.length,
    month: dated ? dated.visitedAt : null,
    savedOn: savedOnOf(inCity),
    places: inCity.slice(0, CARD_PLACES).map(
      (stamp, index): CardPlace => ({
        number: index + 1,
        name: stamp.name,
        ...(stamp.lat !== undefined && stamp.lng !== undefined
          ? { lat: stamp.lat, lng: stamp.lng }
          : {}),
      }),
    ),
  };
}

type CardSurface = "stamp" | "passport";

export function shareCardHref(city: string, surface: CardSurface) {
  return { pathname: "/passport-card", params: { city, surface } } as const;
}

export function openStampOf(stamp: Stamp, city: string): OpenStamp {
  return {
    itemId: stamp.itemId,
    name: stamp.name,
    city: stamp.city ?? city,
    cover: stamp.cover,
    at: stampDate(stamp),
    ...(stamp.lat !== undefined && stamp.lng !== undefined
      ? { spot: { lat: stamp.lat, lng: stamp.lng } }
      : {}),
  };
}
