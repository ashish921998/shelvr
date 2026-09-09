import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { paymentTelemetryValidator } from "./model/paymentTelemetry";
import { v } from "convex/values";

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
