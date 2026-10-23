import { ConvexError, Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  env,
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { authedMutation } from "./model/auth";
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
const RETRY_SCAN = 100;
const MAX_CONTEXT_LENGTH = 64;

const claimedDeliveryValidator = v.object({
  attempt: v.number(),
  submittedAt: v.number(),
  message: v.string(),
  surface: feedbackSurfaceValidator,
  platform: v.optional(feedbackPlatformValidator),
  appVersion: v.optional(v.string()),
  buildVariant: v.optional(v.string()),
  accountEmail: v.optional(v.string()),
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
    const attempt = row.attempts + 1;
    await ctx.db.patch(args.submissionId, { attempts: attempt });
    const user = await ctx.db.get(row.userId as Id<"users">);
    return {
      attempt,
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

export const finishDelivery = internalMutation({
  args: {
    submissionId: v.id("feedbackSubmissions"),
    status: v.union(v.literal("delivered"), v.literal("failed")),
    errorCategory: v.optional(resendErrorCategoryValidator),
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
      deliveryError: formatResendError(
        args.errorCategory ?? "network_error",
        args.errorStatus,
      ),
    });
    return null;
  },
});

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
  const response = await resendRequest(
    config.apiKey,
    "Shelvr-Feedback/1.0",
    "/emails",
    {
      method: "POST",
      body: JSON.stringify({
        from: config.from,
        to: config.to,
        subject,
        text,
        ...(replyTo === undefined ? {} : { reply_to: replyTo }),
      }),
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
  const config = feedbackInboxConfig();
  if (config === null) return;
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
    const { category, status } = classifyResendError(error, "invalid_request");
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
        .withIndex("by_status_attempts", (q) =>
          q.eq("status", status).lt("attempts", MAX_DELIVERY_ATTEMPTS),
        )
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
