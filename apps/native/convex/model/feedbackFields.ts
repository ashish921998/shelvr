import { v } from "convex/values";

/** Where the user opened the feedback form. Bounded on purpose: this value
 * is delivered to the support inbox and captured in analytics, so it can
 * never become a free-text channel. */
export const feedbackSurfaceValidator = v.union(
  v.literal("home"),
  v.literal("profile"),
);

/** Delivery state of a feedback submission row. `unconfigured` means the
 * support-inbox env vars are missing — an operator condition, not a row
 * failure; the retry cron picks the row up once they are set. */
export const feedbackDeliveryStatusValidator = v.union(
  v.literal("pending"),
  v.literal("unconfigured"),
  v.literal("delivered"),
  v.literal("failed"),
);
