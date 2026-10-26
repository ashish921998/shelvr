import { defineApp } from "convex/server";
import { v } from "convex/values";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";

const app = defineApp({
  env: {
    APPLE_RETENTION_MESSAGE_ID: v.optional(v.string()),
    APPLE_RETENTION_OFFERS: v.optional(v.string()),
    APPLE_IAP_PRIVATE_KEY: v.optional(v.string()),
    APPLE_IAP_KEY_ID: v.optional(v.string()),
    APPLE_IAP_ISSUER_ID: v.optional(v.string()),
    APPLE_MAPS_PRIVATE_KEY: v.optional(v.string()),
    APPLE_MAPS_KEY_ID: v.optional(v.string()),
    APPLE_MAPS_TEAM_ID: v.optional(v.string()),
    APPLE_REVOKE_PRIVATE_KEY: v.optional(v.string()),
    APPLE_REVOKE_KEY_ID: v.optional(v.string()),
    APPLE_REVOKE_TEAM_ID: v.optional(v.string()),
    AUTH_ENABLE_ANONYMOUS: v.optional(v.string()),
    E2E_FAKE_AI: v.optional(v.string()),
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
    RESEND_FEEDBACK_INBOX_EMAIL: v.optional(v.string()),
    RESEND_FEEDBACK_FROM_EMAIL: v.optional(v.string()),
    SAVE_REMINDERS_ENABLED: v.optional(v.string()),
    SERPAPI_KEY: v.optional(v.string()),
    YOUTUBE_API_KEY: v.optional(v.string()),
    TREG_API_KEY: v.optional(v.string()),
    VIDEO_TRANSCRIPTS_ENABLED: v.optional(v.string()),
    WAITLIST_SHARED_SECRET: v.optional(v.string()),
  },
});
app.use(rateLimiter);

export default app;
