import { getAuthUserId } from "@convex-dev/auth/server";
import {
  env,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Returns the authenticated user's stable users-table id, or throws. Every
 * public function derives its userId from this — never from an argument.
 *
 * Convex Auth puts both the user id and session id in the JWT `sub` claim
 * (`userId|sessionId`). `getAuthUserId` removes the session suffix; using the
 * raw `identity.subject` would make ownership session-scoped and would not
 * match RevenueCat's user id or `getCurrentUser`.
 *
 * This stays provider-agnostic: it works identically whether the user signed in
 * via OAuth or Anonymous.
 */
export async function requireUserId(
  ctx: QueryCtx | MutationCtx | ActionCtx,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("Not authenticated");
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
