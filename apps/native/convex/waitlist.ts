import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  env,
  type ActionCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
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

const resendStatusValidator = v.union(
  v.literal("pending"),
  v.literal("synced"),
  v.literal("failed"),
  v.literal("unconfigured"),
);

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

// The route derives the IP from proxy headers it does not fully control, and
// `join` is callable directly, so treat anything that is not a plausible IP
// address as absent rather than persisting attacker-chosen limiter keys.
function normalizeIp(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const ip = value.trim().slice(0, MAX_IP_LENGTH);
  if (ip.includes(":")) {
    return /^[0-9a-f:]+$/i.test(ip) ? ip : undefined;
  }
  const octets = ip.split(".");
  return octets.length === 4 &&
    octets.every((o) => /^\d{1,3}$/.test(o) && Number(o) <= 255)
    ? ip
    : undefined;
}

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
    if (args.ip) {
      await rateLimiter.limit(ctx, "waitlistJoinIp", {
        key: args.ip,
        throws: true,
      });
    }
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
        resendAttempts: existing.resendAttempts,
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

export const updateResendStatus = internalMutation({
  args: {
    id: v.id("waitlistSignups"),
    status: resendStatusValidator,
    contactId: v.optional(v.string()),
    error: v.optional(v.string()),
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
      // Same for the error text: the unconfigured path has nothing new to
      // record and must keep the last real failure message visible.
      ...(args.preserveError ? {} : { resendError: args.error }),
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
          resendAttempts: row.resendAttempts,
        });
      }
    }
    return out;
  },
});

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
      throw new Error(`Resend lookup failed (${getResponse.status}).`);
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
        throw new Error(
          `Resend segment sync failed (${segmentResponse.status}).`,
        );
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
        throw new Error(`Resend topic sync failed (${topicResponse.status}).`);
      }
    }
  } else {
    throw new Error(`Resend contact sync failed (${createResponse.status}).`);
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
    const message =
      error instanceof Error ? error.message.slice(0, 500) : "Unknown error";
    console.error("Waitlist Resend sync failed", message);
    await ctx.runMutation(internal.waitlist.updateResendStatus, {
      id,
      status: "failed",
      error: message,
      attempts: attempts + 1,
    });
    return false;
  }
}

export const join = action({
  args: {
    email: v.string(),
    product: v.optional(productValidator),
    source: sourceValidator,
    ip: v.optional(v.string()),
  },
  returns: v.object({
    saved: v.boolean(),
    emailProviderSynced: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    if (!isValidEmail(email)) {
      throw new Error("Enter a valid email address.");
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
  },
});

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
