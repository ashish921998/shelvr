import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    AUTH_RESEND_KEY: v.optional(v.string()),
    REVIEW_EMAIL_FROM: v.optional(v.string()),
    REVIEW_STAFF_EMAILS: v.optional(v.string()),
    MUX_TOKEN_ID: v.optional(v.string()),
    MUX_TOKEN_SECRET: v.optional(v.string()),
    MUX_SIGNING_KEY_ID: v.optional(v.string()),
    MUX_SIGNING_PRIVATE_KEY: v.optional(v.string()),
    MUX_WEBHOOK_SECRET: v.optional(v.string()),
    SITE_URL: v.optional(v.string()),
  },
});

export default app;
