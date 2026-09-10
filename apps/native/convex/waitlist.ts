import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
  env,
  type ActionCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import ipaddr from "ipaddr.js";
import { rateLimiter } from "./model/rateLimiter";

export const CONSENT_VERSION = "shelvr-waitlist-v1";
export const CONSENT_TEXT =
  "Notify me when Shelvr launches. One launch email; no newsletter.";
export const ANDROID_CONSENT_VERSION = "shelvr-android-waitlist-v1";
export const ANDROID_CONSENT_TEXT =
  "Notify me when Shelvr launches on Android. One launch email; no newsletter.";

const productValidator = v.union(
  v.literal("shelvr"),
  v.literal("shelvr-android"),
);
type WaitlistProduct = Infer<typeof productValidator>;

const sourceValidator = v.union(
  v.literal("hero"),
  v.literal("preview"),
  v.literal("footer"),
  v.literal("unknown"),
);
type WaitlistSource = Infer<typeof sourceValidator>;

const resendStatusValidator = v.union(
  v.literal("pending"),
  v.literal("synced"),
  v.literal("failed"),
  v.literal("unconfigured"),
);

// Why a Resend sync failed, without the provider's message. Resend echoes the
// submitted address inside its error text, so the message is never stored or
// logged; the category plus HTTP status is enough to triage an outage.
const resendErrorCategoryValidator = v.union(
  v.literal("rate_limited"),
  v.literal("invalid_recipient"),
  v.literal("auth_error"),
  v.literal("provider_error"),
  v.literal("timeout"),
  v.literal("network_error"),
);
export type ResendErrorCategory = Infer<typeof resendErrorCategoryValidator>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_IP_LENGTH = 64;
const RESEND_RETRY_SCAN = 100;
// A row that fails this many Resend syncs stays `failed` for manual
// inspection instead of occupying the retry cron window forever.
export const RESEND_MAX_ATTEMPTS = 10;

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return emailPattern.test(email) && email.length <= 254;
}

export function isWaitlistProduct(value: unknown): value is WaitlistProduct {
  return value === "shelvr" || value === "shelvr-android";
}

export function isWaitlistSource(value: unknown): value is WaitlistSource {
  return (
    value === "hero" ||
    value === "preview" ||
    value === "footer" ||
    value === "unknown"
  );
}

// The web route derives the IP from proxy headers it does not fully control,
// so anything that does not parse as an IP address is treated as absent rather
// than persisted as an attacker-chosen limiter key. The result is the canonical
// form, so `2001:db8::1` and `2001:0db8:0000::0001` share one bucket and an
// IPv4-mapped IPv6 address counts against the plain IPv4 key.
export function normalizeIp(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const ip = value.trim().slice(0, MAX_IP_LENGTH);
  if (!ipaddr.isValid(ip)) return undefined;
  const parsed = ipaddr.parse(ip);
  if (parsed.kind() === "ipv6") {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) {
      return v6.toIPv4Address().toNormalizedString();
    }
  }
  return parsed.toNormalizedString();
}

/**
 * Limiter key for a request without a usable client IP. Every such request
 * shares one bucket, so a caller cannot escape the per-IP limiter by leaving
 * the header off or filling it with garbage.
 */
export const UNKNOWN_IP_LIMITER_KEY = "unknown";

export const upsertSignup = internalMutation({
  args: {
    email: v.string(),
    product: productValidator,
    source: sourceValidator,
    ip: v.optional(v.string()),
  },
  returns: v.object({
    id: v.id("waitlistSignups"),
    resendStatus: resendStatusValidator,
    resendAttempts: v.number(),
  }),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "waitlistJoinGlobal", { throws: true });
    await rateLimiter.limit(ctx, "waitlistJoinIp", {
      key: args.ip ?? UNKNOWN_IP_LIMITER_KEY,
      throws: true,
    });
    await rateLimiter.limit(ctx, "waitlistJoin", {
      key: args.email,
      throws: true,
    });

    const now = Date.now();
    const existing = await ctx.db
      .query("waitlistSignups")
      .withIndex("by_email_and_product", (q) =>
        q.eq("email", args.email).eq("product", args.product),
      )
      .unique();

    if (existing) {
      // Keep the original consent trail. A later submit may update the last
      // seen source, but it must not rewrite what the person first agreed to.
      await ctx.db.patch(existing._id, {
        source: args.source,
        lastSubmittedAt: now,
      });
      return {
        id: existing._id,
        resendStatus: existing.resendStatus,
        resendAttempts: existing.resendAttempts ?? 0,
      };
    }

    const id = await ctx.db.insert("waitlistSignups", {
      email: args.email,
      product: args.product,
      source: args.source,
      consentVersion:
        args.product === "shelvr-android"
          ? ANDROID_CONSENT_VERSION
          : CONSENT_VERSION,
      consentText:
        args.product === "shelvr-android" ? ANDROID_CONSENT_TEXT : CONSENT_TEXT,
      consentedAt: now,
      firstSubmittedAt: now,
      lastSubmittedAt: now,
      resendStatus: "pending",
      resendAttempts: 0,
    });
    return { id, resendStatus: "pending" as const, resendAttempts: 0 };
  },
});

