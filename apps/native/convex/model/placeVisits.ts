import { type Infer, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { Placed } from "./placeIdentity";
import { placeKey } from "./plan";
import { distanceKm, otherVenue, SAME_PLACE_KM } from "./trip";

export const MAX_VISIT_SPOTS = 20;
export const MAX_VISITS = 1000;

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

export type VisitMark = Infer<typeof visitMarkValidator> & { name?: string };

export function spotMarks(
  spot: VisitSpot,
  place: VisitSpot,
  sameName: boolean,
): boolean {
  if (spot.appleId !== undefined && spot.appleId === place.appleId) {
    return true;
  }
  return (
    sameName &&
    !otherVenue(spot, place) &&
    distanceKm(spot, place) <= SAME_PLACE_KM
  );
}

export function sameSpots(
  kept: readonly VisitSpot[],
  spot: VisitSpot,
  sameName: boolean,
): VisitSpot[] {
  if (spot.appleId === undefined) {
    return kept.filter((spotKept) => spotMarks(spotKept, spot, sameName));
  }
  const exact = kept.filter((spotKept) => spotKept.appleId === spot.appleId);
  return exact.length > 0
    ? exact
    : kept.filter(
        (spotKept) =>
          spotKept.appleId === undefined && spotMarks(spotKept, spot, sameName),
      );
}

export function knowsSpot(
  kept: readonly VisitSpot[],
  spot: VisitSpot,
): boolean {
  return spot.appleId === undefined
    ? kept.some((spotKept) => spotMarks(spotKept, spot, true))
    : kept.some((spotKept) => spotKept.appleId === spot.appleId);
}

function nearestPin<T extends Placed>(
  spot: VisitSpot,
  key: string,
  pins: readonly T[],
): T | undefined {
  let nearest: T | undefined;
  let nearestKm = Infinity;
  for (const pin of pins) {
    if (placeKey(pin.name) !== key || !spotMarks(spot, pin, true)) continue;
    const km = distanceKm(spot, pin);
    if (km < nearestKm) {
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
  const byKey = new Map(visits.map((visit) => [visit.key, visit]));
  const appleIds = new Set(
    visits.flatMap((visit) =>
      (visit.spots ?? []).flatMap((spot) =>
        spot.appleId === undefined ? [] : [spot.appleId],
      ),
    ),
  );
  const byApple = (pin: T) =>
    pin.appleId !== undefined && appleIds.has(pin.appleId);
  const open = pins.filter((pin) => !byApple(pin));
  const claimed = new Set<T>(
    visits.flatMap((visit) =>
      (visit.spots ?? []).flatMap((spot) => {
        if (spot.appleId !== undefined) return [];
        const pin = nearestPin(spot, visit.key, open);
        return pin === undefined ? [] : [pin];
      }),
    ),
  );
  return (pin) => {
    if (byApple(pin)) return true;
    const visit = byKey.get(placeKey(pin.name));
    if (visit === undefined) return false;
    return (
      visit.spots === undefined ||
      claimed.has(pin) ||
      visit.spots.some(
        (spot) => spot.appleId !== undefined && spotMarks(spot, pin, true),
      )
    );
  };
}

export function visitedNames(
  visits: readonly VisitMark[],
  pins: readonly Placed[],
): string[] {
  const visited = visitMatcher(visits, pins);
  return [
    ...new Set([
      ...visits.flatMap((visit) =>
        visit.spots === undefined ? [visit.name ?? visit.key] : [],
      ),
      ...pins.filter((pin) => visited(pin)).map((pin) => pin.name),
    ]),
  ];
}

export function visitedKeysOnItem(
  visits: readonly VisitMark[],
  item: Pick<Doc<"items">, "placePins">,
): Set<string> {
  return new Set(visitedNames(visits, item.placePins ?? []).map(placeKey));
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

export function spotsOnItem(
  item: Pick<Doc<"items">, "placePins"> | null,
  key: string,
): VisitSpot[] | undefined {
  const spots = (item?.placePins ?? [])
    .filter((pin) => placeKey(pin.name) === key)
    .map(({ lat, lng, appleId }) =>
      appleId === undefined ? { lat, lng } : { lat, lng, appleId },
    );
  return spots.length === 0 ? undefined : spots;
}

export async function rowSpots(
  ctx: QueryCtx,
  row: Doc<"placeVisits">,
): Promise<VisitSpot[] | undefined> {
  return row.spots ?? spotsOnItem(await ctx.db.get(row.itemId), row.key);
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
      row.spots ?? spotsOnItem(items.get(row.itemId) ?? null, row.key);
    return spots === undefined
      ? { key: row.key, name: row.name }
      : { key: row.key, name: row.name, spots };
  });
}
