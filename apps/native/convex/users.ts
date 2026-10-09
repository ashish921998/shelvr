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
import { requireUserId } from "./model/auth";
import { safeDeleteStorage } from "./model/storage";
import { revoke } from "./legalConsent";
import { appleTokenId, storeAppleToken } from "./model/appleTokens";
import { logEvent } from "./model/log";

/**
 * Returns the currently signed-in user's id and email, or `null` when
 * unauthenticated. The client uses this for:
 *  - the profile screen (email display)
 *  - RevenueCat identity sync (`_id` is passed to `Purchases.logIn` so the
 *    webhook's `app_user_id` matches the `userId` every table keys on)
 *
 * `_id` is the same value `requireUserId` returns server-side, so passing it to
 * RevenueCat keeps the webhook mapping consistent. Only the two fields the
 * client needs are projected out — not the full auth document — so the contract
 * doesn't drift with Convex Auth's `users` schema (phone, verification state,
 * …).
 */
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
    const user = await ctx.db.get(userId);
    if (user === null) return null;
    return { _id: user._id, email: user.email };
  },
});

/**
 * Deletes the currently authenticated user's Shelvr account and all owned data.
 *
 * Identity is always derived from Convex Auth — never from a client-supplied
 * user id. Cleanup covers:
 *  - items (and their image storage blobs)
 *  - space memberships
 *  - spaces
 *  - itemOperations (including pending upload storage)
 *  - onboardingDemos (the demo allowance row and its item reference)
 *  - subscriptions
 *  - cancelSurveys (the one-time cancel-survey ask row)
 *  - aiConsents (the AI processing answer)
 *  - appleTokens (the Sign in with Apple refresh token, revoked with Apple)
 *  - feedbackSubmissions (in-app feedback rows and their messages)
 *  - Convex Auth sessions, refresh tokens, accounts, and the users row
 *
 * Apple/Google subscriptions are NOT cancelled here; the client must warn the
 * user that subscription management remains an App Store action.
 *
 * Deletion is batched: each transaction removes at most `DELETE_BATCH` rows
 * per table and schedules a continuation for the rest, so a heavy account
 * cannot blow Convex's per-transaction limits and become undeletable. Small
 * accounts finish synchronously in this first call; large ones complete in
 * the background moments later. The auth identity is only removed by the
 * final batch, after all domain data is confirmed gone.
 */
export const deleteCurrentUserAccount = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    await revoke(ctx, userId, true);
    await scheduleAppleRevoke(ctx, userId);
    await deleteAccountBatch(ctx, userId);
    return null;
  },
});

const APPLE_TOKEN_MAX_LIFE_MS = 60 * 60_000;

/** Apple requires an app that offers Sign in with Apple to revoke the user's
 * token when the account is deleted. The job gets the token row's id, not the
 * token: job arguments stay readable in the dashboard long after they run.
 * The row is the one thing this deletion leaves behind, and the job removes
 * it once Apple has answered or the attempts run out. */
async function scheduleAppleRevoke(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  const tokenId = await appleTokenId(ctx, userId);
  if (tokenId !== null) {
    await ctx.scheduler.runAfter(0, internal.appleRevoke.revoke, { tokenId });
    // The action normally removes the row itself. A scheduled mutation is
    // the guarantee: it runs even if the action died before cleaning up, and
    // it is set past the action's last retry.
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

/** The refresh token the revoke job was pointed at, or null once it is gone. */
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

/** Stores the refresh token the native Apple sheet's code was traded for.
 * Internal-only: the sign-in that calls it has just verified the user. */
export const keepNativeAppleToken = internalMutation({
  args: {
    userId: v.id("users"),
    refreshToken: v.string(),
    clientId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // The account can be deleted while Apple is still answering.
    if ((await ctx.db.get(args.userId)) === null) return null;
    await storeAppleToken(ctx, args.userId, {
      refreshToken: args.refreshToken,
      clientId: args.clientId,
    });
    return null;
  },
});

/** Drops the token row once the revoke job has no further use for it. */
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

/** Continuation worker for batched account deletion. Internal-only: userId is
 * trusted here because the public mutation derived it from auth. */
export const processAccountDeletion = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await deleteAccountBatch(ctx, args.userId);
    return null;
  },
});

/** Max rows deleted from any one table per transaction. Small enough that a
 * pass (rows + their storage blobs) stays far under Convex transaction limits;
 * large enough that typical accounts finish in the first, synchronous pass. */
export const DELETE_BATCH = 100;

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

/** Deletes up to one batch of domain data keyed by the Convex Auth user id.
 * Returns true when everything is gone. Tables drain strictly in order —
 * memberships fully first so join rows never dangle mid-deletion — and a full
 * batch from any table ends the pass so the continuation resumes there.
 * Storage is deleted with the rows that reference it. */
