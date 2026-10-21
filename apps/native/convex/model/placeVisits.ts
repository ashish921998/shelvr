import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { placeKey } from "./plan";

/** The user's "We went" mark for a place name, or null. */
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
