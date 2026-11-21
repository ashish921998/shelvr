import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { isStaffEmail } from "./access";
import { normalizeEmail } from "./rules";

async function claimInvites(
  ctx: MutationCtx,
  userId: Id<"users">,
  email: string,
) {
  const invites = await ctx.db
    .query("invites")
    .withIndex("by_email", (q) => q.eq("email", email))
    .take(100);
  for (const invite of invites) {
    const existing = await ctx.db
      .query("members")
      .withIndex("by_campaignId_and_userId", (q) =>
        q.eq("campaignId", invite.campaignId).eq("userId", userId),
      )
      .unique();
    if (existing === null) {
      await ctx.db.insert("members", {
        campaignId: invite.campaignId,
        userId,
        role: invite.role,
      });
    }
    await ctx.db.delete("invites", invite._id);
  }
}

export async function signInUser(
  ctx: MutationCtx,
  {
    existingUserId,
    email: raw,
  }: { existingUserId: Id<"users"> | null; email: unknown },
): Promise<Id<"users">> {
  if (typeof raw !== "string") throw new Error("An email is required");
  const email = normalizeEmail(raw);
  let userId = existingUserId;
  if (userId === null) {
    const existing = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    userId = existing?._id ?? null;
  }
  if (userId === null) {
    const invited = await ctx.db
      .query("invites")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (invited === null && !isStaffEmail(email)) {
      throw new Error("This space is invite only");
    }
    userId = await ctx.db.insert("users", {
      email,
      emailVerificationTime: Date.now(),
    });
  }
  await claimInvites(ctx, userId, email);
  return userId;
}
