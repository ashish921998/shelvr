// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import {
  ANDROID_CONSENT_TEXT,
  ANDROID_CONSENT_VERSION,
  CONSENT_TEXT,
  CONSENT_VERSION,
  RESEND_MAX_ATTEMPTS,
} from "./waitlist";
import { newConvexTest } from "./test.setup";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("waitlist.join", () => {
  it("persists a signup when Resend is not configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const t = newConvexTest();

    const result = await t.action(api.waitlist.join, {
      email: " Test@Example.com ",
      source: "hero",
    });

    expect(result).toEqual({ saved: true, emailProviderSynced: false });
    await t.run(async (ctx) => {
      const signup = await ctx.db
        .query("waitlistSignups")
        .withIndex("by_email_and_product", (q) =>
          q.eq("email", "test@example.com").eq("product", "shelvr"),
        )
        .unique();
      expect(signup).toMatchObject({
        email: "test@example.com",
        product: "shelvr",
        source: "hero",
        consentVersion: CONSENT_VERSION,
        consentText: CONSENT_TEXT,
        resendStatus: "unconfigured",
      });
    });
  });

  it("updates one existing row instead of duplicating the email", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const t = newConvexTest();

    await t.action(api.waitlist.join, {
      email: "same@example.com",
      source: "hero",
    });
    await t.action(api.waitlist.join, {
      email: "same@example.com",
      source: "footer",
    });

    await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("waitlistSignups")
        .withIndex("by_email_and_product", (q) =>
          q.eq("email", "same@example.com").eq("product", "shelvr"),
        )
        .take(2);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.source).toBe("footer");
      expect(rows[0]?.lastSubmittedAt).toBeGreaterThanOrEqual(
        rows[0]?.firstSubmittedAt ?? 0,
      );
    });
  });

  it("stores Android interest separately with Android-specific consent", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const t = newConvexTest();

    await t.action(api.waitlist.join, {
      email: "android@example.com",
      source: "hero",
    });
    await t.action(api.waitlist.join, {
      email: "android@example.com",
      product: "shelvr-android",
      source: "footer",
    });

    await t.run(async (ctx) => {
      const generic = await ctx.db
        .query("waitlistSignups")
        .withIndex("by_email_and_product", (q) =>
          q.eq("email", "android@example.com").eq("product", "shelvr"),
        )
        .unique();
      const android = await ctx.db
        .query("waitlistSignups")
        .withIndex("by_email_and_product", (q) =>
          q.eq("email", "android@example.com").eq("product", "shelvr-android"),
        )
        .unique();

      expect(generic).not.toBeNull();
      expect(android).toMatchObject({
        product: "shelvr-android",
        source: "footer",
        consentVersion: ANDROID_CONSENT_VERSION,
        consentText: ANDROID_CONSENT_TEXT,
      });
    });
  });

  it("keeps the original consent trail on resubmit", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const t = newConvexTest();

    await t.action(api.waitlist.join, {
      email: "consent@example.com",
      source: "hero",
    });
    const first = await t.run(async (ctx) =>
      ctx.db
        .query("waitlistSignups")
        .withIndex("by_email_and_product", (q) =>
          q.eq("email", "consent@example.com").eq("product", "shelvr"),
        )
        .unique(),
    );
    expect(first).not.toBeNull();

    await t.action(api.waitlist.join, {
      email: "consent@example.com",
      source: "preview",
    });

    const second = await t.run(async (ctx) =>
      ctx.db
        .query("waitlistSignups")
        .withIndex("by_email_and_product", (q) =>
          q.eq("email", "consent@example.com").eq("product", "shelvr"),
        )
        .unique(),
    );
    expect(second).toMatchObject({
      source: "preview",
      consentVersion: first?.consentVersion,
      consentText: first?.consentText,
      consentedAt: first?.consentedAt,
      firstSubmittedAt: first?.firstSubmittedAt,
    });
  });

  it("rejects an invalid email before writing a row", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const t = newConvexTest();

    await expect(
      t.action(api.waitlist.join, {
        email: "not-an-email",
        source: "hero",
      }),
    ).rejects.toThrow(/valid email/i);

    await t.run(async (ctx) => {
      const rows = await ctx.db.query("waitlistSignups").take(1);
      expect(rows).toHaveLength(0);
    });
  });

  it("rate-limits repeated joins for the same email", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const t = newConvexTest();

    for (let i = 0; i < 3; i++) {
      await t.action(api.waitlist.join, {
        email: "limited@example.com",
        source: "hero",
      });
    }

    await expect(
      t.action(api.waitlist.join, {
        email: "limited@example.com",
        source: "hero",
      }),
    ).rejects.toThrow();
  });
});

