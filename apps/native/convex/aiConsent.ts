import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { AI_CONSENT_VERSION } from "./model/aiConsent";
import { requireUserId } from "./model/auth";
import { CURRENT_EMBEDDING_VERSION } from "./model/embedding";

async function consentRow(ctx: QueryCtx, userId: string) {
  return await ctx.db
    .query("aiConsents")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

/**
 * Whether this user's content may be sent to third-party AI (Gemini, SerpAPI).
 * Every path that sends it asks here first.
 *
 * Only an explicit decline blocks. A user who has not answered stays allowed,
 * because installed builds (1.0.8) cannot show the consent card and must keep
 * working. A decline holds across disclosure versions until the user answers
 * again, even though `getStatus` reports it as `unset` to re-ask.
 */
export async function aiAllowed(
  ctx: QueryCtx,
  userId: string,
): Promise<boolean> {
  return (await consentRow(ctx, userId))?.status !== "declined";
}

/** The action-side check. With `itemId` it also answers no once that save is
 * gone: a deleted save, or a deleted account, whose content a run still
 * holds in memory, must not be sent after the fact. Deleting the account
 * removes the consent row too, which on its own would read as "not asked". */
export const isAllowed = internalQuery({
  args: { userId: v.string(), itemId: v.optional(v.id("items")) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    if (args.itemId !== undefined && (await ctx.db.get(args.itemId)) === null) {
      return false;
    }
    return await aiAllowed(ctx, args.userId);
  },
});

export const getStatus = query({
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
    const userId = await requireUserId(ctx);
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

export const setConsent = mutation({
  args: { granted: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
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
    // Stored vectors follow the answer: a decline drops them, and a grant
    // after a decline hands the items back to the embedding sweep.
    if ((row?.status === "declined") !== !args.granted) {
      await ctx.scheduler.runAfter(0, internal.aiConsent.syncEmbeddings, {
        userId,
        cursor: null,
      });
    }
    return null;
  },
});

const SYNC_BATCH = 50;

/**
 * Brings one page of a user's stored vectors in line with their consent, then
 * continues. It reads the answer again on every page, so two runs started by
 * a quick change of mind both converge on the latest one.
 *
 * Declined: the vector is removed and the row is stamped as current, which
 * keeps it out of the embedding sweep. Allowed: a row without a vector loses
 * its stamp, so the sweep embeds it.
 */
export const syncEmbeddings = internalMutation({
  args: { userId: v.string(), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const allowed = await aiAllowed(ctx, args.userId);
    const { page, isDone, continueCursor } = await ctx.db
      .query("items")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .paginate({ numItems: SYNC_BATCH, cursor: args.cursor });
    for (const item of page) {
      if (allowed) {
        if (item.embedding === undefined && item.embeddingVersion !== undefined)
          await ctx.db.patch(item._id, {
            embeddingVersion: undefined,
            embeddingAttempts: undefined,
          });
      } else if (
        item.embedding !== undefined ||
        item.embeddingVersion !== CURRENT_EMBEDDING_VERSION
      ) {
        await ctx.db.patch(item._id, {
          embedding: undefined,
          embeddingVersion: CURRENT_EMBEDDING_VERSION,
          embeddingAttempts: undefined,
        });
      }
    }
    if (!isDone) {
      await ctx.scheduler.runAfter(0, internal.aiConsent.syncEmbeddings, {
        userId: args.userId,
        cursor: continueCursor,
      });
    }
    return null;
  },
});
