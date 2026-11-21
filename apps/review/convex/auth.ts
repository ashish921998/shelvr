import Resend from "@auth/core/providers/resend";
import { convexAuth } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { env } from "./_generated/server";
import { signInUser } from "./model/signUp";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Resend({
      from: env.REVIEW_EMAIL_FROM ?? "Shelvr Review <review@tryshelvr.app>",
    }),
  ],
  callbacks: {
    async createOrUpdateUser(genericCtx, args) {
      return await signInUser(genericCtx as unknown as MutationCtx, {
        existingUserId: (args.existingUserId as Id<"users"> | null) ?? null,
        email: args.profile.email,
      });
    },
  },
});
