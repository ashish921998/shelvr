import { type Infer, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { Placed } from "./placeIdentity";
import { placeKey, splitSavedPlace } from "./plan";
import { distanceKm, otherVenue, SAME_PLACE_KM } from "./trip";

export const MAX_VISIT_SPOTS = 20;
const MAX_VISITS = 1000;

export const visitSpotValidator = v.object({
  lat: v.number(),
  lng: v.number(),
  appleId: v.optional(v.string()),
});

export type VisitSpot = Infer<typeof visitSpotValidator>;

export const visitMarkValidator = v.object({
  key: v.string(),
  spots: v.optional(v.array(visitSpotValidator)),
});

export const namedVisitMarkValidator = visitMarkValidator.extend({
  name: v.optional(v.string()),
});

export type VisitMark = Infer<typeof namedVisitMarkValidator>;

function samePoint(a: VisitSpot, b: VisitSpot): boolean {
  return a.lat === b.lat && a.lng === b.lng;
}

export function spotsToClear(
  kept: readonly VisitSpot[],
  spot: VisitSpot,
  sameName: boolean,
): VisitSpot[] {
  const exact = kept.filter((other) =>
    spot.appleId !== undefined && other.appleId !== undefined
      ? spot.appleId === other.appleId
      : sameName && samePoint(other, spot),
  );
  if (exact.length > 0 || !sameName) return exact;
  const nearby = kept
    .filter((other) => other.appleId === undefined)
    .map((other) => ({ other, km: distanceKm(other, spot) }))
    .sort((a, b) => a.km - b.km)[0];
  return nearby && nearby.km <= SAME_PLACE_KM ? [nearby.other] : [];
}

export function knowsSpot(
  kept: readonly VisitSpot[],
  spot: VisitSpot,
): boolean {
  return kept.some((other) =>
    spot.appleId !== undefined && other.appleId !== undefined
      ? spot.appleId === other.appleId
      : samePoint(other, spot),
  );
}

function nearestPin<T extends Placed>(
  spot: VisitSpot,
  pins: readonly T[],
): T | undefined {
  let nearest: T | undefined;
  let nearestKm = Infinity;
  for (const pin of pins) {
    if (otherVenue(spot, pin)) continue;
    const km = distanceKm(spot, pin);
    if (km <= SAME_PLACE_KM && km < nearestKm) {
      nearest = pin;
      nearestKm = km;
    }
  }
  return nearest;
}

export function visitMatcher<T extends Placed>(
  visits: readonly VisitMark[],
  pins: readonly T[],
): (pin: T) => boolean {
  const exact = visitAtPin(visits);
  const pinsByName = new Map<string, T[]>();
  for (const pin of pins) {
    const key = placeKey(pin.name);
    const group = pinsByName.get(key);
    if (group) group.push(pin);
    else pinsByName.set(key, [pin]);
  }
  const claimed = new Set<T>();
  for (const visit of visits) {
    const group = pinsByName.get(visit.key) ?? [];
    for (const spot of visit.spots ?? []) {
      if (spot.appleId !== undefined) continue;
      const pin = nearestPin(spot, group);
      if (pin !== undefined) claimed.add(pin);
    }
  }
  return (pin) => exact(pin) || claimed.has(pin);
}

export function visitAtPin(
  visits: readonly VisitMark[],
): (pin: Placed) => boolean {
  const names = new Set<string>();
  const appleIds = new Set<string>();
  const spotsByName = new Map<string, VisitSpot[]>();
  for (const visit of visits) {
    if (visit.spots === undefined) {
      names.add(visit.key);
      continue;
    }
    for (const spot of visit.spots) {
      if (spot.appleId !== undefined) appleIds.add(spot.appleId);
    }
    const bare =
      visit.name === undefined ? visit.key : barePlaceKey(visit.name);
    for (const key of new Set([visit.key, bare])) {
      if (key === "") continue;
      const existing = spotsByName.get(key);
      if (existing) existing.push(...visit.spots);
      else spotsByName.set(key, [...visit.spots]);
    }
  }
  return (pin) => {
    if (pin.appleId !== undefined && appleIds.has(pin.appleId)) return true;
    const key = placeKey(pin.name);
    return (
      names.has(key) ||
      [key, barePlaceKey(pin.name)].some((candidate) =>
        spotsByName
          .get(candidate)
          ?.some((spot) => !otherVenue(spot, pin) && samePoint(spot, pin)),
      )
    );
  };
}

export function unscopedVisitNames(visits: readonly VisitMark[]): string[] {
  return visits.flatMap((visit) =>
    visit.spots === undefined ? [visit.name ?? visit.key] : [],
  );
}

export function visitedKeysOnItem(
  visits: readonly VisitMark[],
  item: Pick<Doc<"items">, "placePins">,
): Set<string> {
  const visited = visitAtPin(visits);
  return new Set(
    [
      ...unscopedVisitNames(visits),
      ...(item.placePins ?? []).filter(visited).map((pin) => pin.name),
    ].map(placeKey),
  );
}

export async function findVisit(
  ctx: QueryCtx,
  userId: Id<"users">,
  name: string,
): Promise<Doc<"placeVisits"> | null> {
  return await ctx.db
    .query("placeVisits")
    .withIndex("by_user_and_key", (q) =>
      q.eq("userId", userId).eq("key", placeKey(name)),
    )
    .unique();
}

export async function visitRows(
  ctx: QueryCtx,
  userId: string,
): Promise<Doc<"placeVisits">[]> {
  return await ctx.db
    .query("placeVisits")
    .withIndex("by_user_and_visited", (q) => q.eq("userId", userId))
    .order("desc")
    .take(MAX_VISITS);
}

function barePlaceKey(name: string): string {
  return placeKey(splitSavedPlace(name).name);
}

function pinsForVisit(
  item: Pick<Doc<"items">, "placePins" | "places"> | null,
  name: string,
): NonNullable<Doc<"items">["placePins"]> {
  const pins = item?.placePins ?? [];
  const key = placeKey(name);
  const exact = pins.filter((pin) => placeKey(pin.name) === key);
  if (exact.length > 0) return exact;
  const bare = barePlaceKey(name);
  if (bare === "" || bare === key) return [];
  const qualifiedLabels = new Set(
    (item?.places ?? [])
      .filter((label) => barePlaceKey(label) === bare)
      .map(placeKey)
      .filter((label) => label !== bare),
  );
  if (qualifiedLabels.size !== 1 || !qualifiedLabels.has(key)) return [];
  const matches = pins.filter((pin) => barePlaceKey(pin.name) === bare);
  return matches.length === 1 && placeKey(matches[0].name) === bare
    ? matches
    : [];
}

export function spotsOnItem(
  item: Pick<Doc<"items">, "placePins" | "places"> | null,
  name: string,
): VisitSpot[] | undefined {
  const spots = pinsForVisit(item, name).map(({ lat, lng, appleId }) =>
    appleId === undefined ? { lat, lng } : { lat, lng, appleId },
  );
  return spots.length === 0 ? undefined : spots;
}

export async function rowSpots(
  ctx: QueryCtx,
  row: Doc<"placeVisits">,
): Promise<VisitSpot[] | undefined> {
  return row.spots ?? spotsOnItem(await ctx.db.get(row.itemId), row.name);
}

export async function userVisits(
  ctx: QueryCtx,
  userId: string,
  saves: readonly Doc<"items">[] = [],
): Promise<VisitMark[]> {
  const rows = await visitRows(ctx, userId);
  const items = new Map<string, Doc<"items"> | null>(
    saves.map((save) => [save._id, save]),
  );
  const missing = [
    ...new Set(
      rows
        .filter((row) => row.spots === undefined && !items.has(row.itemId))
        .map((row) => row.itemId),
    ),
  ];
  for (const [id, item] of await Promise.all(
    missing.map(async (id) => [id, await ctx.db.get(id)] as const),
  )) {
    items.set(id, item);
  }
  return rows.map((row) => {
    const spots =
      row.spots ?? spotsOnItem(items.get(row.itemId) ?? null, row.name);
    return spots === undefined
      ? { key: row.key, name: row.name }
      : { key: row.key, name: row.name, spots };
  });
}
