import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { splitSavedPlace } from "./plan";
import { distanceKm, SAME_PLACE_KM } from "./trip";

export type Removal = Omit<Doc<"placeRemovals">, "_id" | "userId">;
export const removalValidator = v.object({
  name: v.string(),
  city: v.string(),
  area: v.string(),
  lat: v.number(),
  lng: v.number(),
  appleId: v.optional(v.string()),
  _creationTime: v.number(),
});
const MAX_UNIDENTIFIED_DISTANCE_KM = 2;

function normalized(value: string): string {
  return (
    value
      .normalize("NFKC")
      .normalize("NFD")
      .replace(/(\p{Script=Latin})\p{M}+/gu, "$1")
      .normalize("NFC")
      .toLowerCase()
      .match(/[\p{L}\p{N}\p{So}\p{M}]+/gu)
      ?.join(" ") ?? ""
  );
}

function venueName(value: string): string {
  return normalized(splitSavedPlace(value).name).replace(
    /\s+(restaurant|restaurante|cafe|bar)$/u,
    "",
  );
}

function areaOf(name: string, cities: readonly string[]): string {
  const cityNames = new Set(cities.map(normalized));
  return splitSavedPlace(name)
    .area.split(",")
    .map(normalized)
    .filter((part) => part !== "" && !cityNames.has(part))
    .join(",");
}

export function removalArea(
  item: Doc<"items">,
  name: string,
  city: string,
): string {
  const direct = areaOf(name, [city]);
  if (direct) return direct;
  const areas = new Set(
    (item.places ?? [])
      .filter((value) => venueName(value) === venueName(name))
      .map((value) => areaOf(value, [city]))
      .filter(Boolean),
  );
  return areas.size === 1 ? [...areas][0] : "";
}

function sameLabel(
  a: string,
  aArea: string,
  b: string,
  bArea: string,
): boolean {
  const key = venueName(a);
  return key !== "" && key === venueName(b) && (!bArea || aArea === bArea);
}

function removedPin(
  removal: Removal,
  pin: {
    name: string;
    area?: string;
    city?: string;
    lat: number;
    lng: number;
    appleId?: string;
  },
): boolean {
  if (pin.appleId && pin.appleId === removal.appleId) return true;
  const area = areaOf(pin.area ? `${pin.name}, ${pin.area}` : pin.name, [
    pin.city ?? removal.city,
  ]);
  if (!sameLabel(removal.name, removal.area, pin.name, area)) return false;
  const limit =
    pin.appleId && removal.appleId
      ? SAME_PLACE_KM
      : MAX_UNIDENTIFIED_DISTANCE_KM;
  return distanceKm(pin, removal) <= limit;
}

export function isRemovedSuggestion(
  removals: readonly Removal[],
  pin: {
    name: string;
    area?: string;
    lat: number;
    lng: number;
    appleId?: string;
  },
): boolean {
  return removals.some((row) => removedPin(row, pin));
}

export function visibleItemPlaces(
  item: Doc<"items">,
  removals: readonly Removal[],
): Doc<"items"> {
  const applicable = removals.filter(
    (row) => (item.sourceSavedAt ?? item._creationTime) <= row._creationTime,
  );
  if (!applicable.length) return item;
  const hidden = (item.placePins ?? []).filter((pin) =>
    applicable.some((row) => removedPin(row, pin)),
  );
  const placePins = item.placePins?.filter((pin) => !hidden.includes(pin));
  const keep = (name: string) => {
    const area = areaOf(name, item.cities ?? []);
    const matches = (pin: { name: string; city?: string }) =>
      sameLabel(
        pin.name,
        areaOf(pin.name, [pin.city ?? "", ...(item.cities ?? [])]),
        name,
        area,
      );
    if (hidden.some(matches) && !(placePins ?? []).some(matches)) return false;
    return !applicable.some((row) => {
      if (
        !(item.cities ?? []).some(
          (city) => normalized(city) === normalized(row.city),
        )
      )
        return false;
      if (!sameLabel(row.name, row.area, name, area)) return false;
      return !(placePins ?? []).some(matches);
    });
  };
  return {
    ...item,
    placePins,
    places: item.places?.filter(keep),
    intents: item.intents?.filter(
      (intent) => intent.kind !== "open_maps" || keep(intent.value),
    ),
  };
}

export async function userRemovals(
  ctx: QueryCtx,
  userId: string,
): Promise<Removal[]> {
  return (
    await ctx.db
      .query("placeRemovals")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect()
  ).map(({ _id: _id, userId: _userId, ...row }) => row);
}

export async function visibleSave(
  ctx: QueryCtx,
  item: Doc<"items">,
  removals?: readonly Removal[],
): Promise<Doc<"items">> {
  return visibleItemPlaces(
    item,
    removals ?? (await userRemovals(ctx, item.userId)),
  );
}
