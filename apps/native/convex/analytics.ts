"use node";

import { v } from "convex/values";
import { env, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { logEvent } from "./model/log";
import { paymentTelemetryValidator } from "./model/paymentTelemetry";
import {
  deliverPostHogEvent,
  newDeliveryId,
  scheduleCaptureRetry,
} from "./model/posthogCapture";

// Revenue is the one signal worth surfacing when it cannot be delivered, so
// payment capture keeps the longest budget and throws once it is spent.
const MAX_PAYMENT_ATTEMPTS = 5;
// A save is already committed by the time this runs; a lost event costs the
// funnel one row, so it retries briefly and then warns.
const MAX_SAVE_ATTEMPTS = 3;
// The notification is already out by the time this runs, so a lost event costs
// the funnel one row and nothing else. Same budget as a save.
const MAX_NOTIFICATION_ATTEMPTS = 3;

export const capturePayment = internalAction({
  args: {
    payment: paymentTelemetryValidator,
    attempt: v.optional(v.number()),
    deliveryId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const deliveryId = args.deliveryId ?? newDeliveryId();
    const { payment } = args;
    const delivery = await deliverPostHogEvent({
      event: payment.event,
      distinctId: payment.userId,
      deliveryId,
      timestamp: payment.timestamp,
      properties: {
        $process_person_profile: false,
        // Production keeps the store's own environment so sandbox purchases
        // stay separable there; every other deployment is development.
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
    });
    if (delivery.status === "delivered") return null;
    if (delivery.status === "rejected") {
      throw new Error(`Payment analytics HTTP ${delivery.httpStatus}`);
    }
    // A missing token is retried too: the deployment may still be mid-setup,
    // and the event is worth holding onto until it is.
    const attempt = args.attempt ?? 0;
    const retried = await scheduleCaptureRetry(
      attempt,
      MAX_PAYMENT_ATTEMPTS,
      (delayMs, nextAttempt) =>
        ctx.scheduler.runAfter(delayMs, internal.analytics.capturePayment, {
          ...args,
          deliveryId,
          attempt: nextAttempt,
        }),
    );
    if (!retried) {
      throw delivery.status === "unconfigured"
        ? new Error("Payment analytics is not configured")
        : (delivery.error ??
            new Error(`Payment analytics HTTP ${delivery.httpStatus}`));
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
    const eventId = args.eventId ?? newDeliveryId();
    const delivery = await deliverPostHogEvent({
      event: "item_saved",
      distinctId: args.userId,
      deliveryId: eventId,
      timestamp: args.savedAt,
      properties: {
        $process_person_profile: false,
        item_id: args.itemId,
        item_type: args.itemType,
        saved_at: args.savedAt,
        save_session_id: args.sessionId,
        photo_count: args.photoCount,
        stored_bytes: args.storedBytes,
        analytics_version: 1,
      },
    });
    if (delivery.status === "delivered") return null;
    if (delivery.status === "rejected") {
      logEvent("warn", "save_telemetry_rejected", {
        status: delivery.httpStatus,
      });
      return null;
    }
    // A delivery failure cannot affect the already committed save.
    const attempt = args.attempt ?? 0;
    const retried = await scheduleCaptureRetry(
      attempt,
      MAX_SAVE_ATTEMPTS,
      (delayMs, nextAttempt) =>
        ctx.scheduler.runAfter(delayMs, internal.analytics.captureSave, {
          ...args,
          attempt: nextAttempt,
          eventId,
        }),
    );
    if (!retried) {
      logEvent("warn", "save_telemetry_delivery_failed", {
        attempts: attempt + 1,
      });
    }
    return null;
  },
});

export const captureNotification = internalAction({
  args: {
    userId: v.string(),
    digestId: v.id("weeklyDigests"),
    kind: v.string(),
    itemCount: v.number(),
    /** Provider acceptance, not a device read. Expo reports that APNs or FCM
     * took the message; nothing here knows whether it was shown or seen. */
    delivered: v.boolean(),
    sentAt: v.number(),
    attempt: v.optional(v.number()),
    eventId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!env.POSTHOG_PROJECT_TOKEN) return null;
    const eventId = args.eventId ?? newDeliveryId();
    const delivery = await deliverPostHogEvent({
      event: "notification_sent",
      distinctId: args.userId,
      deliveryId: eventId,
      timestamp: args.sentAt,
      properties: {
        $process_person_profile: false,
        // The digest id is also the deep-link target, so an open recorded by
        // the client joins to this row without a second identifier.
        notification_id: args.digestId,
        notification_kind: args.kind,
        item_count: args.itemCount,
        delivered: args.delivered,
        analytics_version: 1,
      },
    });
    if (delivery.status === "delivered") return null;
    if (delivery.status === "rejected") {
      logEvent("warn", "notification_telemetry_rejected", {
        status: delivery.httpStatus,
      });
      return null;
    }
    const attempt = args.attempt ?? 0;
    const retried = await scheduleCaptureRetry(
      attempt,
      MAX_NOTIFICATION_ATTEMPTS,
      (delayMs, nextAttempt) =>
        ctx.scheduler.runAfter(
          delayMs,
          internal.analytics.captureNotification,
          {
            ...args,
            attempt: nextAttempt,
            eventId,
          },
        ),
    );
    if (!retried) {
      logEvent("warn", "notification_telemetry_delivery_failed", {
        attempts: attempt + 1,
      });
    }
    return null;
  },
});
