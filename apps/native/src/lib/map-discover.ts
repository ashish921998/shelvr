import type { api } from "@convex/_generated/api";
import { samePlace } from "@convex/model/placeIdentity";
import type { FunctionReturnType } from "convex/server";

export type DiscoverPlace = FunctionReturnType<
  typeof api.places.forMap
>[number];

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
  | (O & { source: "own" })
  | (DiscoverPlace & { source: "discover" });

export function mapEntries<O extends object>(
  own: readonly O[],
  discover: readonly DiscoverPlace[],
): MapEntry<O>[] {
  return [
    ...discover.map((place) => ({ ...place, source: "discover" as const })),
    ...own.map((place) => ({ ...place, source: "own" as const })),
  ];
}
