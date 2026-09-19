import { ConvexError, Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  env,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  type ActionCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUserId } from "./model/auth";
import {
  feedbackDeliveryStatusValidator,
  feedbackSurfaceValidator,
} from "./model/feedbackFields";
import { logEvent } from "./model/log";
import { rateLimiter } from "./model/rateLimiter";

/**
 * Authenticated in-app feedback (the client boundary is
 * apps/native/src/lib/use-submit-feedback.ts and the shared modal).
 *
 * Convex is the source of truth: `submitFeedback` persists the row first,
 * then the support-inbox email is projected out of it. A Resend outage,
 * timeout, or missing operator configuration can never lose feedback — the
 * row simply waits (status `pending` / `failed` / `unconfigured`) for the
 * bounded, index-backed retry worker, following the same
 * provider-independent pattern as `waitlist.ts`.
 *
 * Privacy boundary: the message is user content. It lives in Convex and —
 * once delivered — in the operator's inbox (the authorized feedback
 * channel). It never appears in backend logs (only categories, status codes,
 * ids, and attempt counts) nor in PostHog (client telemetry carries surface,
 * char count, and a content-free delivery category only).
 */

/** Mirrors the client's FEEDBACK_MESSAGE_MAX_LENGTH (src/lib/feedback.ts). */
export const FEEDBACK_MESSAGE_MAX_LENGTH = 1000;
/** A row that fails this many sends stays `failed` for manual inspection
 * instead of occupying the retry window forever. */
export const MAX_DELIVERY_ATTEMPTS = 10;
/** Rows scanned per retryable status per retry run. */
const RETRY_SCAN = 100;
/** Context strings (app version, build variant) are best-effort metadata for
 * the reply, so an over-long value is truncated rather than rejected. */
const MAX_CONTEXT_LENGTH = 64;

const platformValidator = v.union(v.literal("ios"), v.literal("android"));

// Why a send failed, without the provider's message. Resend can echo the
// submitted content inside its error text, so the response body is never
// read; the category plus HTTP status is enough to triage an outage.
const feedbackErrorCategoryValidator = v.union(
  v.literal("rate_limited"),
  v.literal("auth_error"),
  v.literal("invalid_request"),
  v.literal("provider_error"),
  v.literal("timeout"),
  v.literal("network_error"),
);
export type FeedbackErrorCategory = Infer<
  typeof feedbackErrorCategoryValidator
>;

const claimedDeliveryValidator = v.object({
  attempt: v.number(),
  submittedAt: v.number(),
  message: v.string(),
  surface: feedbackSurfaceValidator,
  platform: v.optional(platformValidator),
  appVersion: v.optional(v.string()),
  buildVariant: v.optional(v.string()),
  accountEmail: v.optional(v.string()),
});
type ClaimedDelivery = Infer<typeof claimedDeliveryValidator>;

/** Operator inbox configuration. All three must be set for delivery. */
type FeedbackInboxConfig = {
  apiKey: string;
  to: string;
  from: string;
};

function feedbackInboxConfig(): FeedbackInboxConfig | null {
  const { RESEND_API_KEY: apiKey, RESEND_FEEDBACK_INBOX_EMAIL: to } = env;
  const { RESEND_FEEDBACK_FROM_EMAIL: from } = env;
  if (!apiKey || !to || !from) return null;
  return { apiKey, to, from };
}

/** True once the support inbox env vars are all set. Rows submitted before
 * that stay `unconfigured` and are delivered once it is. */
export function isFeedbackInboxConfigured(): boolean {
  return feedbackInboxConfig() !== null;
}

/** Server-side twin of the client's sanitizeFeedbackMessage: the row is the
 * record of what the user said, so over-long input is rejected rather than
 * silently truncated, and whitespace-only input never creates a row. */
export function normalizeFeedbackMessage(raw: string): string {
  const message = raw.trim();
  if (message.length === 0) {
    throw new ConvexError("Feedback message is empty.");
  }
  if (message.length > FEEDBACK_MESSAGE_MAX_LENGTH) {
    throw new ConvexError("Feedback message is too long.");
  }
  return message;
}

function boundContext(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const bounded = value.trim().slice(0, MAX_CONTEXT_LENGTH);
  return bounded.length > 0 ? bounded : undefined;
}

/**
 * Persist one authenticated feedback submission. The user is always derived
 * from the session (never an argument) and per-user rate limited, so this
 * cannot become an email relay. Returns only after the row is durable — the
 * scheduled inbox delivery is a projection the client never claims as done.
 */
