import { ConvexError, Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  env,
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { authedMutation, liveOwner } from "./model/auth";
import {
  feedbackDeliveryStatusValidator,
  feedbackPlatformValidator,
  feedbackSurfaceValidator,
} from "./model/feedbackFields";
import { logEvent } from "./model/log";
import { rateLimiter } from "./model/rateLimiter";
import {
  classifyResendError,
  formatResendError,
  ResendResponseError,
  resendErrorCategoryValidator,
  resendRequest,
} from "./model/resend";

export const FEEDBACK_MESSAGE_MAX_LENGTH = 1000;
export const MAX_DELIVERY_ATTEMPTS = 10;
const DELIVERY_LEASE_MS = 90_000;
const DELIVERY_RETRY_WINDOW_MS = 23 * 60 * 60_000;
const RETRY_SCAN = 100;
const MAX_CONTEXT_LENGTH = 64;
const CLEARED_DELIVERY = {
  deliveryRequestBody: undefined,
  deliveryLeaseUntil: undefined,
};

const claimedDeliveryValidator = v.object({
  body: v.string(),
  attempt: v.number(),
});
type ClaimedDelivery = Infer<typeof claimedDeliveryValidator>;

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

export function isFeedbackInboxConfigured(): boolean {
  return feedbackInboxConfig() !== null;
}

function normalizeFeedbackMessage(raw: string): string {
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

export const submitFeedback = authedMutation({
  args: {
    message: v.string(),
    surface: feedbackSurfaceValidator,
    platform: v.optional(feedbackPlatformValidator),
    appVersion: v.optional(v.string()),
    buildVariant: v.optional(v.string()),
  },
  returns: v.object({
    submissionId: v.id("feedbackSubmissions"),
    deliveryState: v.union(v.literal("scheduled"), v.literal("unconfigured")),
  }),
  handler: async (ctx, args) => {
    const { userId } = ctx;
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

export const claimDelivery = internalMutation({
  args: { submissionId: v.id("feedbackSubmissions") },
  returns: v.union(v.null(), claimedDeliveryValidator),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.submissionId);
    const now = Date.now();
    if (
      row === null ||
      row.status === "delivered" ||
      row.status === "expired" ||
      row.status === "exhausted" ||
      (row.deliveryLeaseUntil ?? 0) > now
    ) {
      return null;
    }
    if (
      row.deliveryStartedAt !== undefined &&
      now - row.deliveryStartedAt >= DELIVERY_RETRY_WINDOW_MS
    ) {
      await ctx.db.patch(args.submissionId, {
        status: "expired",
        deliveryError: undefined,
        ...CLEARED_DELIVERY,
      });
      return null;
    }
    if (row.attempts >= MAX_DELIVERY_ATTEMPTS) {
      await ctx.db.patch(args.submissionId, {
        status: "exhausted",
        ...CLEARED_DELIVERY,
      });
      return null;
    }
    const config = feedbackInboxConfig();
    if (config === null) {
      if (row.status !== "unconfigured") {
        await ctx.db.patch(args.submissionId, { status: "unconfigured" });
      }
      return null;
    }
    const user = await liveOwner(ctx, row.userId);
    if (user === null) {
      await ctx.db.delete(args.submissionId);
      return null;
    }
    const attempt = row.attempts + 1;
    const body =
      row.deliveryRequestBody ?? feedbackEmailBody(config, row, user.email);
    await ctx.db.patch(args.submissionId, {
      attempts: attempt,
      deliveryLeaseUntil: now + DELIVERY_LEASE_MS,
      deliveryStartedAt: row.deliveryStartedAt ?? now,
      deliveryRequestBody: body,
    });
    return { attempt, body };
  },
});

export const finishDelivery = internalMutation({
  args: {
    submissionId: v.id("feedbackSubmissions"),
    attempt: v.optional(v.number()),
    status: v.union(v.literal("delivered"), v.literal("failed")),
    errorCategory: v.optional(resendErrorCategoryValidator),
    errorStatus: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Pre-deploy actions have no attempt identity; discard their completion.
    if (args.attempt === undefined) return null;
    const row = await ctx.db.get(args.submissionId);
    if (
      row === null ||
      row.status === "delivered" ||
      row.status === "expired" ||
      row.status === "exhausted" ||
      args.attempt !== row.attempts
    )
      return null;
    if (args.status === "delivered") {
      await ctx.db.patch(args.submissionId, {
        status: "delivered",
        deliveredAt: Date.now(),
        deliveryError: undefined,
        ...CLEARED_DELIVERY,
      });
      return null;
    }
    await ctx.db.patch(args.submissionId, {
      status: row.attempts >= MAX_DELIVERY_ATTEMPTS ? "exhausted" : "failed",
      deliveryLeaseUntil: undefined,
      ...(row.attempts >= MAX_DELIVERY_ATTEMPTS ? CLEARED_DELIVERY : {}),
      deliveryError: formatResendError(
        args.errorCategory ?? "network_error",
        args.errorStatus,
      ),
    });
    return null;
  },
});

function feedbackEmailBody(
  config: FeedbackInboxConfig,
  row: Doc<"feedbackSubmissions">,
  accountEmail: string | undefined,
): string {
  const lines = [
    `New Shelvr feedback from the ${row.surface} form.`,
    "",
    row.message,
    "",
    "—",
    `Submission ID: ${row._id}`,
    `Surface: ${row.surface}`,
    `Platform: ${row.platform ?? "unknown"}`,
    `App version: ${row.appVersion ?? "unknown"}`,
    `Build: ${row.buildVariant ?? "unknown"}`,
    `Account email: ${accountEmail ?? "not available"}`,
    `Submitted: ${new Date(row._creationTime).toISOString()}`,
  ];
  return JSON.stringify({
    from: config.from,
    to: config.to,
    subject: `Shelvr feedback (${row.surface})`,
    text: lines.join("\n"),
    ...(accountEmail === undefined ? {} : { reply_to: accountEmail }),
  });
}

async function sendFeedbackEmail(
  apiKey: string,
  submissionId: Id<"feedbackSubmissions">,
  body: string,
): Promise<void> {
  const response = await resendRequest(
    apiKey,
    "Shelvr-Feedback/1.0",
    "/emails",
    {
      method: "POST",
      headers: { "Idempotency-Key": `feedback/${submissionId}` },
      body,
    },
  );
  if (!response.ok) {
    throw new ResendResponseError("send", response.status);
  }
}

async function attemptDelivery(
  ctx: ActionCtx,
  submissionId: Id<"feedbackSubmissions">,
): Promise<void> {
  const claimed: ClaimedDelivery | null = await ctx.runMutation(
    internal.feedback.claimDelivery,
    { submissionId },
  );
  if (claimed === null) return;
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) return;
  try {
    await sendFeedbackEmail(apiKey, submissionId, claimed.body);
    logEvent("info", "feedback_delivered", {
      submission_id: submissionId,
      attempt: claimed.attempt,
    });
    await ctx.runMutation(internal.feedback.finishDelivery, {
      submissionId,
      attempt: claimed.attempt,
      status: "delivered",
    });
  } catch (error) {
    const { category, status } = classifyResendError(error, "invalid_request");
    logEvent("error", "feedback_delivery_failed", {
      submission_id: submissionId,
      category,
      status,
      attempt: claimed.attempt,
    });
    await ctx.runMutation(internal.feedback.finishDelivery, {
      submissionId,
      attempt: claimed.attempt,
      status: "failed",
      errorCategory: category,
      errorStatus: status,
    });
  }
}

export const deliver = internalAction({
  args: { submissionId: v.id("feedbackSubmissions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await attemptDelivery(ctx, args.submissionId);
    return null;
  },
});

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
      const page = await ctx.db
        .query("feedbackSubmissions")
        .withIndex("by_status_attempts", (q) => q.eq("status", status))
        .take(RETRY_SCAN);
      for (const row of page) out.push(row._id);
    }
    return out;
  },
});

export const retryFailedDeliveries = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const submissionIds = await ctx.runQuery(
      internal.feedback.listSubmissionsNeedingDelivery,
      {},
    );
    for (const submissionId of submissionIds) {
      await ctx.scheduler.runAfter(0, internal.feedback.deliver, {
        submissionId,
      });
    }
    return null;
  },
});
