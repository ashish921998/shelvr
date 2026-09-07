import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { enrichItem, enrichedItemValidator } from "./items";
import { requireUserId } from "./model/auth";

const digestResponseValidator = v.object({
  _id: v.id("weeklyDigests"),
  weekStart: v.number(),
  createdAt: v.number(),
  openedAt: v.optional(v.number()),
  itemCount: v.number(),
  items: v.array(enrichedItemValidator),
});

const preferencesValidator = v.object({
  weeklyShelfEnabled: v.boolean(),
  nextDigestAt: v.union(v.number(), v.null()),
  timezone: v.union(v.string(), v.null()),
});

const DEFAULT_DIGEST_HOUR_UTC = 9;
const DISABLED_DIGEST_AT = Number.MAX_SAFE_INTEGER;
const DIGEST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DIGEST_ITEMS = 3;
const MAX_USER_ITEMS = 1000;

function nextFallbackDigestAt(now: number): number {
  const candidate = new Date(now);
  candidate.setUTCHours(DEFAULT_DIGEST_HOUR_UTC, 0, 0, 0);
  const daysUntilSunday = (7 - candidate.getUTCDay()) % 7;
  candidate.setUTCDate(candidate.getUTCDate() + daysUntilSunday);
  if (candidate.getTime() <= now) {
    candidate.setUTCDate(candidate.getUTCDate() + 7);
  }
  return candidate.getTime();
}

function advanceDigestAt(current: number | undefined, now: number): number {
  let next = current ?? nextFallbackDigestAt(now);
  while (next <= now) {
    next += DIGEST_WINDOW_MS;
  }
  return next;
}

function weekStart(now: number): number {
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.getTime();
}

function chooseDigestItems(
  items: Doc<"items">[],
  previouslyIncluded: Set<string>,
  openedItemIds: Set<string>,
  now: number,
): Doc<"items">[] {
  const candidates = items.filter(
    (item) =>
      item.status === "ready" &&
      item._creationTime >= now - DIGEST_WINDOW_MS &&
      !openedItemIds.has(item._id) &&
      !previouslyIncluded.has(item._id),
  );

  // Prefer a varied shelf, then fill any remaining slots by recency. The input
  // is already newest-first from the by_user index.
  const selected: Doc<"items">[] = [];
  const seenTypes = new Set<Doc<"items">["type"]>();
  for (const item of candidates) {
    if (selected.length >= MAX_DIGEST_ITEMS) break;
    if (!seenTypes.has(item.type)) {
      seenTypes.add(item.type);
      selected.push(item);
    }
  }
  for (const item of candidates) {
    if (selected.length >= MAX_DIGEST_ITEMS) break;
    if (!selected.some((selectedItem) => selectedItem._id === item._id)) {
      selected.push(item);
    }
  }
  return selected;
}

export const getPreferences = query({
  args: {},
  returns: preferencesValidator,
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const preferences = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    return {
      weeklyShelfEnabled: preferences?.weeklyShelfEnabled ?? false,
      nextDigestAt: preferences?.weeklyShelfEnabled
        ? (preferences.nextDigestAt ?? null)
        : null,
      timezone: preferences?.timezone ?? null,
    };
  },
});

export const setPreferences = mutation({
  args: {
    weeklyShelfEnabled: v.boolean(),
    nextDigestAt: v.optional(v.number()),
    timezone: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const now = Date.now();
    const fields = {
      weeklyShelfEnabled: args.weeklyShelfEnabled,
      nextDigestAt: args.weeklyShelfEnabled
        ? (args.nextDigestAt ?? existing?.nextDigestAt ?? nextFallbackDigestAt(now))
        : DISABLED_DIGEST_AT,
      timezone: args.timezone ?? existing?.timezone,
      updatedAt: now,
    };
    if (existing === null) {
      await ctx.db.insert("notificationPreferences", { userId, ...fields });
    } else {
      await ctx.db.patch(existing._id, fields);
    }
    return null;
  },
});

export const registerDevice = mutation({
  args: {
    token: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android")),
    nextDigestAt: v.optional(v.number()),
    timezone: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const token = args.token.trim();
    if (token.length === 0 || token.length > 4096) {
      throw new Error("Invalid notification token");
    }

    const existingToken = await ctx.db
      .query("notificationDevices")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    const now = Date.now();
    if (existingToken === null) {
      await ctx.db.insert("notificationDevices", {
        userId,
        token,
        platform: args.platform,
        enabled: true,
        lastSeenAt: now,
      });
    } else {
      await ctx.db.patch(existingToken._id, {
        userId,
        platform: args.platform,
        enabled: true,
        lastSeenAt: now,
      });
    }

    const existingPreferences = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existingPreferences === null) {
      await ctx.db.insert("notificationPreferences", {
        userId,
        weeklyShelfEnabled: false,
        nextDigestAt: args.nextDigestAt ?? DISABLED_DIGEST_AT,
        timezone: args.timezone,
        updatedAt: now,
      });
    }
    return null;
  },
});

export const markItemOpened = mutation({
  args: { itemId: v.id("items") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const item = await ctx.db.get(args.itemId);
    if (item === null || item.userId !== userId) {
      return null;
    }
    const existing = await ctx.db
      .query("itemReads")
      .withIndex("by_user_and_item", (q) =>
        q.eq("userId", userId).eq("itemId", args.itemId),
      )
      .unique();
    const now = Date.now();
    if (existing === null) {
      await ctx.db.insert("itemReads", {
        userId,
        itemId: args.itemId,
        firstOpenedAt: now,
        lastOpenedAt: now,
      });
    } else {
      await ctx.db.patch(existing._id, { lastOpenedAt: now });
    }
    return null;
  },
});

