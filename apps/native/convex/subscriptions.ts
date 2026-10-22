import { v } from "convex/values";
import { query, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  isDevelopmentAnonymousUser,
  liveOwner,
  requireUserId,
} from "./model/auth";
import { isEntitled, type SubscriptionStatus } from "./model/entitlement";
import { saveError } from "./model/saveErrors";

const subscriptionStatusValidator = v.union(
  v.literal("trialing"),
  v.literal("pro"),
  v.literal("lapsed"),
  v.literal("lifetime"),
);

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

export async function requireProEntitlement(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  if (!(await hasProEntitlement(ctx, userId))) {
    throw saveError("pro_required");
  }
}

export async function hasProEntitlement(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<boolean> {
  return await hasProEntitlementAt(ctx, userId, Date.now());
}

async function subscriptionFor(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"subscriptions"> | null> {
  return await ctx.db
    .query("subscriptions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

export async function hasProEntitlementAt(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  now: number,
): Promise<boolean> {
  if (await isDevelopmentAnonymousUser(ctx, userId)) return true;
  const sub = await subscriptionFor(ctx, userId);
  return sub !== null && isEntitled(sub.status, sub.expiresAt, now);
}

export async function hasProEntitlementStatus(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<boolean> {
  if (await isDevelopmentAnonymousUser(ctx, userId)) return true;
  const sub = await subscriptionFor(ctx, userId);
  return sub !== null && isEntitled(sub.status, sub.expiresAt, sub.updatedAt);
}

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

    if (
      existing !== null &&
      existing.eventTimestampMs !== undefined &&
      (args.eventTimestampMs === undefined ||
        args.eventTimestampMs <= existing.eventTimestampMs)
    ) {
      return null;
    }

    if ((await liveOwner(ctx, args.userId)) === null) {
      return null;
    }

    const stickyLifetime =
      !args.authoritative &&
      existing?.status === "lifetime" &&
      args.status !== "lifetime";

    const status: SubscriptionStatus | undefined = stickyLifetime
      ? "lifetime"
      : (args.status ?? existing?.status);
    if (status === undefined) {
      return null;
    }

    if (
      !args.authoritative &&
      existing === null &&
      args.expiresAt === 0 &&
      status !== "lifetime"
    ) {
      return null;
    }

    const expiresAt = stickyLifetime
      ? (existing?.expiresAt ?? 0)
      : !args.authoritative && args.expiresAt === 0 && existing !== null
        ? existing.expiresAt
        : args.expiresAt;

    const effectiveStatus = await scheduleSubscriptionExpiry(
      ctx,
      args.userId,
      status,
      expiresAt,
    );
    const doc = {
      status: effectiveStatus,
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

export const liveOwners = internalQuery({
  args: { userIds: v.array(v.string()) },
  returns: v.array(v.id("users")),
  handler: async (ctx, { userIds }) => {
    const owners: Id<"users">[] = [];
    for (const userId of new Set(userIds)) {
      const owner = await liveOwner(ctx, userId);
      if (owner !== null) owners.push(owner._id);
    }
    return owners;
  },
});

export const applySnapshots = internalMutation({
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

export const expireSubscription = internalMutation({
  args: { userId: v.string(), expiresAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (
      sub &&
      sub.expiresAt === args.expiresAt &&
      sub.expiresAt <= Date.now() &&
      (sub.status === "pro" || sub.status === "trialing")
    ) {
      await ctx.db.patch(sub._id, { status: "lapsed", updatedAt: Date.now() });
    }
    return null;
  },
});

export const recoverExpiredSubscriptions = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    for (const status of ["pro", "trialing"] as const) {
      const rows = await ctx.db
        .query("subscriptions")
        .withIndex("by_status_and_expiresAt", (q) =>
          q.eq("status", status).lte("expiresAt", Date.now()),
        )
        .take(100);
      for (const row of rows)
        await ctx.db.patch(row._id, {
          status: "lapsed",
          updatedAt: Date.now(),
        });
      if (rows.length === 100)
        await ctx.scheduler.runAfter(
          0,
          internal.subscriptions.recoverExpiredSubscriptions,
          {},
        );
    }
    return null;
  },
});

async function scheduleSubscriptionExpiry(
  ctx: MutationCtx,
  userId: string,
  status: SubscriptionStatus,
  expiresAt: number,
): Promise<SubscriptionStatus> {
  if (!isEntitled(status, expiresAt, Date.now())) return "lapsed";
  if (status !== "lifetime")
    await ctx.scheduler.runAt(
      expiresAt,
      internal.subscriptions.expireSubscription,
      { userId, expiresAt },
    );
  return status;
}
