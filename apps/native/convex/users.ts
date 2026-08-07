import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query } from "./_generated/server";

/**
 * Returns the currently signed-in user's id and email, or `null` when
 * unauthenticated. The client uses this for:
 *  - the profile screen (email display)
 *  - RevenueCat identity sync (`_id` is passed to `Purchases.logIn` so the
 *    webhook's `app_user_id` matches the `userId` every table keys on)
 *
 * `_id` is the same value `requireUserId` returns server-side, so passing it to
 * RevenueCat keeps the webhook mapping consistent. Only the two fields the
 * client needs are projected out — not the full auth document — so the contract
 * doesn't drift with Convex Auth's `users` schema (phone, verification state,
 * …).
 */
export const getCurrentUser = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      email: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (user === null) return null;
    return { _id: user._id, email: user.email };
  },
});
