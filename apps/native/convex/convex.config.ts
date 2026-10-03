import { defineApp } from "convex/server";
import { v } from "convex/values";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";

const app = defineApp({
  env: {
    AUTH_ENABLE_ANONYMOUS: v.optional(v.string()),
    GOOGLE_GENERATIVE_AI_API_KEY: v.string(),
    POSTHOG_PROJECT_TOKEN: v.optional(v.string()),
    POSTHOG_HOST: v.optional(v.string()),
    OBSERVABILITY_ENV: v.optional(v.string()),
    REVENUECAT_WEBHOOK_SECRET: v.optional(v.string()),
    REVENUECAT_API_KEY: v.optional(v.string()),
    REVENUECAT_ENTITLEMENT_ID: v.optional(v.string()),
    RESEND_API_KEY: v.optional(v.string()),
    RESEND_SEGMENT_ID: v.optional(v.string()),
    RESEND_ANDROID_SEGMENT_ID: v.optional(v.string()),
    RESEND_TOPIC_ID: v.optional(v.string()),
    // Support-inbox projection for in-app feedback (convex/feedback.ts). The
    // destination is the operator's inbox; the sender must be a Resend-verified
    // address. Without all three (plus RESEND_API_KEY) submissions persist but
    // stay `unconfigured` until they are set.
    RESEND_FEEDBACK_INBOX_EMAIL: v.optional(v.string()),
    RESEND_FEEDBACK_FROM_EMAIL: v.optional(v.string()),
    // Save reminders (convex/notifications.ts) send only while this is "true".
    // Unset, a deploy never starts them; set back to anything else, queued
    // reminders stop at their next attempt, with no deploy.
    SAVE_REMINDERS_ENABLED: v.optional(v.string()),
    SERPAPI_KEY: v.optional(v.string()),
    // Shared with the marketing site's server; authenticates POST /waitlist/join.
    WAITLIST_SHARED_SECRET: v.optional(v.string()),
  },
});
app.use(rateLimiter);

export default app;
