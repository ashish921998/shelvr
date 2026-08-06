import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requireUserId } from "./model/auth";
import { isEntitled, type SubscriptionStatus } from "./model/entitlement";

export const subscriptionStatusValidator = v.union(
  v.literal("trialing"),
  v.literal("pro"),
  v.literal("lapsed"),
  v.literal("lifetime"),
);

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
  if (!isEntitled(sub.status, sub.expiresAt, Date.now())) {
    throw new Error(PRO_REQUIRED);
  }
}

/**
 * Written by the RevenueCat webhook (`http.ts`). Lifetime-ness is decided once
 * at the webhook edge (from the product id) and arrives here as
 * `status: "lifetime"`; this handler never inspects product ids.
 *
 * Idempotent per user using the RevenueCat `event_timestamp_ms` as the ordering
 * key: a repeat or stale event whose `eventTimestampMs` is not newer than the
 * stored row's is dropped, so a reordered/duplicate webhook delivery never
 * downgrades an active subscriber. Newer events CAN move expiry in either
 * direction (e.g. a refund shortens the period).
 *
 * `status` is optional — when omitted (e.g. a CANCELLATION that still has
 * access until period end) the existing status is preserved and only
 * `expiresAt` is refreshed. When `expiresAt` is 0 and no existing row is found,
 * the event is acknowledged but no row is created (there is nothing to lapse).
 */
export const upsertSubscription = internalMutation({
  args: {
    userId: v.string(),
    status: v.optional(subscriptionStatusValidator),
    expiresAt: v.number(),
    productId: v.optional(v.string()),
    eventTimestampMs: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    // Stale/duplicate event? Drop it before doing anything else — cheapest exit.
    // Once a row has an ordering timestamp, an event without one is also unsafe
    // to apply because its age is unknown.
    if (
      existing !== null &&
      existing.eventTimestampMs !== undefined &&
      (args.eventTimestampMs === undefined ||
        args.eventTimestampMs <= existing.eventTimestampMs)
    ) {
      return null;
    }

    // A lifetime row is sticky: once `lifetime`, no later event changes it — a
    // stray CANCELLATION or an EXPIRATION for an unrelated product (this table
    // is one row per user, not per-product) is preserved as-is. The webhook
    // edge already decided lifetime-ness, so a fresh lifetime purchase arrives
    // as `status: "lifetime"`.
    const stickyLifetime =
      existing?.status === "lifetime" && args.status !== "lifetime";

    const status: SubscriptionStatus = stickyLifetime
      ? "lifetime"
      : (args.status ?? existing?.status ?? "pro");

    // Nothing to record: an event with no expiry and no prior state (e.g. a
    // CANCELLATION for a user who never subscribed). A lifetime purchase is
    // exempt — it reports `expiresAt: 0` (non-renewing) but is a real entitlement.
    if (existing === null && args.expiresAt === 0 && status !== "lifetime") {
      return null;
    }

    // A sticky lifetime row keeps its expiry; an event with no expiry (0)
    // preserves the existing row's expiry (e.g. CANCELLATION); otherwise the
    // event's expiry wins. Lifetime gates check `status` explicitly, so its
    // stored `expiresAt` value is irrelevant.
    const expiresAt = stickyLifetime
      ? (existing?.expiresAt ?? 0)
      : args.expiresAt === 0 && existing !== null
        ? existing.expiresAt
        : args.expiresAt;

    const doc = {
      status,
      expiresAt,
      ...(!stickyLifetime && args.productId !== undefined
        ? { productId: args.productId }
        : {}),
      ...(args.eventTimestampMs !== undefined
        ? { eventTimestampMs: args.eventTimestampMs }
        : {}),
      updatedAt: Date.now(),
    };

    if (existing !== null) {
      await ctx.db.patch(existing._id, doc);
      return null;
    }

    await ctx.db.insert("subscriptions", { userId: args.userId, ...doc });
    return null;
  },
});
