// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { anyApi } from "convex/server";

import { internal } from "./_generated/api";
import {
  ANDROID_CONSENT_TEXT,
  ANDROID_CONSENT_VERSION,
  CONSENT_TEXT,
  CONSENT_VERSION,
  RESEND_MAX_ATTEMPTS,
  UNKNOWN_IP_LIMITER_KEY,
  classifyResendError,
  formatResendError,
  normalizeIp,
} from "./waitlist";
import { WAITLIST_CLIENT_IP_HEADER, WAITLIST_SECRET_HEADER } from "./http";
import { newConvexTest } from "./test.setup";

const SECRET = "waitlist-test-secret";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type JoinBody = {
  email: string;
  product?: "shelvr" | "shelvr-android";
  source?: "hero" | "preview" | "footer" | "unknown";
};

/**
 * POST to the waitlist HTTP action the way the Next.js route does: shared
 * secret header plus the visitor IP in its dedicated header.
 */
function join(
  t: ReturnType<typeof newConvexTest>,
  body: JoinBody,
  options: { secret?: string; ip?: string } = {},
) {
  const secret = options.secret ?? SECRET;
  return t.fetch("/waitlist/join", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { [WAITLIST_SECRET_HEADER]: secret } : {}),
      ...(options.ip ? { [WAITLIST_CLIENT_IP_HEADER]: options.ip } : {}),
    },
    body: JSON.stringify(body),
  });
}

function setup(envOverrides: Record<string, string> = {}) {
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("WAITLIST_SHARED_SECRET", SECRET);
  for (const [key, value] of Object.entries(envOverrides)) {
    vi.stubEnv(key, value);
  }
  return newConvexTest();
}

