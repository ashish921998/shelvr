import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { authedMutation, authedQuery } from "./model/auth";
import {
  cancelSurveyOutcomeValidator,
  cancelSurveyReasonValidator,
} from "./model/cancelSurveyFields";

async function findSurveyRow(ctx: QueryCtx | MutationCtx, userId: string) {
  return await ctx.db
    .query("cancelSurveys")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
}

export const getStatus = authedQuery({
  args: {},
  returns: v.object({ asked: v.boolean() }),
  handler: async (ctx) => {
    const row = await findSurveyRow(ctx, ctx.userId);
    return { asked: row !== null };
  },
});

export const markShown = authedMutation({
  args: {},
  returns: v.object({ accepted: v.boolean() }),
  handler: async (ctx) => {
    const { userId } = ctx;
    if (await findSurveyRow(ctx, userId)) return { accepted: false };
    await ctx.db.insert("cancelSurveys", {
      userId,
      askedAt: Date.now(),
    });
    return { accepted: true };
  },
});

export const respond = authedMutation({
  args: {
    outcome: cancelSurveyOutcomeValidator,
    reason: v.optional(cancelSurveyReasonValidator),
  },
  returns: v.object({ accepted: v.boolean() }),
  handler: async (ctx, args) => {
    const { userId } = ctx;
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
    if (existing.outcome !== undefined) return { accepted: false };
    await ctx.db.patch(existing._id, {
      outcome: args.outcome,
      ...(args.reason !== undefined ? { reason: args.reason } : {}),
      respondedAt: now,
    });
    return { accepted: true };
  },
});
