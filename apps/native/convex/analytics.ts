"use node";

import { randomUUID } from "node:crypto";
import { v } from "convex/values";
import { env, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { logEvent } from "./model/log";
import { paymentTelemetryValidator } from "./model/paymentTelemetry";

class PermanentPaymentDeliveryError extends Error {}

export const capturePayment = internalAction({
  args: {
    payment: paymentTelemetryValidator,
    attempt: v.optional(v.number()),
    deliveryId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const deliveryId = args.deliveryId ?? randomUUID();
    const { payment } = args;
    try {
      if (!env.POSTHOG_PROJECT_TOKEN)
        throw new Error("Payment analytics is not configured");
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
          event: payment.event,
          uuid: deliveryId,
          timestamp: new Date(payment.timestamp).toISOString(),
          properties: {
            distinct_id: payment.userId,
            $process_person_profile: false,
            environment:
              env.OBSERVABILITY_ENV === "production"
                ? payment.environment
                : "development",
            store_environment: payment.environment,
            analytics_version: 1,
            revenuecat_event_id: payment.eventId,
            product_id: payment.product_id,
            payment_kind: payment.payment_kind,
            country_code: payment.country_code,
            revenue_usd: payment.revenue_usd,
            // Cancellation events only; dropped from the body when absent,
            // so purchase payloads are unchanged.
            cancel_reason: payment.cancel_reason,
            cancel_category: payment.cancel_category,
          },
        }),
      });
      if (response.ok) return null;
      if (
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 429
      ) {
        throw new PermanentPaymentDeliveryError(
          `Payment analytics HTTP ${response.status}`,
        );
      }
      throw new Error(`Payment analytics HTTP ${response.status}`);
    } catch (error) {
      if (error instanceof PermanentPaymentDeliveryError) throw error;
      const attempt = args.attempt ?? 0;
      if (attempt >= 5) throw error;
      await ctx.scheduler.runAfter(
        1000 * 10 ** attempt,
        internal.analytics.capturePayment,
        {
          ...args,
          deliveryId,
          attempt: attempt + 1,
        },
      );
    }
    return null;
  },
});

export const captureSave = internalAction({
  args: {
    itemId: v.id("items"),
    userId: v.string(),
    itemType: v.union(v.literal("image"), v.literal("link"), v.literal("note")),
    savedAt: v.number(),
    sessionId: v.optional(v.string()),
    // Image saves only: photos held after this save, and the stored file size.
    photoCount: v.optional(v.number()),
    storedBytes: v.optional(v.number()),
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
            photo_count: args.photoCount,
            stored_bytes: args.storedBytes,
            environment: env.OBSERVABILITY_ENV ?? "development",
            analytics_version: 1,
          },
        }),
      });
      if (response.ok) return null;
      if (response.status < 500 && response.status !== 429) {
        logEvent("warn", "save_telemetry_rejected", {
          status: response.status,
        });
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
      logEvent("warn", "save_telemetry_delivery_failed", {
        attempts: attempt + 1,
      });
    }
    return null;
  },
});
