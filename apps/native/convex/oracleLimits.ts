import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { rateLimiter } from "./model/rateLimiter";
import { ipKey } from "./model/clientIp";

export const claimRequestBody = internalMutation({
  args: {
    ip: v.optional(v.string()),
    route: v.union(
      v.literal("oracle"),
      v.literal("waitlist"),
      v.literal("oracle-image"),
      v.literal("reel-places"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "requestBodyGlobal", { throws: true });
    await rateLimiter.limit(ctx, "requestBodyIp", {
      key: `${args.route}:${ipKey(args.ip)}`,
      throws: true,
    });
    return null;
  },
});

export const claim = internalMutation({
  args: { ip: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "oracleGlobal", { throws: true });
    await rateLimiter.limit(ctx, "oracleIp", {
      key: ipKey(args.ip),
      throws: true,
    });
    return null;
  },
});

export const claimReelPlaces = internalMutation({
  args: { ip: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "reelPlacesGlobal", { throws: true });
    await rateLimiter.limit(ctx, "reelPlacesIp", {
      key: ipKey(args.ip),
      throws: true,
    });
    return null;
  },
});