describe("POST /waitlist/join", () => {
  it("accepts production records created before retry counts were added", async () => {
    const t = setup();
    const id = await t.run(async (ctx) => ctx.db.insert("waitlistSignups", {
      email: "legacy@example.com", product: "shelvr", source: "hero",
      consentVersion: CONSENT_VERSION, consentText: CONSENT_TEXT,
      consentedAt: 1, firstSubmittedAt: 1, lastSubmittedAt: 1,
      resendStatus: "unconfigured",
    }));
    expect(await t.query(internal.waitlist.listSignupsNeedingResendSync, {})).toContainEqual({
      id, email: "legacy@example.com", product: "shelvr", resendAttempts: 0,
    });
    expect(await t.mutation(internal.waitlist.upsertSignup, {
      email: "legacy@example.com", product: "shelvr", source: "hero",
    })).toMatchObject({ id, resendAttempts: 0 });
  });

  it("persists a signup when Resend is not configured", async () => {
    const t = setup();

    const response = await join(t, {
      email: " Test@Example.com ",
      source: "hero",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      saved: true,
      emailProviderSynced: false,
    });
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

  it("defaults source to unknown when the caller omits it", async () => {
    const t = setup();
    expect((await join(t, { email: "nosource@example.com" })).status).toBe(200);
    await t.run(async (ctx) => {
      const signup = await ctx.db
        .query("waitlistSignups")
        .withIndex("by_email_and_product", (q) =>
          q.eq("email", "nosource@example.com").eq("product", "shelvr"),
        )
        .unique();
      expect(signup?.source).toBe("unknown");
    });
  });

  it("updates one existing row instead of duplicating the email", async () => {
    const t = setup();

    await join(t, { email: "same@example.com", source: "hero" });
    await join(t, { email: "same@example.com", source: "footer" });

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
    const t = setup();

    await join(t, { email: "android@example.com", source: "hero" });
    await join(t, {
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
    const t = setup();

    await join(t, { email: "consent@example.com", source: "hero" });
    const first = await t.run(async (ctx) =>
      ctx.db
        .query("waitlistSignups")
        .withIndex("by_email_and_product", (q) =>
          q.eq("email", "consent@example.com").eq("product", "shelvr"),
        )
        .unique(),
    );
    expect(first).not.toBeNull();

    await join(t, { email: "consent@example.com", source: "preview" });

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

  it("rejects an invalid email with 400 before writing a row", async () => {
    const t = setup();

    const response = await join(t, { email: "not-an-email", source: "hero" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: "Enter a valid email address.",
    });

    await t.run(async (ctx) => {
      const rows = await ctx.db.query("waitlistSignups").take(1);
      expect(rows).toHaveLength(0);
    });
  });

  it("rejects malformed bodies and unknown enum values with 400", async () => {
    const t = setup();
    const raw = (body: string) =>
      t.fetch("/waitlist/join", {
        method: "POST",
        headers: { [WAITLIST_SECRET_HEADER]: SECRET },
        body,
      });

    expect((await raw("{not json")).status).toBe(400);
    expect((await raw("[]")).status).toBe(400);
    expect((await raw(JSON.stringify({ email: 42 }))).status).toBe(400);
    expect(
      (await raw(JSON.stringify({ email: "a@b.co", product: "windows" })))
        .status,
    ).toBe(400);
    expect(
      (await raw(JSON.stringify({ email: "a@b.co", source: "popup" }))).status,
    ).toBe(400);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("waitlistSignups").take(1)).toHaveLength(0);
    });
  });

  it("rate-limits repeated joins for the same email with 429", async () => {
    const t = setup();

    for (let i = 0; i < 3; i++) {
      expect(
        (await join(t, { email: "limited@example.com", source: "hero" })).status,
      ).toBe(200);
    }

    const limited = await join(t, {
      email: "limited@example.com",
      source: "hero",
    });
    expect(limited.status).toBe(429);
  });

  it("rate-limits one client IP that rotates email addresses", async () => {
    const t = setup();
    const ip = "203.0.113.7";

    // waitlistJoinIp capacity is 8 bursts; each address is distinct so the
    // email bucket never trips.
    for (let i = 0; i < 8; i++) {
      const response = await join(
        t,
        { email: `rotate-${i}@example.com`, source: "hero" },
        { ip },
      );
      expect(response.status).toBe(200);
    }
    const ninth = await join(
      t,
      { email: "rotate-8@example.com", source: "hero" },
      { ip },
    );
    expect(ninth.status).toBe(429);

    // A different visitor is unaffected.
    const other = await join(
      t,
      { email: "other@example.com", source: "hero" },
      { ip: "198.51.100.9" },
    );
    expect(other.status).toBe(200);
  });

  it("ignores an implausible client IP instead of using it as a limiter key", async () => {
    const t = setup();
    const response = await join(
      t,
      { email: "garbage-ip@example.com", source: "hero" },
      { ip: "not an ip; drop table" },
    );
    expect(response.status).toBe(200);
  });

  it("counts requests without a usable IP against one shared bucket", async () => {
    const t = setup();
    // Distinct emails so the per-email bucket never trips. Two requests carry
    // no IP header and six carry a malformed one; all eight must land in the
    // same bucket, whose capacity is 8, so the ninth is refused.
    for (let i = 0; i < 2; i++) {
      const response = await join(t, {
        email: `anon-${i}@example.com`,
        source: "hero",
      });
      expect(response.status).toBe(200);
    }
    for (let i = 0; i < 6; i++) {
      const response = await join(
        t,
        { email: `anon-garbage-${i}@example.com`, source: "hero" },
        { ip: "::::" },
      );
      expect(response.status).toBe(200);
    }
    const ninth = await join(t, { email: "anon-9@example.com", source: "hero" });
    expect(ninth.status).toBe(429);

    // A request with a real IP is unaffected by the shared bucket.
    const known = await join(
      t,
      { email: "known@example.com", source: "hero" },
      { ip: "198.51.100.9" },
    );
    expect(known.status).toBe(200);
  });

  it("applies the shared bucket inside upsertSignup, not only at the HTTP edge", async () => {
    const t = setup();
    // A missing IP and every malformed spelling must land in the same bucket
    // even when the mutation is called directly with the raw value.
    const garbage = [undefined, "::::", "aaaa:", "not an ip", "999.1.1.1", "gggg::1", "1.2.3.4.5", ""];
    const direct = (i: number, ip: string | undefined) =>
      t.mutation(internal.waitlist.upsertSignup, {
        email: `direct-${i}@example.com`,
        product: "shelvr",
        source: "hero",
        ip,
      });
    for (let i = 0; i < 8; i++) {
      await direct(i, garbage[i]);
    }
    await expect(direct(8, "::::")).rejects.toThrow();
    expect(UNKNOWN_IP_LIMITER_KEY).toBe("unknown");
    // A real address is a different bucket and is not affected.
    await expect(direct(9, "198.51.100.9")).resolves.toMatchObject({
      resendStatus: "pending",
    });
  });
});

describe("normalizeIp", () => {
  it("rejects malformed addresses that only look like IPv6", () => {
    expect(normalizeIp("::::")).toBeUndefined();
    expect(normalizeIp("aaaa:")).toBeUndefined();
    expect(normalizeIp("not an ip; drop table")).toBeUndefined();
    expect(normalizeIp("")).toBeUndefined();
    expect(normalizeIp(undefined)).toBeUndefined();
  });

  it("normalizes equivalent IPv6 spellings to one key", () => {
    const short = normalizeIp("2001:db8::1");
    expect(short).toBeDefined();
    expect(normalizeIp("2001:0db8:0000::0001")).toBe(short);
    expect(normalizeIp(" 2001:DB8::1 ")).toBe(short);
  });

  it("unwraps IPv4-mapped IPv6 to the IPv4 key", () => {
    expect(normalizeIp("::ffff:1.2.3.4")).toBe("1.2.3.4");
    expect(normalizeIp("1.2.3.4")).toBe("1.2.3.4");
  });
});

describe("POST /waitlist/join authentication", () => {
  it("rejects a missing or wrong shared secret with 401 and writes nothing", async () => {
    const t = setup();

    const missing = await join(
      t,
      { email: "anon@example.com", source: "hero" },
      { secret: "" },
    );
    expect(missing.status).toBe(401);

    const wrong = await join(
      t,
      { email: "anon@example.com", source: "hero" },
      { secret: `${SECRET}x` },
    );
    expect(wrong.status).toBe(401);

    await t.run(async (ctx) => {
      expect(await ctx.db.query("waitlistSignups").take(1)).toHaveLength(0);
    });
  });

  it("fails closed with 500 when the deployment has no shared secret", async () => {
    const t = setup({ WAITLIST_SHARED_SECRET: "" });
    const response = await join(t, { email: "anon@example.com", source: "hero" });
    expect(response.status).toBe(500);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("waitlistSignups").take(1)).toHaveLength(0);
    });
  });

  it("no longer exposes waitlist:join as a public action", async () => {
    const t = setup();
    // `anyApi` builds an untyped reference, the way an arbitrary Convex client
    // would call the old endpoint. The function must not exist.
    await expect(
      t.action(anyApi.waitlist.join, {
        email: "direct@example.com",
        source: "hero",
      }),
    ).rejects.toThrow(/no such export/);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("waitlistSignups").take(1)).toHaveLength(0);
    });
  });
});

