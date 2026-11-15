import { v } from "convex/values";
import { internalQuery, type QueryCtx } from "./_generated/server";
import { AI_CONSENT_VERSION } from "./model/aiConsent";
import { liveOwner, authedMutation, authedQuery } from "./model/auth";

async function consentRow(ctx: QueryCtx, userId: string) {
  return await ctx.db
    .query("aiConsents")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

/** AI is available by default for live owners; explicit legacy opt-outs remain authoritative. */
export async function aiAllowed(
  ctx: QueryCtx,
  userId: string,
): Promise<boolean> {
  if ((await liveOwner(ctx, userId)) === null) return false;
  return (await consentRow(ctx, userId))?.status !== "declined";
}

export const isAllowed = internalQuery({
  args: { userId: v.string(), itemId: v.id("items") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (item === null || item.userId !== args.userId) return false;
    return await aiAllowed(ctx, args.userId);
  },
});

export const getStatus = authedQuery({
  args: {},
  returns: v.object({
    status: v.union(
      v.literal("unset"),
      v.literal("granted"),
      v.literal("declined"),
    ),
    version: v.number(),
  }),
  handler: async (ctx) => {
    const { userId } = ctx;
    const row = await consentRow(ctx, userId);
    return {
      status:
        row !== null && row.version === AI_CONSENT_VERSION
          ? row.status
          : ("unset" as const),
      version: AI_CONSENT_VERSION,
    };
  },
});

export const setConsent = authedMutation({
  args: { granted: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const row = await consentRow(ctx, userId);
    const values = {
      status: args.granted ? ("granted" as const) : ("declined" as const),
      version: AI_CONSENT_VERSION,
      updatedAt: Date.now(),
    };
    if (row === null) {
      await ctx.db.insert("aiConsents", { userId, ...values });
    } else {
      await ctx.db.patch(row._id, values);
    }
    return null;
  },
});
