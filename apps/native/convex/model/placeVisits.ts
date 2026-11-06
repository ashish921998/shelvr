import { type Infer, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { Placed } from "./placeIdentity";
import { placeKey } from "./plan";
import { distanceKm, otherVenue, SAME_PLACE_KM } from "./trip";

const RECENT_VISITS = 200;
export const MAX_VISIT_SPOTS = 20;

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

export async function userVisits(
  ctx: QueryCtx,
  userId: string,
): Promise<VisitMark[]> {
  const visits = await ctx.db
    .query("placeVisits")
    .withIndex("by_user_and_key", (q) => q.eq("userId", userId))
    .collect();
  return visits.map(({ key, spots }) =>
    spots === undefined ? { key } : { key, spots },
  );
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
