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
import { newCaptureToken, sha256Hex } from "./model/captureTokens";
import { ipKey, normalizeIp } from "./model/clientIp";
import { logEvent } from "./model/log";
import { rateLimiter } from "./model/rateLimiter";
import {
  ResendResponseError,
  classifyResendError,
  formatResendError,
  resendErrorCategoryValidator,
  resendRequest,
} from "./model/resend";

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
  v.literal("plan"),
  v.literal("unknown"),
);
type WaitlistSource = Infer<typeof sourceValidator>;

const resendStatusValidator = v.union(
  v.literal("pending"),
  v.literal("synced"),
  v.literal("failed"),
  v.literal("unconfigured"),
);

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_RETRY_SCAN = 100;
const RESEND_USER_AGENT = "Shelvr-Waitlist/1.0";
export const RESEND_MAX_ATTEMPTS = 10;

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function inboxKey(email: string): string {
  const [local = "", rawDomain = ""] = email.split("@");
  const domain = rawDomain.replace(/\.+$/, "");
  const base = local.split("+")[0] ?? local;
  const isGmail = domain === "gmail.com" || domain === "googlemail.com";
  return isGmail
    ? `${base.replaceAll(".", "")}@gmail.com`
    : `${base}@${domain}`;
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
    value === "plan" ||
    value === "unknown"
  );
}