async function deleteUserOwnedDataBatch(
  ctx: MutationCtx,
  userId: Id<"users"> | string,
): Promise<boolean> {
  const userKey = userId as string;

  // Capture tokens first, so Siri stops saving into the account the moment
  // deletion starts rather than after its saves have drained.
  if (!(await deleteCaptureTokensBatch(ctx, userId as Id<"users">)))
    return false;

  // Raw deletes on purpose: every spaceItems write normally goes through
  // model/memberships.ts to keep the space summary exact, but these spaces
  // are deleted in the same pass, so patching their counters would be waste.
  const memberships = await ctx.db
    .query("spaceItems")
    .withIndex("by_user", (q) => q.eq("userId", userKey))
    .take(DELETE_BATCH);
  for (const row of memberships) {
    await ctx.db.delete(row._id);
  }
  if (memberships.length === DELETE_BATCH) return false;

  const spaces = await ctx.db
    .query("spaces")
    .withIndex("by_user", (q) => q.eq("userId", userKey))
    .take(DELETE_BATCH);
  for (const space of spaces) {
    await ctx.db.delete(space._id);
  }
  if (spaces.length === DELETE_BATCH) return false;

  const items = await ctx.db
    .query("items")
    .withIndex("by_user", (q) => q.eq("userId", userKey))
    .take(DELETE_BATCH);
  for (const item of items) {
    if (item.storageId !== undefined) {
      await safeDeleteStorage(ctx, item.storageId);
    }
    await ctx.db.delete(item._id);
  }
  if (items.length === DELETE_BATCH) return false;

  // Pending rows may still hold an unfinalized upload — delete that storage.
  const operations = await ctx.db
    .query("itemOperations")
    .withIndex("by_user_operation", (q) => q.eq("userId", userKey))
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
    .withIndex("by_user", (q) => q.eq("userId", userKey))
    .take(DELETE_BATCH);
  for (const demo of demos) {
    await ctx.db.delete(demo._id);
  }
  if (demos.length === DELETE_BATCH) return false;

  const reads = await ctx.db
    .query("itemReads")
    .withIndex("by_user", (q) => q.eq("userId", userKey))
    .take(DELETE_BATCH);
  for (const read of reads) {
    await ctx.db.delete(read._id);
  }
  if (reads.length === DELETE_BATCH) return false;

  if (!(await deleteShareLinksBatch(ctx, userKey))) return false;

  const devices = await ctx.db
    .query("notificationDevices")
    .withIndex("by_user", (q) => q.eq("userId", userKey))
    .take(DELETE_BATCH);
  for (const device of devices) {
    await ctx.db.delete(device._id);
  }
  if (devices.length === DELETE_BATCH) return false;

  const preferences = await ctx.db
    .query("notificationPreferences")
    .withIndex("by_user", (q) => q.eq("userId", userKey))
    .take(DELETE_BATCH);
  for (const preference of preferences) {
    await ctx.db.delete(preference._id);
  }
  if (preferences.length === DELETE_BATCH) return false;

  if (!(await deleteSentNotificationsBatch(ctx, userKey))) return false;

  // Feedback rows hold the user's authored messages, so they drain with the
  // account. Deleting a row cannot retract an already-delivered inbox email
  // (see docs/architecture/feedback.md); it only removes the Convex copy.
  if (!(await deleteFeedbackBatch(ctx, userKey))) return false;

  // Does not cancel the App Store subscription — only the local entitlement row.
  const sub = await ctx.db
    .query("subscriptions")
    .withIndex("by_user", (q) => q.eq("userId", userKey))
    .unique();
  if (sub !== null) {
    await ctx.db.delete(sub._id);
  }

  await deleteAiConsent(ctx, userKey);

  // The cancel-survey ask row is user-owned state; drain it with the rest.
  const survey = await ctx.db
    .query("cancelSurveys")
    .withIndex("by_user", (q) => q.eq("userId", userKey))
    .unique();
  if (survey !== null) {
    await ctx.db.delete(survey._id);
  }
  return true;
}

async function deleteAiConsent(
  ctx: MutationCtx,
  userKey: string,
): Promise<void> {
  const row = await ctx.db
    .query("aiConsents")
    .withIndex("by_user", (q) => q.eq("userId", userKey))
    .unique();
  if (row !== null) {
    await ctx.db.delete(row._id);
  }
}

/** Deletes up to one batch each of the user's weekly digests and save
 * reminders. Returns true when both tables are drained for this user. */
async function deleteSentNotificationsBatch(
  ctx: MutationCtx,
  userKey: string,
): Promise<boolean> {
  const digests = await ctx.db
    .query("weeklyDigests")
    .withIndex("by_user", (q) => q.eq("userId", userKey))
    .take(DELETE_BATCH);
  for (const digest of digests) {
    await ctx.db.delete(digest._id);
  }
  if (digests.length === DELETE_BATCH) return false;
  const reminders = await ctx.db
    .query("saveReminders")
    .withIndex("by_user", (q) => q.eq("userId", userKey))
    .take(DELETE_BATCH);
  for (const reminder of reminders) {
    await ctx.db.delete(reminder._id);
  }
  return reminders.length !== DELETE_BATCH;
}

/** Deletes up to one batch of the user's feedback submissions. Returns true
 * when the table is fully drained for this user. Feedback rows hold the
 * user's authored messages, so they drain with the account; deleting a row
 * cannot retract an already-delivered inbox email
 * (see docs/architecture/feedback.md) — it only removes the Convex copy. */
async function deleteFeedbackBatch(
  ctx: MutationCtx,
  userKey: string,
): Promise<boolean> {
  const feedback = await ctx.db
    .query("feedbackSubmissions")
    .withIndex("by_user", (q) => q.eq("userId", userKey))
    .take(DELETE_BATCH);
  for (const submission of feedback) {
    await ctx.db.delete(submission._id);
  }
  return feedback.length !== DELETE_BATCH;
}

/** Deletes up to one batch of the user's Siri capture tokens. Returns true
 * when the table is fully drained for this user. */
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

/** Deletes up to one batch of the user's branded share links. Returns true
 * when the table is fully drained for this user. */
async function deleteShareLinksBatch(
  ctx: MutationCtx,
  userKey: string,
): Promise<boolean> {
  const links = await ctx.db
    .query("shareLinks")
    .withIndex("by_user", (q) => q.eq("userId", userKey))
    .take(DELETE_BATCH);
  for (const link of links) {
    await ctx.db.delete(link._id);
  }
  return links.length !== DELETE_BATCH;
}

/** Sessions (+ refresh tokens), accounts (+ verification codes), then users. */
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
