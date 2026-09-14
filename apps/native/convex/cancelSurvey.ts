import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./model/auth";
import {
  cancelSurveyOutcomeValidator,
  cancelSurveyReasonValidator,
} from "./model/cancelSurveyFields";

/**
 * Durable state for the next-visit cancel survey (the client boundary is
 * apps/native/src/lib/cancel-survey.ts).
 *
 * The row enforces the analytics assumption "at most one response per
 * person": existence of a row is the ask, and the first recorded outcome
 * wins. Local device state cannot guarantee this across installs or devices.
 *
 * The ask is consumed only when the card actually renders on screen — the
 * client calls `markShown` from the card's mount, never at detection time,
 * so closing the app on a loading screen leaves the ask unspent.
 *
 * All functions derive the user from the session (never arguments), and a
 * response is never proof of cancellation: only the RevenueCat webhook
 * events count as cancellations (docs/analytics/payment-funnel.md).
 */

async function findSurveyRow(ctx: QueryCtx | MutationCtx, userId: string) {
  return await ctx.db
    .query("cancelSurveys")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
}

/** Reactive gate for the client: has this account already been asked? */
export const getStatus = query({
  args: {},
  returns: v.object({ asked: v.boolean() }),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const row = await findSurveyRow(ctx, userId);
    return { asked: row !== null };
  },
});

/**
 * Consume the ask durably. Returns whether THIS call won the race: a second
 * call (relaunch, another device racing the same moment) is a no-op and is
 * told it lost, so the client can keep PostHog in lockstep with this row —
 * one shown event per account, and a losing card comes down. The account is
 * spent exactly once no matter how many installations race.
 */
export const markShown = mutation({
  args: {},
  returns: v.object({ accepted: v.boolean() }),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    if (await findSurveyRow(ctx, userId)) return { accepted: false };
    await ctx.db.insert("cancelSurveys", {
      userId,
      askedAt: Date.now(),
    });
    return { accepted: true };
  },
});

/**
 * Record how the ask ended. First response wins: once `outcome` is set, a
 * later call (stale device, reinstall) is ignored. Lenient about ordering —
 * a response may arrive before `markShown` lands (e.g. an offline queue
 * flushes out of order) and creates the row itself.
 */
export const respond = mutation({
  args: {
    outcome: cancelSurveyOutcomeValidator,
    reason: v.optional(cancelSurveyReasonValidator),
  },
  returns: v.object({ accepted: v.boolean() }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await findSurveyRow(ctx, userId);
    const now = Date.now();
    if (existing === null) {
      await ctx.db.insert("cancelSurveys", {
        userId,
        askedAt: now,
        outcome: args.outcome,
        ...(args.reason !== undefined ? { reason: args.reason } : {}),
        respondedAt: now,
      });
      return { accepted: true };
    }
    // First outcome wins: a late (or cross-device) response is told it lost,
    // so the client can keep PostHog in lockstep with this row — one
    // submission event per account, never conflicting reasons.
    if (existing.outcome !== undefined) return { accepted: false };
    await ctx.db.patch(existing._id, {
      outcome: args.outcome,
      ...(args.reason !== undefined ? { reason: args.reason } : {}),
      respondedAt: now,
    });
    return { accepted: true };
  },
});
