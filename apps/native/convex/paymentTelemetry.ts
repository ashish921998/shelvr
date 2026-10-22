import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { liveOwner } from "./model/auth";
import { paymentTelemetryValidator } from "./model/paymentTelemetry";
import { v } from "convex/values";

export const RECEIPT_RETENTION_MS = 6 * 30 * 24 * 60 * 60 * 1000;

const PURGE_PAGE = 100;

export const enqueue = internalMutation({
  args: { payment: paymentTelemetryValidator },
  returns: v.null(),
  handler: async (ctx, { payment }) => {
    if ((await liveOwner(ctx, payment.userId)) === null) return null;
    const duplicate = await ctx.db
      .query("paymentAnalyticsReceipts")
      .withIndex("by_event", (q) => q.eq("eventId", payment.eventId))
      .unique();
    if (duplicate) return null;
    await ctx.db.insert("paymentAnalyticsReceipts", {
      eventId: payment.eventId,
    });
    await ctx.scheduler.runAfter(0, internal.analytics.capturePayment, {
      payment,
    });
    return null;
  },
});

export const purgeExpiredReceipts = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - RECEIPT_RETENTION_MS;
    const page = await ctx.db
      .query("paymentAnalyticsReceipts")
      .order("asc")
      .take(PURGE_PAGE);
    let purged = 0;
    for (const row of page) {
      if (row._creationTime >= cutoff) break;
      await ctx.db.delete(row._id);
      purged++;
    }
    if (purged === PURGE_PAGE) {
      await ctx.scheduler.runAfter(
        0,
        internal.paymentTelemetry.purgeExpiredReceipts,
        {},
      );
    }
    return null;
  },
});
