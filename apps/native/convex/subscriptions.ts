import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requireUserId } from "./model/auth";

export const subscriptionStatusValidator = v.union(
  v.literal("trialing"),
  v.literal("pro"),
  v.literal("lapsed"),
  v.literal("lifetime"),
);

export type SubscriptionStatus = "trialing" | "pro" | "lapsed" | "lifetime";

/**
 * Product ids (as configured in RevenueCat) that grant a lifetime (permanent,
 * non-expiring) entitlement instead of a time-limited subscription. A purchase
 * of one of these writes `status: "lifetime"` and a sentinel far-future expiry
 * so the existing `expiresAt > Date.now()` gates pass forever without a special
 * case in every read path. Add a product id here when you create a new lifetime
 * product in RevenueCat.
 */
const LIFETIME_PRODUCT_IDS = new Set<string>(["lifetime"]);

/**
 * Sentinel expiry for lifetime entitlements. ~1000 years from any plausible
 * `Date.now()` — far enough that the gate (`expiresAt > Date.now()`) is always
 * true, close enough to `Number.MAX_SAFE_INTEGER`'s scale that it won't
 * overflow any downstream arithmetic. NOT `Number.MAX_SAFE_INTEGER` itself, so
 * accidental `expiresAt + delta` stays finite.
 */
const LIFETIME_EXPIRES_AT = 33_000_000_000_000; // ~1035 years from epoch

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
  // Lifetime is permanently entitled — its sentinel expiry is far-future, but
  // check the status explicitly so a future schema change to the sentinel can't
  // accidentally gate a lifetime user.
  const active =
    sub.status === "lifetime" ||
    (sub.status !== "lapsed" && sub.expiresAt > Date.now());
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

    // A lifetime purchase never expires in RevenueCat's model, so once a row
    // is `lifetime` it is sticky against every OTHER event: a stray
    // CANCELLATION, an EXPIRATION (its own or an unrelated product's, since
    // this table is one row per user, not per-product), all preserved as-is.
    // Only a fresh lifetime purchase itself (`isLifetime`, checked below) may
    // touch status/expiresAt/productId again.
    const isLifetime =
      args.productId !== undefined && LIFETIME_PRODUCT_IDS.has(args.productId);
    const stickyLifetime = existing?.status === "lifetime" && !isLifetime;

    // Resolve the effective status: an explicit event status wins, otherwise
    // keep the existing row's status, otherwise default to `pro` (a first-ever
    // event with no trial signal is still an active paid period).
    const status: SubscriptionStatus = stickyLifetime
      ? "lifetime"
      : args.status ?? existing?.status ?? "pro";

    // Event-timestamp ordering: if this event is not newer than the stored one,
    // it's stale or a duplicate — drop it. Once a row has an ordering timestamp,
    // an event without one is also unsafe to apply because its age is unknown.
    if (
      existing !== null &&
      existing.eventTimestampMs !== undefined &&
      (args.eventTimestampMs === undefined ||
        args.eventTimestampMs <= existing.eventTimestampMs)
    ) {
      return null;
    }

    // If the event has no expiry and no existing row, there is nothing to
    // update — acknowledge without creating a row. EXCEPTION: a lifetime (non-
    // consumable) purchase reports `expiresAt: 0` because it never expires.
    // We detect it by product id and grant a far-future expiry so the server
    // gate (`expiresAt > Date.now()`) and the client's `entitled` both pass
    // forever. The product id must be the lifetime product configured in the
    // RevenueCat offering (see `LIFETIME_PRODUCT_IDS`).
    if (existing === null && args.expiresAt === 0 && !isLifetime) {
      return null;
    }

    // For an existing row, an event with no expiry preserves the current
    // expiresAt (e.g. a CANCELLATION that doesn't carry expiration_at_ms). A
    // lifetime purchase sets a sentinel far-future expiry instead. A sticky
    // lifetime row keeps its sentinel regardless of what this event carries
    // (e.g. an EXPIRATION for an unrelated product would otherwise overwrite
    // it with that product's — irrelevant — expiry).
    const expiresAt = isLifetime
      ? LIFETIME_EXPIRES_AT
      : stickyLifetime
        ? (existing?.expiresAt ?? LIFETIME_EXPIRES_AT)
        : args.expiresAt === 0
          ? (existing?.expiresAt ?? 0)
          : args.expiresAt;

    // Build the shared fields once. productId is only set on the insert path:
    // for an existing row it's optional and omitted-preserve is equivalent to
    // passing undefined, but the explicit object keeps both branches readable.
    // A sticky lifetime row keeps its productId too, for the same reason as
    // expiresAt above.
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
