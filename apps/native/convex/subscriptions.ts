import { v } from "convex/values";
import { query, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { isDevelopmentAnonymousUser, requireUserId } from "./model/auth";
import {
  isEntitled,
  isEntitledStatus,
  type SubscriptionStatus,
} from "./model/entitlement";
import { saveError } from "./model/saveErrors";

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
    if (await isDevelopmentAnonymousUser(ctx, userId)) {
      return { status: "lifetime" as const };
    }
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

/**
 * Server-side entitlement gate for Pro mutations. Reads the wall clock
 * (`Date.now()` is allowed in mutations) so a trial that expired between the
 * client's last fetch and this call is correctly rejected — the client's
 * `entitled` is advisory; this is the source of truth. Throws
 * {@link saveError}`("pro_required")` when the user has no active trial or
 * subscription, which the client decodes to present the paywall instead of a
 * generic failure.
 *
 * Pass the `userId` already derived via `requireUserId` so this never performs
 * a second auth lookup.
 */
export async function requireProEntitlement(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  if (!(await hasProEntitlement(ctx, userId))) {
    throw saveError("pro_required");
  }
}

/**
 * The same rule as {@link requireProEntitlement}, as a boolean. Mutations
 * whose core write must succeed for every user can use this to skip a
 * Pro-only side effect. Reads the wall clock, so it is mutation-only;
 * queries use {@link hasProEntitlementAt} with a client-supplied clock,
 * or {@link hasProEntitlementStatus} when no clock is available.
 */
export async function hasProEntitlement(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<boolean> {
  return await hasProEntitlementAt(ctx, userId, Date.now());
}

/** The caller's one subscription row, or null when they never started one. */
async function subscriptionFor(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"subscriptions"> | null> {
  return await ctx.db
    .query("subscriptions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

/** Query-safe entitlement check. The caller supplies the current client time. */
export async function hasProEntitlementAt(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  now: number,
): Promise<boolean> {
  if (await isDevelopmentAnonymousUser(ctx, userId)) return true;
  const sub = await subscriptionFor(ctx, userId);
  return sub !== null && isEntitled(sub.status, sub.expiresAt, now);
}

/**
 * Clock-free entitlement check for the legacy callers that predate the
 * client-supplied `now` argument. The RevenueCat webhook marks the stored
 * status `lapsed` when a subscription actually expires, so the status
 * alone gates those callers without reading the wall clock. Unlike
 * {@link hasProEntitlementAt}, a period that has ended but whose webhook
 * event has not landed yet still reads as entitled — the rollout window
 * where installed builds keep their widget instead of losing it.
 */
export async function hasProEntitlementStatus(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<boolean> {
  if (await isDevelopmentAnonymousUser(ctx, userId)) return true;
  const sub = await subscriptionFor(ctx, userId);
  return sub !== null && isEntitledStatus(sub.status);
}

/**
 * Written by the RevenueCat webhook (`http.ts`). This handler honours the
 * supplied status and never infers access from product ids.
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
 * the event is acknowledged but no row is created unless it is authoritative
 * (a refund snapshot must record its timestamp to reject older purchases).
 */
export const upsertSubscription = internalMutation({
  args: {
    userId: v.string(),
    status: v.optional(subscriptionStatusValidator),
    expiresAt: v.number(),
    productId: v.optional(v.string()),
    eventTimestampMs: v.optional(v.number()),
    authoritative: v.optional(v.boolean()),
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

    // Account deletion removes the users row but deliberately does NOT cancel
    // the App Store subscription, so RevenueCat keeps sending renewal/
    // expiration events for the deleted account. Acknowledge the event (so
    // RevenueCat stops retrying) but do not insert or patch a row — otherwise
    // a renewal webhook resurrects an entitlement for a user who no longer
    // exists. The userId here is the Convex Auth users-table document id.
    const ownerId = ctx.db.normalizeId("users", args.userId);
    if (ownerId === null) {
      return null;
    }
    const owner = await ctx.db.get(ownerId);
    if (owner === null) {
      return null;
    }

    // A lifetime row is sticky unless an authoritative snapshot replaces it — a
    // stray CANCELLATION or an EXPIRATION for an unrelated product (this table
    // is one row per user, not per-product) is preserved as-is. Refunds and
    // reversals reconcile the current Pro entitlement instead. The webhook
    // uses this non-expiring status for developer access and authoritative
    // permanent grants, not a purchasable lifetime plan.
    const stickyLifetime =
      !args.authoritative &&
      existing?.status === "lifetime" &&
      args.status !== "lifetime";

    // An omitted status means "preserve the current status". There is no
    // current status for a first-seen advisory/unknown event, so acknowledging
    // it must not manufacture a Pro subscription. This also handles webhook
    // reordering where CANCELLATION arrives before INITIAL_PURCHASE.
    const status: SubscriptionStatus | undefined = stickyLifetime
      ? "lifetime"
      : (args.status ?? existing?.status);
    if (status === undefined) {
      return null;
    }

    // Nothing to record: an event with no expiry and no prior state (e.g. a
    // lapsed non-lifetime event). A lifetime purchase is exempt — it reports
    // `expiresAt: 0` (non-renewing) but is a real entitlement.
    // An authoritative lapse records the ordering timestamp even before a
    // purchase arrives, so a delayed purchase cannot resurrect refunded access.
    if (
      !args.authoritative &&
      existing === null &&
      args.expiresAt === 0 &&
      status !== "lifetime"
    ) {
      return null;
    }

    // A sticky lifetime row keeps its expiry; an event with no expiry (0)
    // preserves the existing row's expiry (e.g. CANCELLATION); otherwise the
    // event's expiry wins. Lifetime gates check `status` explicitly, so its
    // stored `expiresAt` value is irrelevant.
    const expiresAt = stickyLifetime
      ? (existing?.expiresAt ?? 0)
      : !args.authoritative && args.expiresAt === 0 && existing !== null
        ? existing.expiresAt
        : args.expiresAt;

    const doc = {
      status,
      expiresAt,
      ...(args.authoritative ||
      (!stickyLifetime && args.productId !== undefined)
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

export const transferOwners = internalQuery({
  args: { userIds: v.array(v.string()) },
  returns: v.array(v.id("users")),
  handler: async (ctx, { userIds }) => {
    const owners: Id<"users">[] = [];
    for (const userId of new Set(userIds)) {
      const id = ctx.db.normalizeId("users", userId);
      if (id !== null && (await ctx.db.get(id)) !== null) owners.push(id);
    }
    return owners;
  },
});

export const reconcileTransfer = internalMutation({
  args: {
    eventTimestampMs: v.number(),
    snapshots: v.array(
      v.object({
        userId: v.id("users"),
        status: subscriptionStatusValidator,
        expiresAt: v.number(),
        productId: v.optional(v.string()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { snapshots, eventTimestampMs }) => {
    // Nested writes share this transaction: a failed update rolls back both sides.
    for (const snapshot of snapshots) {
      await ctx.runMutation(internal.subscriptions.upsertSubscription, {
        ...snapshot,
        eventTimestampMs,
        authoritative: true,
      });
    }
    return null;
  },
});
