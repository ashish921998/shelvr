"use node";

import { v } from "convex/values";
import { env, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  deliverPostHogEvent,
  newDeliveryId,
  scheduleCaptureRetry,
} from "./model/posthogCapture";

// A signup is the top of every funnel, so it is worth holding onto for as long
// as payment capture does before the failure is surfaced.
const MAX_ACCOUNT_ATTEMPTS = 5;

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
    const deliveryId = args.deliveryId ?? newDeliveryId();
    const delivery = await deliverPostHogEvent({
      event: "account_created",
      distinctId: args.userId,
      deliveryId,
      timestamp: args.createdAt,
      properties: {
        $geoip_disable: true,
        analytics_version: 1,
        account_created_at: args.createdAt,
      },
    });
    if (delivery.status === "delivered") return null;
    if (delivery.status === "rejected") {
      throw new Error(`Account analytics HTTP ${delivery.httpStatus}`);
    }
    const attempt = args.attempt ?? 0;
    const retried = await scheduleCaptureRetry(
      attempt,
      MAX_ACCOUNT_ATTEMPTS,
      (delayMs, nextAttempt) =>
        ctx.scheduler.runAfter(delayMs, internal.accountTelemetry.capture, {
          ...args,
          attempt: nextAttempt,
          deliveryId,
        }),
    );
    if (!retried) {
      throw delivery.status === "retryable"
        ? (delivery.error ??
            new Error(`Account analytics HTTP ${delivery.httpStatus}`))
        : new Error("Account analytics is not configured");
    }
    return null;
  },
});
