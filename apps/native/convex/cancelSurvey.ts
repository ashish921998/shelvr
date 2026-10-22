import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./model/auth";
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

export const getStatus = query({
  args: {},
  returns: v.object({ asked: v.boolean() }),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const row = await findSurveyRow(ctx, userId);
    return { asked: row !== null };
  },
});

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
    if (existing.outcome !== undefined) return { accepted: false };
    await ctx.db.patch(existing._id, {
      outcome: args.outcome,
      ...(args.reason !== undefined ? { reason: args.reason } : {}),
      respondedAt: now,
    });
    return { accepted: true };
  },
});
