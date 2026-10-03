import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { paymentTelemetryValidator } from "./model/paymentTelemetry";
import { v } from "convex/values";

/** How long webhook dedupe rows are kept. RevenueCat retries deliveries for
 * days, not months, so a purged id cannot cause double counting. */
export const RECEIPT_RETENTION_MS = 6 * 30 * 24 * 60 * 60 * 1000;

const PURGE_PAGE = 100;

export const enqueue = internalMutation({
  args: { payment: paymentTelemetryValidator },
  returns: v.null(),
  handler: async (ctx, { payment }) => {
    const owner = ctx.db.normalizeId("users", payment.userId);
    if (!owner || !(await ctx.db.get(owner))) return null;
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

/** Drops dedupe rows past the retention window so the ledger does not grow
 * forever. Documents scan oldest-first by creation time, so the sweep stops
 * at the first live row and chains itself only after a full expired page. */
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
