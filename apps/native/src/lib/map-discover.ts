import type { api } from "@convex/_generated/api";
import { samePlace } from "@convex/model/placeIdentity";
import type { FunctionReturnType } from "convex/server";
import { searchPlaces } from "./map-filters";

export type DiscoverPlace = FunctionReturnType<
  typeof api.places.inArea
>["places"][number];

type OwnPin = { name: string; lat: number; lng: number; appleId?: string };

const band = (lat: number) => Math.floor(lat * 100);

export function discoverBeside(
  own: readonly OwnPin[],
  discover: readonly DiscoverPlace[],
): DiscoverPlace[] {
  const appleIds = new Set<string>();
  const bands = new Map<number, OwnPin[]>();
  for (const pin of own) {
    if (pin.appleId !== undefined) appleIds.add(pin.appleId);
    const key = band(pin.lat);
    const list = bands.get(key);
    if (list) list.push(pin);
    else bands.set(key, [pin]);
  }
  return discover.filter((place) => {
    if (appleIds.has(place.appleId)) return false;
    const key = band(place.lat);
    return ![key - 1, key, key + 1].some((k) =>
      bands.get(k)?.some((pin) => samePlace(pin, place)),
    );
  });
}

export type MapEntry<O extends object> =
  | (O & { source: "own"; visited: boolean })
  | (DiscoverPlace & { source: "discover" });

export function mapEntries<O extends object>(
  own: readonly O[],
  discover: readonly DiscoverPlace[],
  visited: (place: O) => boolean,
): MapEntry<O>[] {
  return [
    ...own.map((place) => ({
      ...place,
      source: "own" as const,
      visited: visited(place),
    })),
    ...discover.map((place) => ({ ...place, source: "discover" as const })),
  ];
}

export function searchEntries<
  T extends { source: "own" | "discover"; name: string; city?: string },
>(entries: readonly T[], query: string): T[] {
  const matches = searchPlaces(entries, query);
  return [
    ...matches.filter((entry) => entry.source === "own"),
    ...matches.filter((entry) => entry.source === "discover"),
  ];
}

export function ownOnTop<T extends { source: "own" | "discover" }>(
  entries: readonly T[],
): T[] {
  return [
    ...entries.filter((entry) => entry.source === "discover"),
    ...entries.filter((entry) => entry.source === "own"),
  ];
}

export function mapWaits(state: {
  own: readonly unknown[] | undefined;
  discoverSettled: boolean;
  areaShown: boolean;
  askingLocation: boolean;
}): boolean {
  return (
    state.own === undefined ||
    (state.own.length === 0 && !state.discoverSettled && !state.areaShown) ||
    state.askingLocation
  );
}
