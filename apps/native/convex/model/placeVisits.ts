import { type Infer, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { Placed } from "./placeIdentity";
import { placeKey } from "./plan";
import { distanceKm, otherVenue, SAME_PLACE_KM } from "./trip";

const RECENT_VISITS = 200;
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

export type VisitMark = Infer<typeof visitMarkValidator>;

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

export function visitMatcher(
  visits: readonly VisitMark[],
): (pin: Placed) => boolean {
  const byKey = new Map(visits.map((visit) => [visit.key, visit]));
  const appleIds = new Set(
    visits.flatMap((visit) =>
      (visit.spots ?? []).flatMap((spot) =>
        spot.appleId === undefined ? [] : [spot.appleId],
      ),
    ),
  );
  return (pin) => {
    if (pin.appleId !== undefined && appleIds.has(pin.appleId)) return true;
    const visit = byKey.get(placeKey(pin.name));
    if (visit === undefined) return false;
    return (
      visit.spots === undefined ||
      visit.spots.some((spot) => spotMarks(spot, pin, true))
    );
  };
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
    return spots === undefined ? { key: row.key } : { key: row.key, spots };
  });
}

export async function visitedPlaceKeys(
  ctx: QueryCtx,
  userId: string,
): Promise<Set<string>> {
  const visits = await ctx.db
    .query("placeVisits")
    .withIndex("by_user_and_key", (q) => q.eq("userId", userId))
    .collect();
  return new Set(visits.map((visit) => visit.key));
}

export async function recentVisits(
  ctx: QueryCtx,
  userId: string,
): Promise<string[]> {
  const visits = await ctx.db
    .query("placeVisits")
    .withIndex("by_user_and_visited", (q) => q.eq("userId", userId))
    .order("desc")
    .take(RECENT_VISITS);
  return visits.map((visit) => visit.name);
}
