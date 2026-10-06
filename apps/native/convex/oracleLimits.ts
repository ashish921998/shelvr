import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { rateLimiter } from "./model/rateLimiter";
import { UNKNOWN_IP_LIMITER_KEY, normalizeIp } from "./waitlist";

export const claimRequestBody = internalMutation({
  args: {
    ip: v.optional(v.string()),
    route: v.union(
      v.literal("oracle"),
      v.literal("waitlist"),
      v.literal("oracle-image"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "requestBodyGlobal", { throws: true });
    await rateLimiter.limit(ctx, "requestBodyIp", {
      key: `${args.route}:${normalizeIp(args.ip) ?? UNKNOWN_IP_LIMITER_KEY}`,
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
      key: normalizeIp(args.ip) ?? UNKNOWN_IP_LIMITER_KEY,
      throws: true,
    });
    return null;
  },
});
