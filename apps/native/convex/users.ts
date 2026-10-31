import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { liveOwner } from "./model/auth";
import { safeDeleteStorage } from "./model/storage";
import { revoke } from "./legalConsent";
import {
  APPLE_TOKEN_MAX_LIFE_MS,
  appleTokenId,
  storeAppleToken,
} from "./model/appleTokens";
import { takeWithinBytes } from "./model/readBudget";
import { logEvent } from "./model/log";
import { deletePlanSharesForUser } from "./planShares";

/** Null when unauthenticated or the account is being deleted. */
export const getCurrentUser = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      email: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await liveOwner(ctx, userId);
    if (user === null) return null;
    return { _id: user._id, email: user.email };
  },
});

export const deleteCurrentUserAccount = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (user === null) return null;
    if (user.deleting !== true) {
      await ctx.db.patch(user._id, { deleting: true });
      await revoke(ctx, user._id, true);
      await scheduleAppleRevoke(ctx, user._id);
    }
    await deleteAccountBatch(ctx, user._id);
    return null;
  },
});

async function scheduleAppleRevoke(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  const tokenId = await appleTokenId(ctx, userId);
  if (tokenId !== null) {
    await ctx.scheduler.runAfter(0, internal.appleRevoke.revoke, { tokenId });
    await ctx.scheduler.runAfter(
      APPLE_TOKEN_MAX_LIFE_MS,
      internal.users.forgetAppleToken,
      { tokenId },
    );
    return;
  }
  const appleAccount = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) =>
      q.eq("userId", userId).eq("provider", "apple"),
    )
    .first();
  if (appleAccount !== null) {
    logEvent("info", "apple_revoke_skipped", { code: "no_token" });
  }
}

export const appleTokenForRevoke = internalQuery({
  args: { tokenId: v.id("appleTokens") },
  returns: v.union(
    v.object({ refreshToken: v.string(), clientId: v.optional(v.string()) }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.tokenId);
    if (row === null) return null;
    return { refreshToken: row.refreshToken, clientId: row.clientId };
  },
});

export const detachedAppleTokenForRevoke = internalQuery({
  args: { tokenId: v.id("detachedAppleTokens") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    return (await ctx.db.get(args.tokenId))?.refreshToken ?? null;
  },
});

export const forgetDetachedAppleToken = internalMutation({
  args: { tokenId: v.id("detachedAppleTokens") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if ((await ctx.db.get(args.tokenId)) !== null) {
      await ctx.db.delete(args.tokenId);
    }
    return null;
  },
});

export const keepNativeAppleToken = internalMutation({
  args: {
    userId: v.id("users"),
    refreshToken: v.string(),
    clientId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    return await storeAppleToken(ctx, args.userId, {
      refreshToken: args.refreshToken,
      clientId: args.clientId,
    });
  },
});

export const forgetAppleToken = internalMutation({
  args: { tokenId: v.id("appleTokens") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if ((await ctx.db.get(args.tokenId)) !== null) {
      await ctx.db.delete(args.tokenId);
    }
    return null;
  },
});

export const processAccountDeletion = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await deleteAccountBatch(ctx, args.userId);
    return null;
  },
});

export const DELETE_BATCH = 100;

const DELETE_ITEM_READ_BYTES = 4 * 1024 * 1024;

async function deleteAccountBatch(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  const done = await deleteUserOwnedDataBatch(ctx, userId);
  if (!done) {
    await ctx.scheduler.runAfter(0, internal.users.processAccountDeletion, {
      userId,
    });
    return;
  }
  await deleteAuthIdentity(ctx, userId);
}

