import { ConvexError, v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { requireUserId } from "./model/auth";
import { planAiAllowed, requirePlanAccess } from "./sharedLists";
import { rateLimiter } from "./model/rateLimiter";
import { travelLayout, travelStopValidator } from "./model/tripTravel";

export const claimDay = internalMutation({
  args: { tripId: v.id("tripPlans"), day: v.number(), layout: v.string() },
  returns: v.union(v.null(), v.array(travelStopValidator)),
  handler: async (ctx, { tripId, day, layout }) => {
    const userId = await requireUserId(ctx);
    const trip = await ctx.db.get(tripId);
    if (!trip || trip.userId !== userId) throw new Error("Trip not found");
    await requirePlanAccess(ctx, trip, userId);
    if (!Number.isInteger(day) || day < 1 || day > trip.dayCount)
      throw new Error("Invalid day");
    const rows = await ctx.db
      .query("tripStops")
      .withIndex("by_trip_and_day", (q) =>
        q.eq("tripId", tripId).eq("day", day),
      )
      .take(150);
    const stops = rows
      .filter((stop) => stop.userId === userId)
      .map(({ _id, lat, lng }) => ({ _id, lat, lng }));
    if (travelLayout(stops) !== layout)
      throw new ConvexError("trip_layout_changed");
    if (stops.length < 2 || !(await planAiAllowed(ctx, trip, userId)))
      return null;
    await rateLimiter.limit(ctx, "tripTravel", {
      key: userId,
      count: stops.length - 1,
      throws: true,
    });
    return stops;
  },
});
