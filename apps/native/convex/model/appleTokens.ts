import type { ConvexAuthConfig } from "@convex-dev/auth/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

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
  const existing = await tokenRow(ctx, user);
  const values = { refreshToken, updatedAt: Date.now() };
  if (existing === null) {
    await ctx.db.insert("appleTokens", { userId: user, ...values });
  } else {
    await ctx.db.patch(existing._id, values);
  }
};

/** Removes and returns the user's stored refresh token, or null. */
export async function takeAppleRefreshToken(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<string | null> {
  const row = await tokenRow(ctx, userId);
  if (row === null) return null;
  await ctx.db.delete(row._id);
  return row.refreshToken;
}
