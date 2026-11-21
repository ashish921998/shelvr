import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    AUTH_RESEND_KEY: v.optional(v.string()),
    REVIEW_EMAIL_FROM: v.optional(v.string()),
    REVIEW_STAFF_EMAILS: v.optional(v.string()),
    R2_ACCOUNT_ID: v.optional(v.string()),
    R2_ACCESS_KEY_ID: v.optional(v.string()),
    R2_SECRET_ACCESS_KEY: v.optional(v.string()),
    R2_BUCKET: v.optional(v.string()),
    SITE_URL: v.optional(v.string()),
  },
});

export default app;
