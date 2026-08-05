import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
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
 * Written by the RevenueCat webhook (`http.ts`). Idempotent per user using the
 * RevenueCat `event_timestamp_ms` as the ordering key: a repeat or stale event
 * whose `eventTimestampMs` is not newer than the stored row's is dropped, so a
 * reordered/duplicate webhook delivery never downgrades an active subscriber.
 * Newer events CAN move expiry in either direction (e.g. a refund shortens the
 * period), unlike the old `expiresAt`-based comparison that rejected any
 * shortening.
 *
 * `status` is optional — when omitted (e.g. a CANCELLATION event that still has
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

    // Resolve the effective status: an explicit event status wins, otherwise
    // keep the existing row's status, otherwise default to `pro` (a first-ever
    // event with no trial signal is still an active paid period).
    const status: SubscriptionStatus = args.status ?? existing?.status ?? "pro";

    // Event-timestamp ordering: if this event is not newer than the stored one,
    // it's stale or a duplicate — drop it. When no event timestamp is available
    // (legacy events or older rows), fall back to accepting the event (the
    // old behavior) so we don't block legitimate updates.
    if (
      existing !== null &&
      args.eventTimestampMs !== undefined &&
      existing.eventTimestampMs !== undefined &&
      args.eventTimestampMs <= existing.eventTimestampMs
    ) {
      return null;
    }

    // If the event has no expiry and no existing row, there is nothing to
    // update — acknowledge without creating a row.
    if (existing === null && args.expiresAt === 0) {
      return null;
    }

    // For an existing row, an event with no expiry preserves the current
    // expiresAt (e.g. a CANCELLATION that doesn't carry expiration_at_ms).
    const expiresAt =
      args.expiresAt === 0 ? (existing?.expiresAt ?? 0) : args.expiresAt;

    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        status,
        expiresAt,
        ...(args.productId !== undefined ? { productId: args.productId } : {}),
        ...(args.eventTimestampMs !== undefined
          ? { eventTimestampMs: args.eventTimestampMs }
          : {}),
        updatedAt: Date.now(),
      });
      return null;
    }

    await ctx.db.insert("subscriptions", {
      userId: args.userId,
      status,
      expiresAt,
      productId: args.productId,
      ...(args.eventTimestampMs !== undefined
        ? { eventTimestampMs: args.eventTimestampMs }
        : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});