describe("Resend failure persistence", () => {
  it("stores a category and status, never the provider message or the address", async () => {
    const email = "leaky@example.com";
    const t = setup({
      RESEND_API_KEY: "re_test_key",
      RESEND_SEGMENT_ID: "seg_1",
    });
    // Resend echoes the address in its validation errors.
    const providerBody = JSON.stringify({
      statusCode: 429,
      name: "rate_limit_exceeded",
      message: `Too many requests for ${email}`,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(providerBody, {
          status: 429,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await join(t, { email, source: "hero" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      saved: true,
      emailProviderSynced: false,
    });

    await t.run(async (ctx) => {
      const signup = await ctx.db
        .query("waitlistSignups")
        .withIndex("by_email_and_product", (q) =>
          q.eq("email", email).eq("product", "shelvr"),
        )
        .unique();
      expect(signup).toMatchObject({
        resendStatus: "failed",
        resendError: "rate_limited:429",
        resendAttempts: 1,
      });
      expect(signup?.resendError).not.toContain(email);
      expect(signup?.resendError).not.toContain("Too many requests");
    });

    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).toContain("rate_limited");
    expect(logged).not.toContain(email);
    expect(logged).not.toContain("Too many requests");
  });

  it("records a bare category when Resend never answers", async () => {
    const t = setup({ RESEND_API_KEY: "re_test_key" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(
        new DOMException("The operation timed out.", "TimeoutError"),
      ),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    await join(t, { email: "slow@example.com", source: "hero" });

    await t.run(async (ctx) => {
      const signup = await ctx.db
        .query("waitlistSignups")
        .withIndex("by_email_and_product", (q) =>
          q.eq("email", "slow@example.com").eq("product", "shelvr"),
        )
        .unique();
      expect(signup?.resendError).toBe("timeout");
    });
  });

  it("classifies provider statuses into fixed categories", () => {
    expect(classifyResendError(new TypeError("fetch failed"))).toEqual({
      category: "network_error",
      status: undefined,
    });
    expect(
      classifyResendError(new DOMException("aborted", "AbortError")),
    ).toEqual({ category: "timeout", status: undefined });
    expect(classifyResendError("string")).toEqual({
      category: "network_error",
      status: undefined,
    });
    expect(formatResendError("provider_error", 503)).toBe("provider_error:503");
    expect(formatResendError("network_error", undefined)).toBe("network_error");
  });

  it("updateResendStatus rejects free-text error strings", async () => {
    const t = setup();
    const id = await t.run(async (ctx) =>
      ctx.db.insert("waitlistSignups", {
        email: "validator@example.com",
        product: "shelvr",
        source: "hero",
        consentVersion: CONSENT_VERSION,
        consentText: CONSENT_TEXT,
        consentedAt: 1,
        firstSubmittedAt: 1,
        lastSubmittedAt: 1,
        resendStatus: "pending",
        resendAttempts: 0,
      }),
    );
    await expect(
      t.mutation(internal.waitlist.updateResendStatus, {
        id,
        status: "failed",
        // @ts-expect-error the old free-text arg must not be accepted
        error: "Resend said: validator@example.com is invalid",
      }),
    ).rejects.toThrow();
    await expect(
      t.mutation(internal.waitlist.updateResendStatus, {
        id,
        status: "failed",
        // @ts-expect-error categories are a closed set
        errorCategory: "validator@example.com is invalid",
      }),
    ).rejects.toThrow();
  });
});

describe("waitlist.retryFailedResendSyncs", () => {
  it("retries unsynced rows and leaves them unconfigured without a Resend key", async () => {
    const t = setup();
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
        resendError: "provider_error:503",
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
      expect(signup?.resendError).toBe("provider_error:503");
    });
  });

  it("leaves Android rows unconfigured until their Resend segment exists", async () => {
    const t = setup({
      RESEND_API_KEY: "re_test_key",
      RESEND_ANDROID_SEGMENT_ID: "",
    });
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
    const t = setup();
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
        resendError: "invalid_recipient:422",
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
        resendError: "provider_error:502",
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
      expect(capped?.resendError).toBe("invalid_recipient:422");
      expect(capped?.resendAttempts).toBe(RESEND_MAX_ATTEMPTS);

      // The capped row must not crowd the retryable one out of the window.
      const retryable = await byEmail("retryable@example.com");
      expect(retryable?.resendStatus).toBe("unconfigured");
    });
  });
});
