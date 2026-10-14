import type { ConvexAuthConfig } from "@convex-dev/auth/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { liveOwner } from "./auth";

/** How long a token row may outlive its revoke job's first attempt. Past the
 * job's last retry, so a scheduled forget only cleans up after a job that
 * died. */
export const APPLE_TOKEN_MAX_LIFE_MS = 60 * 60_000;

type AfterUserSaved = NonNullable<
  NonNullable<ConvexAuthConfig["callbacks"]>["afterUserCreatedOrUpdated"]
>;

async function tokenRow(ctx: MutationCtx, userId: Id<"users">) {
  return await ctx.db
    .query("appleTokens")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

/**
 * Moves the refresh token `normalizeAppleProfile` attached to the profile off
 * the users row Convex Auth just wrote it to, into `appleTokens`. Same
 * transaction, so the users row is never stored with it.
 *
 * When storing is refused — the sign-in landed while the owner row was
 * already `deleting` — the token must not be dropped unrevoked. A mutation
 * cannot call Apple, so it is parked in `detachedAppleTokens` and the revoke
 * job gets that row's id, never the token, like the deletion path's job.
 */
export const keepAppleRefreshToken = async (
  authCtx: Parameters<AfterUserSaved>[0],
  {
    userId,
    profile,
  }: Pick<Parameters<AfterUserSaved>[1], "userId" | "profile">,
) => {
  const refreshToken = profile.appleRefreshToken;
  if (typeof refreshToken !== "string") return;
  const ctx = authCtx as unknown as MutationCtx;
  const user = userId as Id<"users">;
  await ctx.db.patch(user, { appleRefreshToken: undefined });
  const stored = await storeAppleToken(ctx, user, { refreshToken });
  if (!stored) {
    const tokenId = await ctx.db.insert("detachedAppleTokens", {
      refreshToken,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.appleRevoke.revokeDetachedToken, {
      tokenId,
    });
    await ctx.scheduler.runAfter(
      APPLE_TOKEN_MAX_LIFE_MS,
      internal.users.forgetDetachedAppleToken,
      { tokenId },
    );
  }
};

/**
 * Keeps one refresh token per user, the latest. `clientId` is the bundle id a
 * native-sheet token was issued to; a web-flow token leaves it unset, which
 * also clears the one an earlier native sign-in stored.
 *
 * Nothing is written for an owner that is missing or deleting. Deletion
 * schedules the revoke job against the row that exists at that moment;
 * replacing or recreating the row afterwards would leave a token Apple is
 * never asked to revoke. `appleTokenId` and the revoke job's own reads keep
 * working on the retained row regardless of the owner's state.
 */
export async function storeAppleToken(
  ctx: MutationCtx,
  userId: Id<"users">,
  token: { refreshToken: string; clientId?: string },
) {
  if ((await liveOwner(ctx, userId)) === null) return false;
  const existing = await tokenRow(ctx, userId);
  const values = {
    refreshToken: token.refreshToken,
    clientId: token.clientId,
    updatedAt: Date.now(),
  };
  if (existing === null) {
    await ctx.db.insert("appleTokens", { userId, ...values });
  } else {
    await ctx.db.patch(existing._id, values);
  }
  return true;
}

/** The id of the user's stored refresh token row, or null. The row outlives
 * the account until the revoke job has used it, so the token itself never
 * travels in a scheduled job's arguments. */
export async function appleTokenId(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Id<"appleTokens"> | null> {
  return (await tokenRow(ctx, userId))?._id ?? null;
}