export const getDigest = query({
  args: { id: v.optional(v.id("weeklyDigests")) },
  returns: v.union(digestResponseValidator, v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const digest =
      args.id !== undefined
        ? await ctx.db.get(args.id)
        : (
            await ctx.db
              .query("weeklyDigests")
              .withIndex("by_user", (q) => q.eq("userId", userId))
              .order("desc")
              .take(1)
          )[0] ?? null;
    if (digest === null || digest.userId !== userId) {
      return null;
    }

    const items: Doc<"items">[] = [];
    for (const itemId of digest.itemIds) {
      const item = await ctx.db.get(itemId);
      if (item !== null && item.userId === userId && item.status === "ready") {
        items.push(item);
      }
    }
    return {
      _id: digest._id,
      weekStart: digest.weekStart,
      createdAt: digest.createdAt,
      openedAt: digest.openedAt,
      itemCount: items.length,
      items: await Promise.all(items.map((item) => enrichItem(ctx, item))),
    };
  },
});

export const markDigestOpened = mutation({
  args: { id: v.id("weeklyDigests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const digest = await ctx.db.get(args.id);
    if (digest !== null && digest.userId === userId && digest.openedAt === undefined) {
      await ctx.db.patch(digest._id, { openedAt: Date.now() });
    }
    return null;
  },
});

export const prepareDueWeeklyDigests = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_next_digest_at", (q) => q.lte("nextDigestAt", now))
      .take(50);
    for (const preferences of due) {
      await ctx.scheduler.runAfter(0, internal.notifications.prepareWeeklyDigest, {
        userId: preferences.userId,
        now,
      });
    }
    return null;
  },
});

export const prepareWeeklyDigest = internalMutation({
  args: { userId: v.string(), now: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const preferences = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (
      preferences === null ||
      !preferences.weeklyShelfEnabled ||
      preferences.nextDigestAt > args.now
    ) {
      return null;
    }

    const items = await ctx.db
      .query("items")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(MAX_USER_ITEMS);
    const reads = await ctx.db
      .query("itemReads")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(MAX_USER_ITEMS);
    const openedItemIds = new Set(reads.map((read) => read.itemId));
    const recentDigests = await ctx.db
      .query("weeklyDigests")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(12);
    const previouslyIncluded = new Set(
      recentDigests.flatMap((digest) => digest.itemIds.map((itemId) => itemId)),
    );
    const selected = chooseDigestItems(
      items,
      previouslyIncluded,
      openedItemIds,
      args.now,
    );

    const nextDigestAt = advanceDigestAt(preferences.nextDigestAt, args.now);
    await ctx.db.patch(preferences._id, {
      nextDigestAt,
      updatedAt: args.now,
    });
    if (selected.length < MAX_DIGEST_ITEMS) {
      return null;
    }

    const currentWeekStart = weekStart(args.now);
    const existing = await ctx.db
      .query("weeklyDigests")
      .withIndex("by_user_and_week", (q) =>
        q.eq("userId", args.userId).eq("weekStart", currentWeekStart),
      )
      .unique();
    if (existing !== null) {
      return null;
    }

    const digestId = await ctx.db.insert("weeklyDigests", {
      userId: args.userId,
      weekStart: currentWeekStart,
      itemIds: selected.map((item) => item._id),
      createdAt: args.now,
    });
    await ctx.scheduler.runAfter(0, internal.notifications.sendDigestNotification, {
      digestId,
    });
    return null;
  },
});

export const getDigestDeliveryData = internalQuery({
  args: { digestId: v.id("weeklyDigests") },
  returns: v.union(
    v.object({
      tokens: v.array(v.string()),
      itemCount: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const digest = await ctx.db.get(args.digestId);
    if (digest === null || digest.deliveredAt !== undefined) {
      return null;
    }
    const devices = await ctx.db
      .query("notificationDevices")
      .withIndex("by_user", (q) => q.eq("userId", digest.userId))
      .take(20);
    return {
      tokens: devices.filter((device) => device.enabled).map((device) => device.token),
      itemCount: digest.itemIds.length,
    };
  },
});

export const markDigestDelivered = internalMutation({
  args: { digestId: v.id("weeklyDigests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const digest = await ctx.db.get(args.digestId);
    if (digest !== null && digest.deliveredAt === undefined) {
      await ctx.db.patch(digest._id, { deliveredAt: Date.now() });
    }
    return null;
  },
});

export const sendDigestNotification = internalAction({
  args: { digestId: v.id("weeklyDigests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const delivery = await ctx.runQuery(
      internal.notifications.getDigestDeliveryData,
      { digestId: args.digestId },
    );
    if (delivery === null) {
      return null;
    }
    if (delivery.tokens.length === 0) {
      await ctx.runMutation(internal.notifications.markDigestDelivered, {
        digestId: args.digestId,
      });
      return null;
    }

    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        delivery.tokens.map((to) => ({
          to,
          title: "Your weekly shelf is ready",
          body: `You saved ${delivery.itemCount} things this week. Take a look at the ones waiting for you.`,
          data: { url: `/digest/${args.digestId}` },
          sound: "default",
          channelId: "weekly-shelf",
        })),
      ),
    });
    if (!response.ok) {
      throw new Error(`weekly_digest_delivery_failed:${response.status}`);
    }
    await ctx.runMutation(internal.notifications.markDigestDelivered, {
      digestId: args.digestId,
    });
    return null;
  },
});
