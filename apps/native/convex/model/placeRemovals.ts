import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { nameWords } from "./placeIdentity";
import { placeKey, splitSavedPlace } from "./plan";
import { cityKey, distanceKm, SAME_PLACE_KM, uniquePlacePins } from "./trip";

declare const visible: unique symbol;
export type VisibleItem = Doc<"items"> & { readonly [visible]: true };
export type Removal = Pick<
  Doc<"placeRemovals">,
  "key" | "city" | "name" | "area" | "lat" | "lng" | "appleId" | "removedAt"
>;
export const removalValidator = v.object({
  key: v.string(),
  city: v.string(),
  name: v.string(),
  area: v.string(),
  lat: v.number(),
  lng: v.number(),
  appleId: v.optional(v.string()),
  removedAt: v.number(),
});
const decisions = new WeakMap<VisibleItem, readonly Removal[]>();

export function visibleWithIntents(
  item: VisibleItem,
  intents: Doc<"items">["intents"],
): VisibleItem {
  return visibleItemPlaces({ ...item, intents }, decisions.get(item) ?? []);
}

export async function suggestionRemovals(
  ctx: QueryCtx,
  userId: string,
  city: string,
): Promise<Removal[]> {
  return (await cityRemovals(ctx, userId, city)).map(
    ({ key, city, name, area, lat, lng, appleId, removedAt }) => ({
      key,
      city,
      name,
      area,
      lat,
      lng,
      ...(appleId ? { appleId } : {}),
      removedAt,
    }),
  );
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
  return removals.some((row) =>
    removedPin(row, {
      ...pin,
      name: pin.area ? `${pin.name}, ${pin.area}` : pin.name,
    }),
  );
}

type Pin = NonNullable<Doc<"items">["placePins"]>[number];

export function sameMapPin(a: Pin, b: Pin): boolean {
  return uniquePlacePins([a, b]).length === 1;
}

export function removalKey(name: string): string {
  const words = nameWords(splitSavedPlace(name).name);
  if (
    words.length > 1 &&
    ["restaurant", "restaurante"].includes(words.at(-1) ?? "")
  )
    words.pop();
  return words.join(" ");
}

function areaOf(name: string, city: string): string {
  return splitSavedPlace(name)
    .area.split(",")
    .map(placeKey)
    .filter((part) => part !== "" && part !== placeKey(city))
    .join(",");
}

export function removalArea(
  item: Doc<"items">,
  pin: Pin,
  city: string,
): string {
  const direct = areaOf(pin.name, city);
  if (direct) return direct;
  const areas = new Set(
    (item.places ?? [])
      .filter((name) => removalKey(name) === removalKey(pin.name))
      .map((name) => areaOf(name, city))
      .filter(Boolean),
  );
  return areas.size === 1 ? [...areas][0] : "";
}

function inCity(
  item: Doc<"items">,
  name: string,
  city: string,
  explicit?: string,
): boolean {
  if (explicit) return cityKey(explicit) === city;
  const cities = item.cities ?? [];
  if (cities.length === 1) return cityKey(cities[0]) === city;
  return splitSavedPlace(name)
    .area.split(",")
    .some((part) => cityKey(part) === city);
}

export function removedName(removal: Removal, name: string): boolean {
  if (removalKey(name) !== removal.key) return false;
  const area = areaOf(name, removal.city);
  return !area || !removal.area || area === removal.area;
}

function removedPin(removal: Removal, pin: Pin): boolean {
  if (pin.appleId && pin.appleId === removal.appleId) return true;
  if (!removedName(removal, pin.name)) return false;
  const area = areaOf(pin.name, removal.city);
  if (area && removal.area === area) return true;
  if (!pin.appleId) return true;
  return distanceKm(pin, removal) <= SAME_PLACE_KM;
}

export function visibleItemPlaces(
  item: Doc<"items">,
  removals: readonly Removal[] = [],
): VisibleItem {
  const applicable = removals.filter(
    (row) => (item.sourceSavedAt ?? item._creationTime) <= row.removedAt,
  );
  const hidden = (item.placePins ?? []).filter((pin) =>
    applicable.some(
      (row) =>
        inCity(item, pin.name, row.city, pin.city) && removedPin(row, pin),
    ),
  );
  const placePins = item.placePins?.filter((pin) => !hidden.includes(pin));
  const keep = (name: string) => {
    const sameLabel = (pin: Pin) => {
      if (removalKey(pin.name) !== removalKey(name)) return false;
      const city =
        pin.city ?? (item.cities?.length === 1 ? item.cities[0] : "");
      const labelArea = areaOf(name, city);
      const pinArea = areaOf(pin.name, city);
      return !labelArea || !pinArea || labelArea === pinArea;
    };
    if (hidden.some(sameLabel) && !(placePins ?? []).some(sameLabel))
      return false;
    return !applicable.some((row) => {
      if (!inCity(item, name, row.city) || !removedName(row, name))
        return false;
      const area = areaOf(name, row.city);
      if (area) return true;
      return !(placePins ?? []).some(
        (pin) =>
          inCity(item, pin.name, row.city, pin.city) &&
          removalKey(pin.name) === removalKey(name),
      );
    });
  };
  const result = {
    ...item,
    placePins,
    places: item.places?.filter(keep),
    intents: item.intents?.filter(
      (intent) => intent.kind !== "open_maps" || keep(intent.value),
    ),
  } as VisibleItem;
  decisions.set(result, removals);
  return result;
}

export async function savedStopRemoved(
  ctx: QueryCtx,
  item: Doc<"items">,
  stop: { name: string; area?: string; lat?: number; lng?: number },
  city?: string,
): Promise<boolean> {
  const cities = city ? [city] : (item.cities ?? []);
  const removals = (
    await Promise.all(
      cities.map((value) => cityRemovals(ctx, item.userId, value)),
    )
  )
    .flat()
    .filter(
      (row) => (item.sourceSavedAt ?? item._creationTime) <= row.removedAt,
    );
  return isRemovedSuggestion(removals, {
    ...stop,
    lat: stop.lat ?? 0,
    lng: stop.lng ?? 0,
  });
}

const reads = new WeakMap<
  QueryCtx,
  Map<string, Promise<Doc<"placeRemovals">[]>>
>();
export function cityRemovals(
  ctx: QueryCtx,
  userId: string,
  city: string,
): Promise<Doc<"placeRemovals">[]> {
  let cache = reads.get(ctx);
  if (!cache) {
    cache = new Map();
    reads.set(ctx, cache);
  }
  const key = JSON.stringify([userId, cityKey(city)]);
  let pending = cache.get(key);
  if (!pending) {
    pending = ctx.db
      .query("placeRemovals")
      .withIndex("by_userId_and_city", (q) =>
        q.eq("userId", userId).eq("city", cityKey(city)),
      )
      .collect();
    cache.set(key, pending);
  }
  return pending;
}

export async function visibleSave(
  ctx: QueryCtx,
  item: Doc<"items">,
): Promise<VisibleItem> {
  const cities = [
    ...new Set(
      [
        ...(item.cities ?? []),
        ...(item.placePins ?? []).flatMap((pin) =>
          pin.city ? [pin.city] : [],
        ),
      ].map(cityKey),
    ),
  ];
  const removals = (
    await Promise.all(
      cities.map((city) => cityRemovals(ctx, item.userId, city)),
    )
  ).flat();
  return visibleItemPlaces(item, removals);
}
