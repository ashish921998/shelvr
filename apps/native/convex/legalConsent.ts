import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUserId } from "./model/auth";
import { logEvent } from "./model/log";
import { TERMS_VERSION } from "./model/legalConsent";
import { MAX_SYNC_ATTEMPTS, deliversGrant } from "./legalConsentSync";

export const get = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      reviewedVersion: v.string(),
      acceptedVersion: v.optional(v.string()),
      acceptedAt: v.optional(v.number()),
      refundSharing: v.boolean(),
      syncPending: v.boolean(),
      syncFailed: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db
      .query("legalConsents")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!row) return null;
    return {
      reviewedVersion: row.reviewedVersion,
      acceptedVersion: row.acceptedVersion,
      acceptedAt: row.acceptedAt,
      refundSharing: row.refundSharing,
      syncPending: row.syncState !== "synced",
      syncFailed: row.syncState === "failed",
    };
  },
});

/** Only an explicit terms-review decision can establish consent. */
export const review = mutation({
  args: { version: v.literal(TERMS_VERSION), accepted: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { version, accepted }) => {
    const userId = await requireUserId(ctx);
    if (!(await ctx.db.get(userId))) throw new Error("Account unavailable");
    const existing = await ctx.db
      .query("legalConsents")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (existing?.deleting) throw new Error("Account unavailable");
    if (
      existing?.reviewedVersion === version &&
      existing.refundSharing === accepted
    )
      return null;
    const now = Date.now();
    const values = {
      reviewedVersion: version,
      ...(accepted ? { acceptedVersion: version, acceptedAt: now } : {}),
      refundSharing: accepted,
      changedAt: Math.max(now, (existing?.changedAt ?? 0) + 1),
    };
    if (existing) {
      await ctx.db.patch(existing._id, values);
      await queueSync(ctx, existing._id);
    } else {
      const id = await ctx.db.insert("legalConsents", {
        userId,
        ...values,
        syncState: "pending",
        nextSyncAt: now,
        attempts: 0,
      });
      await ctx.scheduler.runAfter(0, internal.legalConsentSync.send, { id });
    }
    return null;
  },
});

export const withdraw = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    await revoke(ctx, userId, false);
    return null;
  },
});

async function queueSync(ctx: MutationCtx, id: Id<"legalConsents">) {
  const row = await ctx.db.get(id);
  if (!row || row.syncState === "syncing") return;
  await ctx.db.patch(id, {
    syncState: "pending",
    nextSyncAt: Date.now(),
    attempts: 0,
  });
  await ctx.scheduler.runAfter(0, internal.legalConsentSync.send, { id });
}

export async function revoke(
  ctx: MutationCtx,
  userId: Id<"users">,
  deleting: boolean,
) {
  const row = await ctx.db
    .query("legalConsents")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (!row || (!deleting && !row.refundSharing)) return;
  await ctx.db.patch(row._id, {
    refundSharing: false,
    deleting,
    changedAt: Math.max(Date.now(), row.changedAt + 1),
  });
  await queueSync(ctx, row._id);
}

/** Recover pending delivery and workers that exceeded the action runtime. */
export const retry = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    for (const state of ["pending", "syncing"] as const) {
      const rows = await ctx.db
        .query("legalConsents")
        .withIndex("by_syncState_and_nextSyncAt", (q) =>
          q.eq("syncState", state).lte("nextSyncAt", now),
        )
        .take(50);
      for (const row of rows) {
        // A syncing row past its lease means the action died before finish
        // could spend the attempt — spend it here so crash-recovery loops
        // cannot retry for free forever (mirrors feedback delivery).
        const attempts = state === "syncing" ? row.attempts + 1 : row.attempts;
        // Recovery must not outlive the cap either: a grant that keeps
        // crashing before `finish` would otherwise burn attempts via this
        // path and stay retryable indefinitely.
        if (
          state === "syncing" &&
          deliversGrant(row) &&
          attempts >= MAX_SYNC_ATTEMPTS
        ) {
          await ctx.db.patch(row._id, {
            syncState: "failed",
            attempts,
            nextSyncAt: now,
          });
          logEvent("error", "refund_consent_sync_exhausted", {
            consent_id: row._id,
            attempts,
            via: "recovery",
          });
          continue;
        }
        await ctx.db.patch(row._id, {
          syncState: "pending",
          nextSyncAt: now,
          attempts,
        });
        await ctx.scheduler.runAfter(0, internal.legalConsentSync.send, {
          id: row._id,
        });
      }
    }
    return null;
  },
});