/**
 * Serialize a failure into the `resendError` column. The column predates the
 * category split and is a plain string, so the two parts are joined as
 * `<category>:<status>` (status omitted when the failure never got an HTTP
 * response). Nothing from the provider's response body is included.
 */
export function formatResendError(
  category: ResendErrorCategory,
  status: number | undefined,
): string {
  return status === undefined ? category : `${category}:${status}`;
}

export const updateResendStatus = internalMutation({
  args: {
    id: v.id("waitlistSignups"),
    status: resendStatusValidator,
    contactId: v.optional(v.string()),
    errorCategory: v.optional(resendErrorCategoryValidator),
    errorStatus: v.optional(v.number()),
    attempts: v.optional(v.number()),
    preserveError: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      resendStatus: args.status,
      // A missing contactId must not erase one captured earlier (create can
      // succeed and a later segment/topic call still fail).
      ...(args.contactId === undefined
        ? {}
        : { resendContactId: args.contactId }),
      ...(args.attempts === undefined ? {} : { resendAttempts: args.attempts }),
      // Same for the error: the unconfigured path has nothing new to record
      // and must keep the last real failure visible.
      ...(args.preserveError
        ? {}
        : {
            resendError:
              args.errorCategory === undefined
                ? undefined
                : formatResendError(args.errorCategory, args.errorStatus),
          }),
    });
    return null;
  },
});

// Internal privacy/admin primitive for verified deletion requests and synthetic
// deployment checks. It is intentionally not callable by clients.
export const deleteSignupByEmail = internalMutation({
  args: { email: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    let deleted = false;
    for (const product of ["shelvr", "shelvr-android"] as const) {
      const signup = await ctx.db
        .query("waitlistSignups")
        .withIndex("by_email_and_product", (q) =>
          q.eq("email", email).eq("product", product),
        )
        .unique();
      if (signup) {
        await ctx.db.delete(signup._id);
        deleted = true;
      }
    }
    return deleted;
  },
});

export const listSignupsNeedingResendSync = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      id: v.id("waitlistSignups"),
      email: v.string(),
      product: productValidator,
      resendAttempts: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const statuses = ["failed", "pending", "unconfigured"] as const;
    const out: {
      id: Id<"waitlistSignups">;
      email: string;
      product: WaitlistProduct;
      resendAttempts: number;
    }[] = [];
    for (const status of statuses) {
      // The compound index drops attempt-capped rows outright so they cannot
      // fill the retry window and starve newer, still-retryable rows.
      const page = await ctx.db
        .query("waitlistSignups")
        .withIndex("by_resendStatus_attempts", (q) =>
          q
            .eq("resendStatus", status)
            .lt("resendAttempts", RESEND_MAX_ATTEMPTS),
        )
        .take(RESEND_RETRY_SCAN);
      for (const row of page) {
        out.push({
          id: row._id,
          email: row.email,
          product: row.product,
          resendAttempts: row.resendAttempts ?? 0,
        });
      }
    }
    return out;
  },
});

/**
 * A Resend call that returned a non-success HTTP status. Carries only the
 * status and which step failed; the response body (which can echo the
 * address) is never read into the error.
 */
class ResendResponseError extends Error {
  constructor(
    readonly step: "create" | "lookup" | "segment" | "topic",
    readonly status: number,
  ) {
    super(`Resend ${step} failed (${status}).`);
    this.name = "ResendResponseError";
  }
}

/**
 * Reduce any failure from the sync path to a fixed category and, when there
 * was an HTTP response, its status code. Exported for testing.
 */
export function classifyResendError(error: unknown): {
  category: ResendErrorCategory;
  status: number | undefined;
} {
  if (error instanceof ResendResponseError) {
    const { status } = error;
    if (status === 429) return { category: "rate_limited", status };
    if (status === 401 || status === 403)
      return { category: "auth_error", status };
    if (status === 400 || status === 422) {
      return { category: "invalid_recipient", status };
    }
    return { category: "provider_error", status };
  }
  // `AbortSignal.timeout` rejects with a DOMException named TimeoutError (or
  // AbortError on older runtimes).
  if (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return { category: "timeout", status: undefined };
  }
  return { category: "network_error", status: undefined };
}

async function resendRequest(apiKey: string, path: string, init: RequestInit) {
  return await fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "Shelvr-Waitlist/1.0",
      ...init.headers,
    },
    // A hung Resend socket must not stall the join action or the retry cron.
    signal: AbortSignal.timeout(15_000),
  });
}

