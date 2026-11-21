import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "../_generated/dataModel";
import { env, type QueryCtx } from "../_generated/server";
import { normalizeEmail, parseStaffEmails, type Role } from "./rules";

export async function currentUser(ctx: QueryCtx): Promise<Doc<"users"> | null> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  return await ctx.db.get("users", userId);
}

export async function requireUser(ctx: QueryCtx): Promise<Doc<"users">> {
  const user = await currentUser(ctx);
  if (user === null) throw new Error("Sign in first");
  return user;
}

export function isStaffEmail(email: string | undefined): boolean {
  if (!email) return false;
  return parseStaffEmails(env.REVIEW_STAFF_EMAILS).has(normalizeEmail(email));
}

export async function membership(
  ctx: QueryCtx,
  campaignId: Id<"campaigns">,
  userId: Id<"users">,
): Promise<Doc<"members"> | null> {
  return await ctx.db
    .query("members")
    .withIndex("by_campaignId_and_userId", (q) =>
      q.eq("campaignId", campaignId).eq("userId", userId),
    )
    .unique();
}

export async function viewerRole(
  ctx: QueryCtx,
  campaignId: Id<"campaigns">,
): Promise<{ user: Doc<"users">; role: Role } | null> {
  const user = await currentUser(ctx);
  if (user === null) return null;
  const member = await membership(ctx, campaignId, user._id);
  if (member === null) return null;
  return { user, role: member.role };
}

export async function requireMember(
  ctx: QueryCtx,
  campaignId: Id<"campaigns">,
): Promise<{ user: Doc<"users">; role: Role }> {
  const viewer = await viewerRole(ctx, campaignId);
  if (viewer === null) throw new Error("You are not in this campaign");
  return viewer;
}

export async function requireAdmin(
  ctx: QueryCtx,
  campaignId: Id<"campaigns">,
): Promise<Doc<"users">> {
  const viewer = await requireMember(ctx, campaignId);
  if (viewer.role !== "admin") throw new Error("Only admins can do that");
  return viewer.user;
}

export function displayName(user: Doc<"users"> | null): string {
  if (user === null) return "Former member";
  return user.name ?? user.email?.split("@")[0] ?? "Member";
}
