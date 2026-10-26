import type { ConvexAuthConfig } from "@convex-dev/auth/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { liveOwner } from "./auth";

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

export async function appleTokenId(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Id<"appleTokens"> | null> {
  return (await tokenRow(ctx, userId))?._id ?? null;
}