export const submitFeedback = mutation({
  args: {
    message: v.string(),
    surface: feedbackSurfaceValidator,
    platform: v.optional(platformValidator),
    appVersion: v.optional(v.string()),
    buildVariant: v.optional(v.string()),
  },
  returns: v.object({
    submissionId: v.id("feedbackSubmissions"),
    // Content-free projection state for client telemetry: `scheduled` means
    // an inbox is configured and delivery is queued; `unconfigured` means the
    // row waits for operator setup. Neither means the email was sent.
    deliveryState: v.union(v.literal("scheduled"), v.literal("unconfigured")),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await rateLimiter.limit(ctx, "feedbackSubmit", {
      key: userId,
      throws: true,
    });
    const message = normalizeFeedbackMessage(args.message);
    const configured = isFeedbackInboxConfigured();
    const submissionId = await ctx.db.insert("feedbackSubmissions", {
      userId,
      message,
      surface: args.surface,
      ...(args.platform !== undefined ? { platform: args.platform } : {}),
      ...(args.appVersion !== undefined
        ? { appVersion: boundContext(args.appVersion) }
        : {}),
      ...(args.buildVariant !== undefined
        ? { buildVariant: boundContext(args.buildVariant) }
        : {}),
      status: configured ? "pending" : "unconfigured",
      attempts: 0,
    });
    if (configured) {
      // Persist first, then deliver: the action reads the committed row, so
      // a provider outage retries from Convex instead of losing feedback.
      await ctx.scheduler.runAfter(0, internal.feedback.deliver, {
        submissionId,
      });
    }
    return {
      submissionId,
      deliveryState: configured
        ? ("scheduled" as const)
        : ("unconfigured" as const),
    };
  },
});

/**
 * Load one deliverable row plus the safe context the email needs. No lease:
 * the immediate post-submit action runs once per row and the retry worker
 * walks a bounded page serially, so the only concurrent-claim window is a
 * retry racing a still-queued immediate action — a rare duplicate email to
 * the operator, never a lost row or a user-visible failure. Unconfigured
 * spends no attempt (an operator condition is not a row failure).
 */
export const claimDelivery = internalMutation({
  args: { submissionId: v.id("feedbackSubmissions") },
  returns: v.union(v.null(), claimedDeliveryValidator),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.submissionId);
    if (
      row === null ||
      row.status === "delivered" ||
      row.attempts >= MAX_DELIVERY_ATTEMPTS
    ) {
      return null;
    }
    if (!isFeedbackInboxConfigured()) {
      if (row.status !== "unconfigured") {
        await ctx.db.patch(args.submissionId, { status: "unconfigured" });
      }
      return null;
    }
    // The authenticated account's email is safe reply context, read from the
    // users table — never a client-supplied address.
    const user = await ctx.db.get(row.userId as Id<"users">);
    return {
      attempt: row.attempts + 1,
      submittedAt: row._creationTime,
      message: row.message,
      surface: row.surface,
      ...(row.platform !== undefined ? { platform: row.platform } : {}),
      ...(row.appVersion !== undefined ? { appVersion: row.appVersion } : {}),
      ...(row.buildVariant !== undefined
        ? { buildVariant: row.buildVariant }
        : {}),
      ...(user?.email !== undefined ? { accountEmail: user.email } : {}),
    };
  },
});

/**
 * Advance a row's delivery state. Only `deliver`/`retryFailedDeliveries`
 * call this, so a crashed attempt simply leaves the row as it was for the
 * retry worker. `failed` spends one attempt; `delivered` is terminal.
 */
export const finishDelivery = internalMutation({
  args: {
    submissionId: v.id("feedbackSubmissions"),
    status: v.union(v.literal("delivered"), v.literal("failed")),
    errorCategory: v.optional(feedbackErrorCategoryValidator),
    errorStatus: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.submissionId);
    if (row === null || row.status === "delivered") return null;
    if (args.status === "delivered") {
      await ctx.db.patch(args.submissionId, {
        status: "delivered",
        deliveredAt: Date.now(),
        deliveryError: undefined,
      });
      return null;
    }
    await ctx.db.patch(args.submissionId, {
      status: "failed",
      attempts: row.attempts + 1,
      deliveryError: formatFeedbackError(
        args.errorCategory ?? "network_error",
        args.errorStatus,
      ),
    });
    return null;
  },
});

/**
 * Serialize a failure into the `deliveryError` column as `<category>` or
 * `<category>:<status>` (status omitted when the failure never got an HTTP
 * response). Nothing from the provider's response body is included.
 */
export function formatFeedbackError(
  category: FeedbackErrorCategory,
  status: number | undefined,
): string {
  return status === undefined ? category : `${category}:${status}`;
}

/** A Resend send that returned a non-success HTTP status. */
class ResendSendError extends Error {
  constructor(readonly status: number) {
    super(`Resend send failed (${status}).`);
    this.name = "ResendSendError";
  }
}

/**
 * Reduce any failure from the send path to a fixed category and, when there
 * was an HTTP response, its status code. Exported for testing.
 */
