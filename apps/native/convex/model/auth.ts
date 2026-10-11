import { getAuthUserId } from "@convex-dev/auth/server";
import { env, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

const NOT_AUTHENTICATED = "Not authenticated";

/**
 * Whether a users row may still own data: it exists and account deletion has
 * not started on it. The one definition every fence in the backend shares.
 */
export function isLiveOwner(
  user: Doc<"users"> | null | undefined,
): user is Doc<"users"> {
  return user !== null && user !== undefined && user.deleting !== true;
}

/**
 * The live owner row behind `userId`, or null when the id is not a users id,
 * the row is gone, or deletion has begun. Takes the raw string form because
 * webhook app user ids and the string `userId` columns are not typed ids.
 */
export async function liveOwner(
  ctx: QueryCtx | MutationCtx,
  userId: string,
): Promise<Doc<"users"> | null> {
  const id = ctx.db.normalizeId("users", userId);
  if (id === null) return null;
  const user = await ctx.db.get(id);
  return isLiveOwner(user) ? user : null;
}

/**
 * Returns the authenticated user's stable users-table id, or throws. Every
 * public function derives its userId from this — never from an argument.
 *
 * Convex Auth puts both the user id and session id in the JWT `sub` claim
 * (`userId|sessionId`). `getAuthUserId` removes the session suffix; using the
 * raw `identity.subject` would make ownership session-scoped and would not
 * match RevenueCat's user id or `getCurrentUser`.
 *
 * A valid JWT is not enough on its own: the owner row must still be live.
 * Account deletion marks the row in its first transaction, so a retained
 * token on another device stops authorizing the moment deletion starts, not
 * only once the batched cleanup reaches the auth tables. The rejection is the
 * same unauthenticated error either way.
 *
 * This stays provider-agnostic: it works identically whether the user signed in
 * via OAuth or Anonymous. Query and mutation contexts only: an action derives
 * the caller through the internal mutation or query it runs (Convex forwards
 * the caller's identity to it), so the authorization and the write stay in one
 * transaction.
 */
export async function requireUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error(NOT_AUTHENTICATED);
  }
  if ((await liveOwner(ctx, userId)) === null) {
    throw new Error(NOT_AUTHENTICATED);
  }
  return userId;
}

export async function isDevelopmentAnonymousUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<boolean> {
  if (env.AUTH_ENABLE_ANONYMOUS !== "true") return false;
  const account = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) =>
      q.eq("userId", userId).eq("provider", "anonymous"),
    )
    .unique();
  return account !== null;
}
