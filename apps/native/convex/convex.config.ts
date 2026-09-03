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
    RESEND_API_KEY: v.optional(v.string()),
    RESEND_SEGMENT_ID: v.optional(v.string()),
    RESEND_ANDROID_SEGMENT_ID: v.optional(v.string()),
    RESEND_TOPIC_ID: v.optional(v.string()),
    SERPAPI_KEY: v.optional(v.string()),
  },
});
app.use(rateLimiter);

export default app;
