import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUserId } from "./model/auth";

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
 *  - subscriptions
 *  - Convex Auth sessions, refresh tokens, accounts, and the users row
 *
 * Apple/Google subscriptions are NOT cancelled here; the client must warn the
 * user that subscription management remains an App Store action.
 */
export const deleteCurrentUserAccount = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    await deleteUserOwnedData(ctx, userId);
    await deleteAuthIdentity(ctx, userId);
    return null;
  },
});

/** Domain data keyed by the Convex Auth user id. Memberships go first so join
 * rows never dangle; storage is deleted with the rows that reference it. */
async function deleteUserOwnedData(
  ctx: MutationCtx,
  userId: Id<"users"> | string,
): Promise<void> {
  const userKey = userId as string;

  const memberships = await ctx.db
    .query("spaceItems")
    .withIndex("by_user", (q) => q.eq("userId", userKey))
    .collect();
  for (const row of memberships) {
    await ctx.db.delete(row._id);
  }

  const spaces = await ctx.db
    .query("spaces")
    .withIndex("by_user", (q) => q.eq("userId", userKey))
    .collect();
  for (const space of spaces) {
    await ctx.db.delete(space._id);
  }

  const items = await ctx.db
    .query("items")
    .withIndex("by_user", (q) => q.eq("userId", userKey))
    .collect();
  for (const item of items) {
    if (item.storageId !== undefined) {
      await safeDeleteStorage(ctx, item.storageId);
    }
    await ctx.db.delete(item._id);
  }

  // Pending rows may still hold an unfinalized upload — delete that storage.
  const operations = await ctx.db
    .query("itemOperations")
    .withIndex("by_user_operation", (q) => q.eq("userId", userKey))
    .collect();
  for (const op of operations) {
    if (op.storageId !== undefined) {
      await safeDeleteStorage(ctx, op.storageId);
    }
    await ctx.db.delete(op._id);
  }

  // Does not cancel the App Store subscription — only the local entitlement row.
  const sub = await ctx.db
    .query("subscriptions")
    .withIndex("by_user", (q) => q.eq("userId", userKey))
    .unique();
  if (sub !== null) {
    await ctx.db.delete(sub._id);
  }
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

/** Missing blobs must not wedge account deletion. */
async function safeDeleteStorage(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
): Promise<void> {
  const exists = await ctx.db.system.get("_storage", storageId);
  if (exists !== null) {
    await ctx.storage.delete(storageId);
  }
}
