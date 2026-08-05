import { v } from "convex/values";
import { query, internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requireUserId } from "./model/auth";

export const subscriptionStatusValidator = v.union(
  v.literal("trialing"),
  v.literal("pro"),
  v.literal("lapsed"),
);

export type SubscriptionStatus = "trialing" | "pro" | "lapsed";

/**
 * The entitlement a client renders. `status` is the stored subscription state
 * (or `"none"` if the user has never started a trial); `expiresAt` is the raw
 * stored period end. The client computes `entitled` from `expiresAt` against
 * its own clock — this query deliberately does NOT read the wall clock, because
 * queries are not rerun as time advances and a `Date.now()` read here would go
 * stale at the exact trial-expiry moment. The server re-checks expiry with
 * `Date.now()` inside gated mutations (see {@link requireProEntitlement}), so
 * the client's slightly-stale view can never grant access the server denies.
 */
export const getEntitlement = query({
  args: {},
  returns: v.object({
    status: v.union(subscriptionStatusValidator, v.literal("none")),
    expiresAt: v.optional(v.number()),
  }),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (sub === null) {
      return { status: "none" as const };
    }
    return { status: sub.status, expiresAt: sub.expiresAt };
  },
});

/** Sentinel error string the client recognizes to present the paywall instead
 * of a generic failure. Kept as a stable literal so client/server agree. */
export const PRO_REQUIRED = "Pro required";

/**
 * Server-side entitlement gate for Pro mutations. Reads the wall clock
 * (`Date.now()` is allowed in mutations) so a trial that expired between the
 * client's last fetch and this call is correctly rejected — the client's
 * `entitled` is advisory; this is the source of truth. Throws {@link PRO_REQUIRED}
 * when the user has no active trial or subscription.
 *
 * Pass the `userId` already derived via `requireUserId` so this never performs
 * a second auth lookup.
 */
export async function requireProEntitlement(
  ctx: MutationCtx,
  userId: string,
): Promise<void> {
  const sub = await ctx.db
    .query("subscriptions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (sub === null) {
    throw new Error(PRO_REQUIRED);
  }
  const active = sub.status !== "lapsed" && sub.expiresAt > Date.now();
  if (!active) {
    throw new Error(PRO_REQUIRED);
  }
}

/**
 * Written by the RevenueCat webhook (`http.ts`). Idempotent per user: a repeat
 * or stale event cannot regress a row whose expiry is already further out, so
 * a reordered/duplicate webhook delivery never downgrades an active subscriber.
 * `status` is optional — when omitted (e.g. a CANCELLATION event that still has
 * access until period end) the existing status is preserved and only `expiresAt`
 * is refreshed.
 */
export const upsertSubscription = internalMutation({
  args: {
    userId: v.string(),
    status: v.optional(subscriptionStatusValidator),
    expiresAt: v.number(),
    productId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    // Resolve the effective status: an explicit event status wins, otherwise
    // keep the existing row's status, otherwise default to `pro` (a first-ever
    // event with no trial signal is still an active paid period).
    const status: SubscriptionStatus = args.status ?? existing?.status ?? "pro";

    if (existing !== null) {
      // Never let an older event shorten the period. Equal-expiry events still
      // apply so an EXPIRATION can close the period it refers to.
      if (args.expiresAt < existing.expiresAt) {
        return null;
      }
      await ctx.db.patch(existing._id, {
        status,
        expiresAt: args.expiresAt,
        ...(args.productId !== undefined ? { productId: args.productId } : {}),
        updatedAt: Date.now(),
      });
      return null;
    }

    await ctx.db.insert("subscriptions", {
      userId: args.userId,
      status,
      expiresAt: args.expiresAt,
      productId: args.productId,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Read the stored subscription row for a user, or null. Used by the webhook
 * handler to resolve the current status for events (like CANCELLATION) that
 * preserve the existing status. */
export const getSubscriptionInternal = internalQuery({
  args: { userId: v.string() },
  returns: v.union(
    v.object({
      status: subscriptionStatusValidator,
      expiresAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (sub === null) {
      return null;
    }
    return { status: sub.status, expiresAt: sub.expiresAt };
  },
});
