import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { placeKey } from "./plan";

const RECENT_VISITS = 200;

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
