import { getAuthUserId } from "@convex-dev/auth/server";
import { env, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

const NOT_AUTHENTICATED = "Not authenticated";

/** Live owner row for a raw string id (webhook ids are untyped), or null if not a users id, gone, or deleting. */
export async function liveOwner(
  ctx: QueryCtx | MutationCtx,
  userId: string,
): Promise<Doc<"users"> | null> {
  const id = ctx.db.normalizeId("users", userId);
  if (id === null) return null;
  const user = await ctx.db.get(id);
  return user !== null && user.deleting !== true ? user : null;
}

/** Stable users-table id (JWT `sub` is `userId|sessionId`, so not `identity.subject`), or throws. */
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

const MAX_SENDER_NAME_CHARS = 40;

export async function senderFirstName(
  ctx: QueryCtx,
  userId: string,
): Promise<string | undefined> {
  const id = ctx.db.normalizeId("users", userId);
  const user = id === null ? null : await ctx.db.get(id);
  const first = user?.name?.trim().split(/\s+/)[0];
  if (!first || first.length > MAX_SENDER_NAME_CHARS || first.includes("@")) {
    return undefined;
  }
  return first;
}
