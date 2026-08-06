import type { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";

/**
 * Returns the authenticated user's stable id (the Convex Auth `users` table
 * document id, surfaced as the JWT `sub`), or throws. Every public function
 * derives its userId from this — never from an argument.
 *
 * Convex Auth issues JWTs whose `sub` claim is the `users` document id, so
 * `ctx.auth.getUserIdentity().subject` is the same value every table keys on.
 * This stays provider-agnostic: it works identically whether the user signed in
 * via OAuth or Anonymous.
 */
export async function requireUserId(
  ctx: QueryCtx | MutationCtx | ActionCtx,
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new Error("Not authenticated");
  }
  return identity.subject;
}