async function deleteUserOwnedDataBatch(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<boolean> {
  if (!(await deleteCaptureTokensBatch(ctx, userId))) return false;

  const memberships = await ctx.db
    .query("spaceItems")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(DELETE_BATCH);
  for (const row of memberships) {
    await ctx.db.delete(row._id);
  }
  if (memberships.length === DELETE_BATCH) return false;

  const spaces = await ctx.db
    .query("spaces")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(DELETE_BATCH);
  for (const space of spaces) {
    await ctx.db.delete(space._id);
  }
  if (spaces.length === DELETE_BATCH) return false;

  // Link saves can be ~100k chars each; stop on bytes to stay under Convex's 16 MiB transaction limit.
  const { rows: items, bytes: itemBytes } = await takeWithinBytes(
    ctx.db.query("items").withIndex("by_user", (q) => q.eq("userId", userId)),
    { maxRows: DELETE_BATCH, maxBytes: DELETE_ITEM_READ_BYTES },
  );
  for (const item of items) {
    if (item.storageId !== undefined) {
      await safeDeleteStorage(ctx, item.storageId);
    }
    await ctx.db.delete(item._id);
  }
  if (items.length === DELETE_BATCH || itemBytes >= DELETE_ITEM_READ_BYTES)
    return false;

  const operations = await ctx.db
    .query("itemOperations")
    .withIndex("by_user_operation", (q) => q.eq("userId", userId))
    .take(DELETE_BATCH);
  for (const op of operations) {
    if (op.storageId !== undefined) {
      await safeDeleteStorage(ctx, op.storageId);
    }
    await ctx.db.delete(op._id);
  }
  if (operations.length === DELETE_BATCH) return false;

  const demos = await ctx.db
    .query("onboardingDemos")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(DELETE_BATCH);
  for (const demo of demos) {
    await ctx.db.delete(demo._id);
  }
  if (demos.length === DELETE_BATCH) return false;

  const reads = await ctx.db
    .query("itemReads")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(DELETE_BATCH);
  for (const read of reads) {
    await ctx.db.delete(read._id);
  }
  if (reads.length === DELETE_BATCH) return false;

  if (!(await deleteSharingAndPlansBatch(ctx, userId))) return false;

  const devices = await ctx.db
    .query("notificationDevices")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(DELETE_BATCH);
  for (const device of devices) {
    await ctx.db.delete(device._id);
  }
  if (devices.length === DELETE_BATCH) return false;

  const preferences = await ctx.db
    .query("notificationPreferences")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(DELETE_BATCH);
  for (const preference of preferences) {
    await ctx.db.delete(preference._id);
  }
  if (preferences.length === DELETE_BATCH) return false;

  if (!(await deleteSentNotificationsBatch(ctx, userId))) return false;

  if (!(await deleteFeedbackBatch(ctx, userId))) return false;

  const sub = await ctx.db
    .query("subscriptions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (sub !== null) {
    await ctx.db.delete(sub._id);
  }

  await deleteAiConsent(ctx, userId);

  const survey = await ctx.db
    .query("cancelSurveys")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (survey !== null) {
    await ctx.db.delete(survey._id);
  }
  return true;
}

async function deleteAiConsent(
  ctx: MutationCtx,
  userId: string,
): Promise<void> {
  const row = await ctx.db
    .query("aiConsents")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (row !== null) {
    await ctx.db.delete(row._id);
  }
}

async function deleteSentNotificationsBatch(
  ctx: MutationCtx,
  userId: string,
): Promise<boolean> {
  const digests = await ctx.db
    .query("weeklyDigests")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(DELETE_BATCH);
  for (const digest of digests) {
    await ctx.db.delete(digest._id);
  }
  if (digests.length === DELETE_BATCH) return false;
  const reminders = await ctx.db
    .query("saveReminders")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(DELETE_BATCH);
  for (const reminder of reminders) {
    await ctx.db.delete(reminder._id);
  }
  return reminders.length !== DELETE_BATCH;
}

async function deleteFeedbackBatch(
  ctx: MutationCtx,
  userId: string,
): Promise<boolean> {
  const feedback = await ctx.db
    .query("feedbackSubmissions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(DELETE_BATCH);
  for (const submission of feedback) {
    await ctx.db.delete(submission._id);
  }
  return feedback.length !== DELETE_BATCH;
}

async function deleteCaptureTokensBatch(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<boolean> {
  const tokens = await ctx.db
    .query("captureTokens")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(DELETE_BATCH);
  for (const token of tokens) {
    await ctx.db.delete(token._id);
  }
  return tokens.length !== DELETE_BATCH;
}

async function deleteSharingAndPlansBatch(
  ctx: MutationCtx,
  userId: string,
): Promise<boolean> {
  return (
    (await deleteShareLinksBatch(ctx, userId)) &&
    (await deletePlaceVisitsBatch(ctx, userId)) &&
    (await deletePlaceRemovalsBatch(ctx, userId)) &&
    (await deleteTripsBatch(ctx, userId)) &&
    (await deleteTripPlansBatch(ctx, userId)) &&
    (await deletePlanSharesForUser(ctx, userId))
  );
}

async function deleteShareLinksBatch(
  ctx: MutationCtx,
  userId: string,
): Promise<boolean> {
  const links = await ctx.db
    .query("shareLinks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(DELETE_BATCH);
  for (const link of links) {
    await ctx.db.delete(link._id);
  }
  return links.length !== DELETE_BATCH;
}

async function deletePlaceRemovalsBatch(
  ctx: MutationCtx,
  userId: string,
): Promise<boolean> {
  const rows = await ctx.db
    .query("placeRemovals")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(DELETE_BATCH);
  for (const row of rows) await ctx.db.delete(row._id);
  return rows.length !== DELETE_BATCH;
}

async function deletePlaceVisitsBatch(
  ctx: MutationCtx,
  userId: string,
): Promise<boolean> {
  const visits = await ctx.db
    .query("placeVisits")
    .withIndex("by_user_and_visited", (q) => q.eq("userId", userId))
    .take(DELETE_BATCH);
  for (const visit of visits) {
    await ctx.db.delete(visit._id);
  }
  return visits.length !== DELETE_BATCH;
}

async function deleteTripsBatch(
  ctx: MutationCtx,
  userId: string,
): Promise<boolean> {
  const trips = await ctx.db
    .query("trips")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(DELETE_BATCH);
  for (const trip of trips) {
    await ctx.db.delete(trip._id);
  }
  return trips.length !== DELETE_BATCH;
}

/** Stops first, so no stop outlives its trip between passes. */
async function deleteTripPlansBatch(
  ctx: MutationCtx,
  userId: string,
): Promise<boolean> {
  const stops = await ctx.db
    .query("tripStops")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(DELETE_BATCH);
  for (const stop of stops) {
    await ctx.db.delete(stop._id);
  }
  if (stops.length === DELETE_BATCH) return false;
  const plans = await ctx.db
    .query("tripPlans")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(DELETE_BATCH);
  for (const plan of plans) {
    await ctx.db.delete(plan._id);
  }
  return plans.length !== DELETE_BATCH;
}

async function deleteAuthIdentity(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  const sessions = await ctx.db
    .query("authSessions")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .collect();
  for (const session of sessions) {
    const tokens = await ctx.db
      .query("authRefreshTokens")
      .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
      .collect();
    for (const token of tokens) {
      await ctx.db.delete(token._id);
    }
    await ctx.db.delete(session._id);
  }

  const accounts = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
    .collect();
  for (const account of accounts) {
    const codes = await ctx.db
      .query("authVerificationCodes")
      .withIndex("accountId", (q) => q.eq("accountId", account._id))
      .collect();
    for (const code of codes) {
      await ctx.db.delete(code._id);
    }
    await ctx.db.delete(account._id);
  }

  const user = await ctx.db.get(userId);
  if (user !== null) {
    await ctx.db.delete(userId);
  }
}
