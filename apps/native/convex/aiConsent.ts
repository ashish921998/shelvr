import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  type QueryCtx,
} from "./_generated/server";
import { AI_CONSENT_VERSION } from "./model/aiConsent";
import { liveOwner, authedMutation, authedQuery } from "./model/auth";
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

/** Only an explicit Allow lets content go to Gemini; an account that never answered is treated as declined. */
export async function aiAllowed(
  ctx: QueryCtx,
  userId: string,
): Promise<boolean> {
  if ((await liveOwner(ctx, userId)) === null) return false;
  return (await consentRow(ctx, userId))?.status === "granted";
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
          owner !== null && (await aiAllowed(ctx, userId))
            ? "allowed"
            : "declined";
        owners.set(userId, disposition);
      }
      results.push({ itemId, disposition });
    }
    return results;
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