export function classifyFeedbackSendError(error: unknown): {
  category: FeedbackErrorCategory;
  status: number | undefined;
} {
  if (error instanceof ResendSendError) {
    const { status } = error;
    if (status === 429) return { category: "rate_limited", status };
    if (status === 401 || status === 403)
      return { category: "auth_error", status };
    if (status === 400 || status === 422) {
      return { category: "invalid_request", status };
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

/** The support email. The message is included — this is the authorized
 * feedback channel — but the subject stays content-free (a bounded surface
 * word) so notification previews cannot leak user content. */
function buildFeedbackEmail(
  submissionId: Id<"feedbackSubmissions">,
  claimed: ClaimedDelivery,
): { subject: string; text: string; replyTo?: string } {
  const lines = [
    `New Shelvr feedback from the ${claimed.surface} form.`,
    "",
    claimed.message,
    "",
    "—",
    `Submission ID: ${submissionId}`,
    `Surface: ${claimed.surface}`,
    `Platform: ${claimed.platform ?? "unknown"}`,
    `App version: ${claimed.appVersion ?? "unknown"}`,
    `Build: ${claimed.buildVariant ?? "unknown"}`,
    `Account email: ${claimed.accountEmail ?? "not available"}`,
    `Submitted: ${new Date(claimed.submittedAt).toISOString()}`,
  ];
  return {
    subject: `Shelvr feedback (${claimed.surface})`,
    text: lines.join("\n"),
    ...(claimed.accountEmail !== undefined
      ? { replyTo: claimed.accountEmail }
      : {}),
  };
}

async function sendFeedbackEmail(
  config: FeedbackInboxConfig,
  submissionId: Id<"feedbackSubmissions">,
  claimed: ClaimedDelivery,
): Promise<void> {
  const { subject, text, replyTo } = buildFeedbackEmail(submissionId, claimed);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "Shelvr-Feedback/1.0",
    },
    body: JSON.stringify({
      from: config.from,
      to: config.to,
      subject,
      text,
      ...(replyTo === undefined ? {} : { reply_to: replyTo }),
    }),
    // A hung Resend socket must not stall the delivery action or the
    // retry worker.
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    // The response body can echo the submitted message, so it is never read.
    throw new ResendSendError(response.status);
  }
}

/** One claim → send → finish cycle. Persisted state only ever advances
 * through `finishDelivery`, so a crashed attempt leaves the row exactly as
 * it was for the retry worker. */
async function attemptDelivery(
  ctx: ActionCtx,
  submissionId: Id<"feedbackSubmissions">,
): Promise<void> {
  const claimed: ClaimedDelivery | null = await ctx.runMutation(
    internal.feedback.claimDelivery,
    { submissionId },
  );
  if (claimed === null) return;
  const config = feedbackInboxConfig();
  if (config === null) return; // claim already spent the unconfigured check.
  try {
    await sendFeedbackEmail(config, submissionId, claimed);
    logEvent("info", "feedback_delivered", {
      submission_id: submissionId,
      attempt: claimed.attempt,
    });
    await ctx.runMutation(internal.feedback.finishDelivery, {
      submissionId,
      status: "delivered",
    });
  } catch (error) {
    // Log and persist only the shape of the failure — never the message,
    // account email, or provider text.
    const { category, status } = classifyFeedbackSendError(error);
    logEvent("error", "feedback_delivery_failed", {
      submission_id: submissionId,
      category,
      status,
      attempt: claimed.attempt,
    });
    await ctx.runMutation(internal.feedback.finishDelivery, {
      submissionId,
      status: "failed",
      errorCategory: category,
      errorStatus: status,
    });
  }
}

/** Immediate delivery for a fresh submission, scheduled by `submitFeedback`. */
export const deliver = internalAction({
  args: { submissionId: v.id("feedbackSubmissions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await attemptDelivery(ctx, args.submissionId);
    return null;
  },
});

/** Bounded, index-backed retry scan: each retryable status pages rows below
 * the attempt cap without ever scanning the whole table. */
export const listSubmissionsNeedingDelivery = internalQuery({
  args: {},
  returns: v.array(v.id("feedbackSubmissions")),
  handler: async (ctx) => {
    const statuses: Infer<typeof feedbackDeliveryStatusValidator>[] = [
      "pending",
      "failed",
      "unconfigured",
    ];
    const out: Id<"feedbackSubmissions">[] = [];
    for (const status of statuses) {
      // The compound index drops attempt-capped rows outright so they cannot
      // fill the retry window and starve newer, still-retryable rows.
      const page = await ctx.db
        .query("feedbackSubmissions")
        .withIndex("by_status_attempts", (q) =>
          q.eq("status", status).lt("attempts", MAX_DELIVERY_ATTEMPTS),
        )
        .take(RETRY_SCAN);
      for (const row of page) out.push(row._id);
    }
    return out;
  },
});

/** Retry worker: deliver rows whose first attempt never ran or failed, so a
 * Resend outage does not leave feedback unrecoverable. Runs from crons.ts. */
export const retryFailedDeliveries = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const submissionIds = await ctx.runQuery(
      internal.feedback.listSubmissionsNeedingDelivery,
      {},
    );
    for (const submissionId of submissionIds) {
      await attemptDelivery(ctx, submissionId);
    }
    return null;
  },
});