describe("waitlist.retryFailedResendSyncs", () => {
  it("retries unsynced rows and leaves them unconfigured without a Resend key", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const t = newConvexTest();
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("waitlistSignups", {
        email: "retry@example.com",
        product: "shelvr",
        source: "hero",
        consentVersion: CONSENT_VERSION,
        consentText: CONSENT_TEXT,
        consentedAt: now,
        firstSubmittedAt: now,
        lastSubmittedAt: now,
        resendStatus: "failed",
        resendError: "previous outage",
        resendAttempts: 0,
      });
    });

    await t.action(internal.waitlist.retryFailedResendSyncs, {});

    await t.run(async (ctx) => {
      const signup = await ctx.db
        .query("waitlistSignups")
        .withIndex("by_email_and_product", (q) =>
          q.eq("email", "retry@example.com").eq("product", "shelvr"),
        )
        .unique();
      expect(signup?.resendStatus).toBe("unconfigured");
      // Unconfigured is an operator condition, not a row failure: the last
      // real error must survive the status patch.
      expect(signup?.resendError).toBe("previous outage");
    });
  });

  it("leaves Android rows unconfigured until their Resend segment exists", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_ANDROID_SEGMENT_ID", "");
    const t = newConvexTest();
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("waitlistSignups", {
        email: "android-retry@example.com",
        product: "shelvr-android",
        source: "hero",
        consentVersion: ANDROID_CONSENT_VERSION,
        consentText: ANDROID_CONSENT_TEXT,
        consentedAt: now,
        firstSubmittedAt: now,
        lastSubmittedAt: now,
        resendStatus: "pending",
        resendAttempts: 0,
      });
    });

    await t.action(internal.waitlist.retryFailedResendSyncs, {});

    await t.run(async (ctx) => {
      const signup = await ctx.db
        .query("waitlistSignups")
        .withIndex("by_email_and_product", (q) =>
          q
            .eq("email", "android-retry@example.com")
            .eq("product", "shelvr-android"),
        )
        .unique();
      expect(signup?.resendStatus).toBe("unconfigured");
      expect(signup?.resendAttempts).toBe(0);
    });
  });

  it("skips attempt-capped rows without starving retryable ones", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const t = newConvexTest();
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("waitlistSignups", {
        email: "capped@example.com",
        product: "shelvr",
        source: "hero",
        consentVersion: CONSENT_VERSION,
        consentText: CONSENT_TEXT,
        consentedAt: now,
        firstSubmittedAt: now,
        lastSubmittedAt: now,
        resendStatus: "failed",
        resendError: "permanent failure",
        resendAttempts: RESEND_MAX_ATTEMPTS,
      });
      await ctx.db.insert("waitlistSignups", {
        email: "retryable@example.com",
        product: "shelvr",
        source: "hero",
        consentVersion: CONSENT_VERSION,
        consentText: CONSENT_TEXT,
        consentedAt: now,
        firstSubmittedAt: now,
        lastSubmittedAt: now,
        resendStatus: "failed",
        resendError: "transient failure",
        resendAttempts: 0,
      });
    });

    await t.action(internal.waitlist.retryFailedResendSyncs, {});

    await t.run(async (ctx) => {
      const byEmail = async (email: string) =>
        await ctx.db
          .query("waitlistSignups")
          .withIndex("by_email_and_product", (q) =>
            q.eq("email", email).eq("product", "shelvr"),
          )
          .unique();
      const capped = await byEmail("capped@example.com");
      expect(capped?.resendStatus).toBe("failed");
      expect(capped?.resendError).toBe("permanent failure");
      expect(capped?.resendAttempts).toBe(RESEND_MAX_ATTEMPTS);

      // The capped row must not crowd the retryable one out of the window.
      const retryable = await byEmail("retryable@example.com");
      expect(retryable?.resendStatus).toBe("unconfigured");
    });
  });
});