async function syncResendContact(
  apiKey: string,
  email: string,
  product: WaitlistProduct,
): Promise<string | undefined> {
  const segmentId =
    product === "shelvr-android"
      ? env.RESEND_ANDROID_SEGMENT_ID
      : env.RESEND_SEGMENT_ID;
  const topicId = env.RESEND_TOPIC_ID;
  const createResponse = await resendRequest(apiKey, "/contacts", {
    method: "POST",
    body: JSON.stringify({
      email,
      unsubscribed: false,
      ...(segmentId ? { segments: [{ id: segmentId }] } : {}),
      ...(topicId ? { topics: [{ id: topicId, subscription: "opt_in" }] } : {}),
    }),
  });

  let contactId: string | undefined;
  if (createResponse.ok) {
    const result = (await createResponse.json()) as { id?: string };
    contactId = result.id;
  } else if (createResponse.status === 409) {
    const getResponse = await resendRequest(
      apiKey,
      `/contacts/${encodeURIComponent(email)}`,
      { method: "GET" },
    );
    if (!getResponse.ok) {
      throw new ResendResponseError("lookup", getResponse.status);
    }
    const result = (await getResponse.json()) as { id?: string };
    contactId = result.id;

    if (segmentId) {
      const segmentResponse = await resendRequest(
        apiKey,
        `/contacts/${encodeURIComponent(email)}/segments/${segmentId}`,
        { method: "POST" },
      );
      if (!segmentResponse.ok && segmentResponse.status !== 409) {
        throw new ResendResponseError("segment", segmentResponse.status);
      }
    }
    if (topicId) {
      const topicResponse = await resendRequest(
        apiKey,
        `/contacts/${encodeURIComponent(email)}/topics`,
        {
          method: "PATCH",
          body: JSON.stringify({
            topics: [{ id: topicId, subscription: "opt_in" }],
          }),
        },
      );
      if (!topicResponse.ok) {
        throw new ResendResponseError("topic", topicResponse.status);
      }
    }
  } else {
    throw new ResendResponseError("create", createResponse.status);
  }
  return contactId;
}

async function persistResendSync(
  ctx: ActionCtx,
  id: Id<"waitlistSignups">,
  email: string,
  product: WaitlistProduct,
  attempts: number,
): Promise<boolean> {
  const apiKey = env.RESEND_API_KEY;
  const missingAndroidSegment =
    product === "shelvr-android" && !env.RESEND_ANDROID_SEGMENT_ID;
  if (!apiKey || missingAndroidSegment) {
    // Missing provider configuration is an operator condition, not a row
    // failure: keep the last real error and do not spend an attempt. Android
    // rows must not be marked synced until they are in their launch segment.
    await ctx.runMutation(internal.waitlist.updateResendStatus, {
      id,
      status: "unconfigured",
      preserveError: true,
    });
    return false;
  }

  try {
    const contactId = await syncResendContact(apiKey, email, product);
    await ctx.runMutation(internal.waitlist.updateResendStatus, {
      id,
      status: "synced",
      contactId,
    });
    return true;
  } catch (error) {
    // Log and persist only the shape of the failure. The provider message (and
    // the email it can echo) stays out of both the database and the logs.
    const { category, status } = classifyResendError(error);
    const step = error instanceof ResendResponseError ? error.step : undefined;
    console.error("Waitlist Resend sync failed", { category, status, step });
    await ctx.runMutation(internal.waitlist.updateResendStatus, {
      id,
      status: "failed",
      errorCategory: category,
      errorStatus: status,
      attempts: attempts + 1,
    });
    return false;
  }
}

/**
 * Thrown by `joinWaitlist` for caller mistakes (bad email) so the HTTP layer
 * can answer 400 instead of 5xx.
 */
export class WaitlistInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WaitlistInputError";
  }
}

export type JoinWaitlistArgs = {
  email: string;
  product?: WaitlistProduct;
  source: WaitlistSource;
  ip?: string;
};

export type JoinWaitlistResult = {
  saved: boolean;
  emailProviderSynced: boolean;
};

/**
 * Persist a waitlist signup and project it to Resend. This is deliberately a
 * plain helper, not a public `action`: the only legitimate caller is the
 * `/waitlist/join` HTTP action in `http.ts`, which authenticates the web
 * server with a shared secret and supplies the real client IP. A public action
 * would let anyone omit or forge `ip` and skip the per-IP limiter.
 */
export async function joinWaitlist(
  ctx: ActionCtx,
  args: JoinWaitlistArgs,
): Promise<JoinWaitlistResult> {
  const email = normalizeEmail(args.email);
  if (!isValidEmail(email)) {
    throw new WaitlistInputError("Enter a valid email address.");
  }
  const ip = normalizeIp(args.ip);
  const product = args.product ?? "shelvr";

  const signup = await ctx.runMutation(internal.waitlist.upsertSignup, {
    email,
    product,
    source: args.source,
    ip,
  });

  if (signup.resendStatus === "synced") {
    return { saved: true, emailProviderSynced: true };
  }

  const emailProviderSynced = await persistResendSync(
    ctx,
    signup.id,
    email,
    product,
    signup.resendAttempts,
  );
  return { saved: true, emailProviderSynced };
}

export const retryFailedResendSyncs = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const rows = await ctx.runQuery(
      internal.waitlist.listSignupsNeedingResendSync,
      {},
    );
    for (const row of rows) {
      await persistResendSync(
        ctx,
        row.id,
        row.email,
        row.product,
        row.resendAttempts,
      );
    }
    return null;
  },
});
