import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { Placed } from "./placeIdentity";
import { placeKey, splitSavedPlace } from "./plan";
import { distanceKm, otherVenue, pinsForCity, SAME_PLACE_KM } from "./trip";

export type Removal = Omit<Doc<"placeRemovals">, "_id" | "userId">;
export const removalValidator = v.object({
  name: v.string(),
  city: v.string(),
  lat: v.number(),
  lng: v.number(),
  appleId: v.optional(v.string()),
  _creationTime: v.number(),
});
function venueKey(label: string): string {
  const { name } = splitSavedPlace(label);
  return placeKey(name) || name;
}

function removedPin(removal: Removal, pin: Placed): boolean {
  if (pin.appleId && pin.appleId === removal.appleId) return true;
  if (otherVenue(pin, removal)) return false;
  return (
    distanceKm(pin, removal) <= SAME_PLACE_KM &&
    placeKey(pin.name) === placeKey(removal.name)
  );
}

type Label = { key: string; cities: string[]; area: string };

function parseLabel(value: string, cities: readonly string[]): Label {
  const known = new Set(cities.map(placeKey));
  const parts = splitSavedPlace(value)
    .area.split(",")
    .map(placeKey)
    .filter(Boolean);
  return {
    key: venueKey(value),
    cities: parts.filter((part) => known.has(part)),
    area: parts.filter((part) => !known.has(part)).join(","),
  };
}

function namesCity(label: Label, city: string | undefined): boolean {
  return (
    !city || label.cities.length === 0 || label.cities.includes(placeKey(city))
  );
}

export function isRemovedSuggestion(
  removals: readonly Removal[],
  pin: Placed,
): boolean {
  return removals.some((row) => removedPin(row, pin));
}

export function removalsSince<Row extends Removal>(
  removals: readonly Row[],
  savedAt: number,
): Row[] {
  return removals.filter((row) => savedAt <= row._creationTime);
}

function placeLabels(item: Doc<"items">): Label[] {
  return [
    ...(item.places ?? []),
    ...(item.intents ?? [])
      .filter((intent) => intent.kind === "open_maps")
      .map((intent) => intent.value),
  ].map((value) => parseLabel(value, item.cities ?? []));
}

function namesPlaceIn(item: Doc<"items">, city: string): boolean {
  return (
    pinsForCity(item, city).length > 0 ||
    placeLabels(item).some((label) => namesCity(label, city))
  );
}

export function visibleItemPlaces(
  item: Doc<"items">,
  removals: readonly Removal[],
): Doc<"items"> {
  const applicable = removalsSince(removals, item._creationTime);
  if (!applicable.length) return item;
  const cities = item.cities ?? [];
  const hidden = (item.placePins ?? []).filter((pin) =>
    applicable.some((row) => removedPin(row, pin)),
  );
  const placePins = item.placePins?.filter((pin) => !hidden.includes(pin));
  const namesPin = (
    label: Label,
    pin: { name: string; city?: string },
  ): boolean => {
    const own = parseLabel(pin.name, [...cities, pin.city ?? ""]);
    return (
      own.key === label.key &&
      namesCity(label, pin.city) &&
      (!label.area || !own.area || label.area === own.area)
    );
  };
  const labels = placeLabels(item);
  const hidesLabel = (
    label: Label,
    pin: Placed & { city?: string },
  ): boolean => {
    if (!namesPin(label, pin)) return false;
    if (!label.area || parseLabel(pin.name, [...cities, pin.city ?? ""]).area)
      return true;
    const branches = labels.filter(
      (other) =>
        other.key === label.key && other.area && namesCity(other, pin.city),
    );
    return new Set(branches.map((other) => other.area)).size === 1;
  };
  const namesRemoval = (label: Label, row: Removal): boolean =>
    venueKey(row.name) === label.key &&
    cities.some((city) => placeKey(city) === placeKey(row.city)) &&
    namesCity(label, row.city) &&
    (!label.area || label.area === parseLabel(row.name, [row.city]).area);
  const keep = (value: string): boolean => {
    const label = parseLabel(value, cities);
    if (placePins?.some((pin) => namesPin(label, pin))) return true;
    if (hidden.some((pin) => hidesLabel(label, pin))) return false;
    return !applicable.some((row) => namesRemoval(label, row));
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

export function visibleCitySave(
  item: Doc<"items">,
  removals: readonly Removal[],
): Doc<"items"> {
  const visible = visibleItemPlaces(item, removals);
  return visible === item
    ? item
    : {
        ...visible,
        cities: item.cities?.filter(
          (city) => !namesPlaceIn(item, city) || namesPlaceIn(visible, city),
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
      .withIndex("by_user", (q) => q.eq("userId", userId))
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
