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
import { liveOwner, requireUserId } from "./model/auth";
import {
  CURRENT_EMBEDDING_VERSION,
  EMBEDDING_SWEEP_PAGE,
} from "./model/embedding";

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
  if ((await liveOwner(ctx, userId)) === null) return false;
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
    if (args.itemId !== undefined) {
      const item = await ctx.db.get(args.itemId);
      if (item === null || item.userId !== args.userId) return false;
    }
    return await aiAllowed(ctx, args.userId);
  },
});

/** One snapshot for the whole page, immediately before provider inputs are built.
 * Deleting owners get empty slots so their rows cannot wedge the sweep. */
export const revalidateEmbeddingBatch = internalQuery({
  args: {
    entries: v.array(v.object({ itemId: v.id("items"), userId: v.string() })),
  },
  returns: v.array(
    v.object({
      itemId: v.id("items"),
      disposition: v.union(
        v.literal("allowed"),
        v.literal("declined"),
        v.literal("gone"),
      ),
    }),
  ),
  handler: async (ctx, { entries }) => {
    if (entries.length > EMBEDDING_SWEEP_PAGE)
      throw new Error("Too many embedding entries");
    type Disposition = "allowed" | "declined" | "gone";
    const owners = new Map<string, Disposition>();
    const results: {
      itemId: (typeof entries)[number]["itemId"];
      disposition: Disposition;
    }[] = [];
    for (const { itemId, userId } of entries) {
      const item = await ctx.db.get(itemId);
      if (item === null || item.userId !== userId) {
        results.push({ itemId, disposition: "gone" });
        continue;
      }
      let disposition = owners.get(userId);
      if (disposition === undefined) {
        const ownerId = ctx.db.normalizeId("users", userId);
        const owner = ownerId === null ? null : await ctx.db.get(ownerId);
        disposition =
          owner === null
            ? "gone"
            : (await aiAllowed(ctx, userId))
              ? "allowed"
              : "declined";
        owners.set(userId, disposition);
      }
      results.push({ itemId, disposition });
    }
    return results;
  },
});

/** Revalidate cached recommendation identities in one bounded transaction.
 * null aborts the run; an empty list is also used to authorize space embedding.
 * This check cannot recall requests dispatched before deletion begins. */
export const recommendationAllowed = internalQuery({
  args: {
    userId: v.string(),
    spaceId: v.id("spaces"),
    itemIds: v.array(v.id("items")),
  },
  returns: v.union(v.null(), v.array(v.id("items"))),
  handler: async (ctx, args) => {
    if (args.itemIds.length > 100) throw new Error("Too many candidates");
    const space = await ctx.db.get(args.spaceId);
    if (
      space === null ||
      space.userId !== args.userId ||
      !(await aiAllowed(ctx, args.userId))
    )
      return null;
    const surviving = [];
    for (const itemId of args.itemIds) {
      const item = await ctx.db.get(itemId);
      if (
        item !== null &&
        item.userId === args.userId &&
        item.status === "ready"
      )
        surviving.push(itemId);
    }
    return surviving;
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