export const upsertSignup = internalMutation({
  args: {
    email: v.string(),
    product: productValidator,
    source: sourceValidator,
    ip: v.optional(v.string()),
    confirmationHash: v.optional(v.string()),
  },
  returns: v.object({
    id: v.id("waitlistSignups"),
    resendStatus: resendStatusValidator,
    resendAttempts: v.number(),
  }),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "waitlistJoinGlobal", { throws: true });
    await rateLimiter.limit(ctx, "waitlistJoinIp", {
      key: ipKey(args.ip),
      throws: true,
    });
    await rateLimiter.limit(ctx, "waitlistJoin", {
      key: inboxKey(args.email),
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
      await ctx.db.patch(existing._id, {
        source: args.source,
        lastSubmittedAt: now,
        ...(existing.confirmedAt === undefined
          ? {
              confirmed: false,
              confirmationHash: args.confirmationHash,
              confirmationExpiresAt: now + 24 * 60 * 60 * 1000,
            }
          : {}),
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
      consentedAt: 0,
      confirmed: false,
      confirmationHash: args.confirmationHash,
      confirmationExpiresAt: now + 24 * 60 * 60 * 1000,
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
    errorCategory: v.optional(resendErrorCategoryValidator),
    errorStatus: v.optional(v.number()),
    attempts: v.optional(v.number()),
    preserveError: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      resendStatus: args.status,
      ...(args.contactId === undefined
        ? {}
        : { resendContactId: args.contactId }),
      ...(args.attempts === undefined ? {} : { resendAttempts: args.attempts }),
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
      const page = await ctx.db
        .query("waitlistSignups")
        .withIndex("by_confirmed_and_resendStatus_and_resendAttempts", (q) =>
          q
            .eq("confirmed", true)
            .eq("resendStatus", status)
            .lt("resendAttempts", RESEND_MAX_ATTEMPTS),
        )
        .take(RESEND_RETRY_SCAN);
      for (const row of page) {
        if (row.confirmedAt === undefined) continue;
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
  const createResponse = await resendRequest(
    apiKey,
    RESEND_USER_AGENT,
    "/contacts",
    {
      method: "POST",
      body: JSON.stringify({
        email,
        unsubscribed: false,
        ...(segmentId ? { segments: [{ id: segmentId }] } : {}),
        ...(topicId
          ? { topics: [{ id: topicId, subscription: "opt_in" }] }
          : {}),
      }),
    },
  );

  let contactId: string | undefined;
  if (createResponse.ok) {
    const result = (await createResponse.json()) as { id?: string };
    contactId = result.id;
  } else if (createResponse.status === 409) {
    const getResponse = await resendRequest(
      apiKey,
      RESEND_USER_AGENT,
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
        RESEND_USER_AGENT,
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
        RESEND_USER_AGENT,
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
    const { category, status } = classifyResendError(
      error,
      "invalid_recipient",
    );
    const step = error instanceof ResendResponseError ? error.label : undefined;
    logEvent("error", "waitlist_resend_sync_failed", {
      category,
      status,
      step,
      attempt: attempts + 1,
    });
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

export class WaitlistInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WaitlistInputError";
  }
}

type JoinWaitlistArgs = {
  email: string;
  product?: WaitlistProduct;
  source: WaitlistSource;
  ip?: string;
};

type JoinWaitlistResult = {
  confirmationSent?: boolean;
  saved: boolean;
  emailProviderSynced: boolean;
};

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

  const token = newCaptureToken();
  const signup = await ctx.runMutation(internal.waitlist.upsertSignup, {
    email,
    product,
    source: args.source,
    ip,
    confirmationHash: await sha256Hex(token),
  });

  const row = await ctx.runQuery(internal.waitlist.getSignup, {
    id: signup.id,
  });
  if (row?.confirmedAt !== undefined || signup.resendStatus === "synced") {
    return {
      saved: true,
      emailProviderSynced: signup.resendStatus === "synced",
    };
  }
  const apiKey = env.RESEND_API_KEY;
  const from = env.RESEND_FEEDBACK_FROM_EMAIL;
  if (!apiKey || !from) {
    await ctx.runMutation(internal.waitlist.updateResendStatus, {
      id: signup.id,
      status: "unconfigured",
      preserveError: true,
    });
    return { saved: true, emailProviderSynced: false, confirmationSent: false };
  }
  let confirmationSent = false;
  try {
    const response = await resendRequest(apiKey, RESEND_USER_AGENT, "/emails", {
      method: "POST",
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Confirm your Shelvr waitlist request",
        text: `Confirm that you requested a Shelvr launch notification: https://shelvr-web.vercel.app/waitlist/confirm?token=${token}\n\nThis link expires in 24 hours. If you did not request this, ignore this email. You are not subscribed.`,
      }),
    });
    if (!response.ok)
      throw new ResendResponseError("confirmation", response.status);
    confirmationSent = true;
  } catch (error) {
    const { category, status } = classifyResendError(
      error,
      "invalid_recipient",
    );
    logEvent("error", "waitlist_confirmation_failed", { category, status });
    await ctx.runMutation(internal.waitlist.updateResendStatus, {
      id: signup.id,
      status: "failed",
      errorCategory: category,
      errorStatus: status,
      attempts: signup.resendAttempts + 1,
    });
  }
  return { saved: true, emailProviderSynced: false, confirmationSent };
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

export const getSignup = internalQuery({
  args: { id: v.id("waitlistSignups") },
  returns: v.union(v.null(), v.object({ confirmedAt: v.optional(v.number()) })),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    return row ? { confirmedAt: row.confirmedAt } : null;
  },
});

export const confirmSignup = internalMutation({
  args: { tokenHash: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      id: v.id("waitlistSignups"),
      email: v.string(),
      product: productValidator,
      resendAttempts: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("waitlistSignups")
      .withIndex("by_confirmationHash", (q) =>
        q.eq("confirmationHash", args.tokenHash),
      )
      .unique();
    if (
      !row ||
      row.confirmedAt !== undefined ||
      (row.confirmationExpiresAt ?? 0) <= Date.now()
    )
      return null;
    await ctx.db.patch(row._id, {
      confirmedAt: Date.now(),
      confirmed: true,
      consentedAt: Date.now(),
      confirmationHash: undefined,
      confirmationExpiresAt: undefined,
      resendStatus: "pending",
      resendAttempts: 0,
    });
    return {
      id: row._id,
      email: row.email,
      product: row.product,
      resendAttempts: 0,
    };
  },
});

export async function confirmWaitlist(
  ctx: ActionCtx,
  token: string,
): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const row = await ctx.runMutation(internal.waitlist.confirmSignup, {
    tokenHash: await sha256Hex(token),
  });
  if (!row) return false;
  await persistResendSync(
    ctx,
    row.id,
    row.email,
    row.product,
    row.resendAttempts,
  );
  return true;
}

export const listLegacySignups = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      email: v.string(),
      product: productValidator,
      source: sourceValidator,
    }),
  ),
  handler: async (ctx) => {
    for (const status of ["pending", "failed", "unconfigured"] as const) {
      const rows = await ctx.db
        .query("waitlistSignups")
        .withIndex("by_confirmed_and_resendStatus_and_resendAttempts", (q) =>
          q.eq("confirmed", undefined).eq("resendStatus", status),
        )
        .take(8);
      if (rows.length > 0)
        return rows.map((row) => ({
          email: row.email,
          product: row.product,
          source: row.source,
        }));
    }
    return [];
  },
});

export const requestLegacyConfirmations = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (!env.RESEND_API_KEY || !env.RESEND_FEEDBACK_FROM_EMAIL) return null;
    const rows = await ctx.runQuery(internal.waitlist.listLegacySignups, {});
    for (const row of rows) {
      try {
        await joinWaitlist(ctx, row);
      } catch {
        logEvent("warn", "legacy_confirmation_deferred", {});
      }
    }
    return null;
  },
});
