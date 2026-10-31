import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { authedMutation, authedQuery, liveOwner } from "./model/auth";
import { requireProEntitlement } from "./subscriptions";
import { rateLimiter } from "./model/rateLimiter";

const sharedStop = v.object({
  name: v.string(),
  lat: v.number(),
  lng: v.number(),
});

export const getShareToken = authedQuery({
  args: { tripId: v.id("tripPlans") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { tripId }) => {
    const trip = await ctx.db.get(tripId);
    return trip?.userId === ctx.userId ? (trip.shareToken ?? null) : null;
  },
});

export const createShare = authedMutation({
  args: { tripId: v.id("tripPlans") },
  returns: v.string(),
  handler: async (ctx, { tripId }) => {
    const trip = await ctx.db.get(tripId);
    if (!trip || trip.userId !== ctx.userId) throw new Error("Trip not found");
    await requireProEntitlement(ctx, ctx.userId);
    if (trip.shareToken) return trip.shareToken;
    await rateLimiter.limit(ctx, "planShare", {
      key: ctx.userId,
      throws: true,
    });
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const token = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    await ctx.db.patch(tripId, { shareToken: token });
    return token;
  },
});

export const revokeShare = authedMutation({
  args: { tripId: v.id("tripPlans"), token: v.string() },
  returns: v.null(),
  handler: async (ctx, { tripId, token }) => {
    const trip = await ctx.db.get(tripId);
    if (!trip || trip.userId !== ctx.userId) throw new Error("Trip not found");
    if (trip.shareToken === token)
      await ctx.db.patch(tripId, { shareToken: undefined });
    return null;
  },
});

export const getPublicTrip = internalQuery({
  args: { token: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      name: v.optional(v.string()),
      city: v.string(),
      startDate: v.optional(v.string()),
      days: v.array(v.array(sharedStop)),
      unplanned: v.array(sharedStop),
    }),
  ),
  handler: async (ctx, { token }) => {
    if (!/^[a-f0-9]{32}$/.test(token)) return null;
    const trip = await ctx.db
      .query("tripPlans")
      .withIndex("by_share_token", (q) => q.eq("shareToken", token))
      .unique();
    if (!trip || !(await liveOwner(ctx, trip.userId))) return null;
    const stops = await ctx.db
      .query("tripStops")
      .withIndex("by_trip_and_day", (q) => q.eq("tripId", trip._id))
      .take(150);
    const own = stops.filter((stop) => stop.userId === trip.userId);
    const onDay = (day: number) =>
      own
        .filter((stop) => stop.day === day)
        .map(({ name, lat, lng }) => ({ name, lat, lng }));
    return {
      name: trip.name,
      city: trip.city,
      startDate: trip.startDate,
      days: Array.from({ length: trip.dayCount }, (_, index) =>
        onDay(index + 1),
      ),
      unplanned: onDay(0),
    };
  },
});
