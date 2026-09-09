"use node";

import { randomUUID } from "node:crypto";
import { v } from "convex/values";
import { env, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const capture = internalAction({
  args: {
    userId: v.id("users"),
    createdAt: v.number(),
    attempt: v.optional(v.number()),
    deliveryId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!env.POSTHOG_PROJECT_TOKEN) return null;
    const deliveryId = args.deliveryId ?? randomUUID();
    try {
      const host = (env.POSTHOG_HOST ?? "https://us.i.posthog.com").replace(/\/$/, "");
      const response = await fetch(`${host}/capture/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(3000),
        body: JSON.stringify({
          api_key: env.POSTHOG_PROJECT_TOKEN,
          event: "account_created",
          uuid: deliveryId,
          timestamp: new Date(args.createdAt).toISOString(),
          properties: {
            distinct_id: args.userId,
            $geoip_disable: true,
            environment: env.OBSERVABILITY_ENV === "production" ? "production" : "development",
            analytics_version: 1,
            account_created_at: args.createdAt,
          },
        }),
      });
      if (!response.ok) throw new Error(`Account analytics HTTP ${response.status}`);
    } catch (error) {
      const attempt = args.attempt ?? 0;
      if (attempt >= 5) throw error;
      await ctx.scheduler.runAfter(1000 * 10 ** attempt, internal.accountTelemetry.capture, {
        ...args,
        attempt: attempt + 1,
        deliveryId,
      });
    }
    return null;
  },
});
