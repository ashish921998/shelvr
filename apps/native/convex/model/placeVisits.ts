import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { placeKey } from "./plan";

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
