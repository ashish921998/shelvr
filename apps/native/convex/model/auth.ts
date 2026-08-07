import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";
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
