"use node";

import { randomUUID } from "node:crypto";
import { v } from "convex/values";
import { env, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const captureSave = internalAction({
  args: {
    itemId: v.id("items"),
    userId: v.string(),
    itemType: v.union(v.literal("image"), v.literal("link"), v.literal("note")),
    savedAt: v.number(),
    sessionId: v.optional(v.string()),
    attempt: v.optional(v.number()),
    eventId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!env.POSTHOG_PROJECT_TOKEN) return null;
    const eventId = args.eventId ?? randomUUID();
    try {
      const host = (env.POSTHOG_HOST ?? "https://us.i.posthog.com").replace(
        /\/$/,
        "",
      );
      const response = await fetch(`${host}/capture/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(3000),
        body: JSON.stringify({
          api_key: env.POSTHOG_PROJECT_TOKEN,
          event: "item_saved",
          uuid: eventId,
          timestamp: new Date(args.savedAt).toISOString(),
          properties: {
            distinct_id: args.userId,
            $process_person_profile: false,
            item_id: args.itemId,
            item_type: args.itemType,
            saved_at: args.savedAt,
            save_session_id: args.sessionId,
            environment: env.OBSERVABILITY_ENV ?? "development",
            analytics_version: 1,
          },
        }),
      });
      if (response.ok) return null;
      if (response.status < 500 && response.status !== 429) {
        console.warn("save_telemetry_rejected", response.status);
        return null;
      }
    } catch {
      // A delivery failure cannot affect the already committed save.
    }
    const attempt = args.attempt ?? 0;
    if (attempt < 3) {
      await ctx.scheduler.runAfter(
        1000 * 10 ** attempt,
        internal.analytics.captureSave,
        {
          ...args,
          attempt: attempt + 1,
          eventId,
        },
      );
    } else {
      console.warn("save_telemetry_delivery_failed");
    }
    return null;
  },
});
