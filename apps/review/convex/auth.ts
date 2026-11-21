import Resend from "@auth/core/providers/resend";
import { convexAuth } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { env } from "./_generated/server";
import { isStaffEmail } from "./model/access";
import { normalizeEmail } from "./model/rules";

async function claimInvites(
  ctx: MutationCtx,
  userId: Id<"users">,
  email: string,
) {
  const user = userId;
  const invites = await ctx.db
    .query("invites")
    .withIndex("by_email", (q) => q.eq("email", email))
    .take(100);
  for (const invite of invites) {
    const existing = await ctx.db
      .query("members")
      .withIndex("by_campaignId_and_userId", (q) =>
        q.eq("campaignId", invite.campaignId).eq("userId", user),
      )
      .unique();
    if (existing === null) {
      await ctx.db.insert("members", {
        campaignId: invite.campaignId,
        userId: user,
        role: invite.role,
      });
    }
    await ctx.db.delete("invites", invite._id);
  }
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Resend({
      from: env.REVIEW_EMAIL_FROM ?? "Shelvr Review <review@tryshelvr.app>",
    }),
  ],
  callbacks: {
    async createOrUpdateUser(genericCtx, args) {
      if (args.existingUserId) return args.existingUserId;
      const ctx = genericCtx as unknown as MutationCtx;
      const raw = args.profile.email;
      if (typeof raw !== "string") throw new Error("An email is required");
      const email = normalizeEmail(raw);
      const existing = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", email))
        .unique();
      if (existing) return existing._id;
      const invited = await ctx.db
        .query("invites")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
      if (invited === null && !isStaffEmail(email)) {
        throw new Error("This space is invite only");
      }
      return await ctx.db.insert("users", {
        email,
        emailVerificationTime: Date.now(),
      });
    },
    async afterUserCreatedOrUpdated(genericCtx, { userId }) {
      const ctx = genericCtx as unknown as MutationCtx;
      const user = await ctx.db.get("users", userId);
      if (user?.email) {
        await claimInvites(ctx, userId, normalizeEmail(user.email));
      }
    },
  },
});
