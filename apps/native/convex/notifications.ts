import {
  DIGEST_WINDOW_MS,
  notificationLocale,
} from "./model/notificationFields";
import { ConvexError, v } from "convex/values";
import { internalMutation, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { enrichItem, enrichedItemValidator } from "./items";
import { tripStopItemIds } from "./tripData";
import { liveOwner, authedMutation, authedQuery } from "./model/auth";
import {
  localHour,
  nextLocalHourAt,
  nextWeeklyDigestAt,
  parseTimezoneInput,
  rebookedSchedule,
  resolveTimezone,
} from "./model/notificationSchedule";
import { takeWithinBytes } from "./model/readBudget";
import {
  SHELF_HISTORY,
  SHELF_SCAN_BYTES,
  SHELF_SCAN_ITEMS,
  SHELF_SIZE,
  archiveCheckOrder,
  archiveLimit,
  chooseRecent,
  composeShelf,
  shelfCandidates,
  weekStart,
} from "./model/weeklyShelf";
import {
  DEFAULT_REMINDER_HOUR,
  HOUR_SAMPLE_WINDOW_MS,
  IGNORED_STREAK,
  MAX_LATE_MS,
  WEEK_MS,
  WEEKLY_LIMIT,
  openedTooRecently,
  preferredReminderHour,
  reminderBlocked,
  remindersOn,
  reminderCandidates,
  saveRemindersLive,
} from "./model/saveReminders";

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
  remindersEnabled: v.boolean(),
});

export const DUE_DIGEST_BATCH_SIZE = 50;
const DUE_REMINDER_BATCH_SIZE = 50;
const REMINDER_SCAN_ROWS = 500;
const REMINDER_SCAN_BYTES = 6 * 1024 * 1024;
const REMINDER_CHECKS_PER_KIND = 100;
const MAX_FAILED_REMINDERS = 2;

export const getPreferences = authedQuery({
  args: {},
  returns: preferencesValidator,
  handler: async (ctx) => {
    const { userId } = ctx;
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
      remindersEnabled: preferences !== null && remindersOn(preferences),
    };
  },
});

export const setPreferences = authedMutation({
  args: {
    weeklyShelfEnabled: v.boolean(),
    nextDigestAt: v.optional(v.number()),
    timezone: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const existing = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const now = Date.now();
    if (
      args.nextDigestAt !== undefined &&
      (!Number.isSafeInteger(args.nextDigestAt) ||
        args.nextDigestAt < now - DIGEST_WINDOW_MS ||
        args.nextDigestAt > now + DIGEST_WINDOW_MS)
    ) {
      throw new Error(
        "nextDigestAt must be a valid timestamp within one week of now",
      );
    }
    const timezone =
      parseTimezoneInput(args.timezone) ?? resolveTimezone(existing?.timezone);
    const previous = existing?.nextDigestAt;
    const kept =
      previous !== undefined &&
      previous > now &&
      previous <= now + DIGEST_WINDOW_MS
        ? previous
        : nextWeeklyDigestAt(now, timezone);
    const rebooked =
      existing === null
        ? undefined
        : rebookedSchedule(
            existing,
            timezone,
            now,
            remindersOn(existing) ? DEFAULT_REMINDER_HOUR : null,
          );
    const nextDigestAt = rebooked?.nextDigestAt ?? kept;
    const fields = {
      weeklyShelfEnabled: args.weeklyShelfEnabled,
      nextDigestAt: args.weeklyShelfEnabled
        ? (args.nextDigestAt ?? nextDigestAt)
        : nextDigestAt,
      timezone,
      ...(rebooked?.nextReminderAt !== undefined
        ? { nextReminderAt: rebooked.nextReminderAt }
        : {}),
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

export const registerDevice = authedMutation({
  args: {
    locale: v.optional(v.string()),
    token: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android")),
    nextDigestAt: v.optional(v.number()),
    timezone: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const token = args.token.trim();
    if (token.length === 0 || token.length > 4096) {
      throw new Error("Invalid notification token");
    }
    const timezone = parseTimezoneInput(args.timezone);
    const locale = notificationLocale(args.locale);
    const languageFields = locale === undefined ? {} : { locale };

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
        ...languageFields,
        enabled: true,
        lastSeenAt: now,
      });
    } else if (existingToken.userId === userId || !existingToken.enabled) {
      await ctx.db.patch(existingToken._id, {
        userId,
        platform: args.platform,
        ...languageFields,
        enabled: true,
        lastSeenAt: now,
      });
    } else {
      throw new ConvexError({
        code: "notification_token_owned_by_another_account",
        message:
          "This device is registered to another account. Sign out of that account on this device first.",
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
        nextDigestAt: nextWeeklyDigestAt(now, timezone),
        timezone,
        nextReminderAt: nextLocalHourAt(now, timezone, DEFAULT_REMINDER_HOUR),
        updatedAt: now,
      });
    } else {
      const rebooked =
        timezone === undefined
          ? undefined
          : rebookedSchedule(
              existingPreferences,
              timezone,
              now,
              remindersOn(existingPreferences) ? DEFAULT_REMINDER_HOUR : null,
            );
      const arm =
        rebooked === undefined &&
        remindersOn(existingPreferences) &&
        existingPreferences.nextReminderAt === undefined;
      if (rebooked !== undefined || arm) {
        await ctx.db.patch(existingPreferences._id, {
          ...rebooked,
          ...(arm
            ? {
                nextReminderAt: nextLocalHourAt(
                  now,
                  existingPreferences.timezone,
                  DEFAULT_REMINDER_HOUR,
                ),
              }
            : {}),
          updatedAt: now,
        });
      }
    }
    return null;
  },
});

export const setSaveReminders = authedMutation({
  args: { enabled: v.boolean(), timezone: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const existing = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const now = Date.now();
    const timezone =
      parseTimezoneInput(args.timezone) ?? resolveTimezone(existing?.timezone);
    const rebooked =
      existing === null
        ? undefined
        : rebookedSchedule(existing, timezone, now, null);
    const booked =
      rebooked === undefined ? existing?.nextReminderAt : undefined;
    const nextReminderAt = args.enabled
      ? (booked ?? nextLocalHourAt(now, timezone, DEFAULT_REMINDER_HOUR))
      : undefined;
    if (existing === null) {
      await ctx.db.insert("notificationPreferences", {
        userId,
        weeklyShelfEnabled: false,
        nextDigestAt: nextWeeklyDigestAt(now, timezone),
        timezone,
        remindersEnabled: args.enabled,
        nextReminderAt,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(existing._id, {
        remindersEnabled: args.enabled,
        nextReminderAt,
        timezone,
        ...(rebooked === undefined
          ? {}
          : { nextDigestAt: rebooked.nextDigestAt }),
        updatedAt: now,
      });
    }
    return null;
  },
});

export const unregisterDevice = authedMutation({
  args: { token: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const device = await ctx.db
      .query("notificationDevices")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (device?.userId === userId)
      await ctx.db.patch(device._id, { enabled: false });
    return null;
  },
});

export const markItemOpened = authedMutation({
  args: { itemId: v.id("items") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = ctx;
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

export const getDigest = authedQuery({
  args: { id: v.optional(v.id("weeklyDigests")) },
  returns: v.union(digestResponseValidator, v.null()),
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const digest =
      args.id !== undefined
        ? await ctx.db.get(args.id)
        : ((
            await ctx.db
              .query("weeklyDigests")
              .withIndex("by_user", (q) => q.eq("userId", userId))
              .order("desc")
              .take(1)
          )[0] ?? null);
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

export const markDigestOpened = authedMutation({
  args: { id: v.id("weeklyDigests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const digest = await ctx.db.get(args.id);
    if (
      digest !== null &&
      digest.userId === userId &&
      digest.openedAt === undefined
    ) {
      await ctx.db.patch(digest._id, { openedAt: Date.now() });
    }
    return null;
  },
});

export const prepareDueWeeklyDigests = internalMutation({
  args: {
    now: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const due = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_enabled_and_next_digest_at", (q) =>
        q.eq("weeklyShelfEnabled", true).lte("nextDigestAt", now),
      )
      .paginate({
        cursor: args.cursor ?? null,
        numItems: DUE_DIGEST_BATCH_SIZE,
      });
    for (const preferences of due.page) {
      await ctx.scheduler.runAfter(
        0,
        internal.notifications.prepareWeeklyDigest,
        {
          userId: preferences.userId,
          now,
        },
      );
    }
    if (!due.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.notifications.prepareDueWeeklyDigests,
        { now, cursor: due.continueCursor },
      );
    }
    return null;
  },
});

async function wasOpened(
  ctx: QueryCtx,
  userId: string,
  itemId: Id<"items">,
): Promise<boolean> {
  const read = await ctx.db
    .query("itemReads")
    .withIndex("by_user_and_item", (q) =>
      q.eq("userId", userId).eq("itemId", itemId),
    )
    .unique();
  return read !== null;
}

export const prepareWeeklyDigest = internalMutation({
  args: { userId: v.string(), now: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if ((await liveOwner(ctx, args.userId)) === null) return null;
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

    const { rows: items } = await takeWithinBytes(
      ctx.db
        .query("items")
        .withIndex("by_user_and_status", (q) =>
          q.eq("userId", args.userId).eq("status", "ready"),
        )
        .order("desc"),
      { maxRows: SHELF_SCAN_ITEMS, maxBytes: SHELF_SCAN_BYTES },
    );
    const recentDigests = await ctx.db
      .query("weeklyDigests")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(SHELF_HISTORY);
    // A shelf that never reached a device has not shown its saves to anyone.
    const previouslyIncluded = new Set<string>(
      recentDigests
        .filter(
          (digest) =>
            digest.deliveryStatus !== "failed" ||
            digest.deliverySentAt !== undefined,
        )
        .flatMap((digest) => digest.itemIds),
    );
    const planned = await tripStopItemIds(ctx, args.userId);
    const candidates = shelfCandidates(
      items,
      new Set([...previouslyIncluded, ...planned]),
      args.now,
    );

    const recentOpened = await Promise.all(
      candidates.recent.map((item) => wasOpened(ctx, args.userId, item._id)),
    );
    const recent = chooseRecent(
      candidates.recent.filter((_, index) => !recentOpened[index]),
    );

    const archive: Doc<"items">[] = [];
    const wanted = archiveLimit(recent.length);
    for (const item of archiveCheckOrder(
      candidates.archive,
      args.userId,
      args.now,
    )) {
      if (archive.length >= wanted) break;
      if (!(await wasOpened(ctx, args.userId, item._id))) archive.push(item);
    }
    const selected = composeShelf(recent, archive);

    const nextDigestAt = nextWeeklyDigestAt(args.now, preferences.timezone);
    await ctx.db.patch(preferences._id, {
      nextDigestAt,
      updatedAt: args.now,
    });
    if (selected.length < SHELF_SIZE) {
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
      deliveryStatus: "pending",
      deliveryNextAttemptAt: args.now,
    });
    await ctx.scheduler.runAfter(0, internal.notificationDelivery.send, {
      digestId,
    });
    return null;
  },
});

export const prepareDueSaveReminders = internalMutation({
  args: {
    now: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!saveRemindersLive()) return null;
    const now = args.now ?? Date.now();
    const due = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_next_reminder_at", (q) =>
        q.gte("nextReminderAt", 0).lte("nextReminderAt", now),
      )
      .paginate({
        cursor: args.cursor ?? null,
        numItems: DUE_REMINDER_BATCH_SIZE,
      });
    for (const preferences of due.page) {
      await ctx.scheduler.runAfter(
        0,
        internal.notifications.prepareSaveReminder,
        { userId: preferences.userId, now },
      );
    }
    if (!due.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.notifications.prepareDueSaveReminders,
        { now, cursor: due.continueCursor },
      );
    }
    return null;
  },
});

// One-off backfill: npx convex run notifications:armSaveReminders
export const armSaveReminders = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const page = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_next_reminder_at", (q) =>
        q.eq("nextReminderAt", undefined),
      )
      .paginate({ cursor: args.cursor ?? null, numItems: 100 });
    for (const preferences of page.page) {
      if (!remindersOn(preferences)) continue;
      await ctx.db.patch(preferences._id, {
        nextReminderAt: nextLocalHourAt(
          now,
          preferences.timezone,
          DEFAULT_REMINDER_HOUR,
        ),
        updatedAt: now,
      });
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.notifications.armSaveReminders, {
        cursor: page.continueCursor,
      });
    }
    return null;
  },
});

export const prepareSaveReminder = internalMutation({
  args: { userId: v.string(), now: v.number() },
  returns: v.null(),
  handler: async (ctx, { userId, now }) => {
    if ((await liveOwner(ctx, userId)) === null) return null;
    const preferences = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (
      !saveRemindersLive() ||
      preferences === null ||
      preferences.nextReminderAt === undefined ||
      preferences.nextReminderAt > now
    ) {
      return null;
    }
    const late = now - preferences.nextReminderAt > MAX_LATE_MS;
    const device = await ctx.db
      .query("notificationDevices")
      .withIndex("by_user_and_enabled", (q) =>
        q.eq("userId", userId).eq("enabled", true),
      )
      .first();
    if (!remindersOn(preferences) || device === null) {
      await ctx.db.patch(preferences._id, {
        nextReminderAt: undefined,
        updatedAt: now,
      });
      return null;
    }

    const { rows: items } = await takeWithinBytes(
      ctx.db
        .query("items")
        .withIndex("by_user_and_status", (q) =>
          q.eq("userId", userId).eq("status", "ready"),
        )
        .order("desc"),
      { maxRows: REMINDER_SCAN_ROWS, maxBytes: REMINDER_SCAN_BYTES },
    );
    const hour = preferredReminderHour(
      items
        .filter((item) => now - item._creationTime < HOUR_SAMPLE_WINDOW_MS)
        .map((item) => localHour(item._creationTime, preferences.timezone)),
    );
    await ctx.db.patch(preferences._id, {
      nextReminderAt: nextLocalHourAt(now, preferences.timezone, hour),
      updatedAt: now,
    });
    if (late) return null;

    const reminders = (
      await ctx.db
        .query("saveReminders")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .order("desc")
        .take(3 * Math.max(WEEKLY_LIMIT, IGNORED_STREAK))
    ).filter((reminder) => reminder.deliveryStatus !== "failed");
    const digests = await ctx.db
      .query("weeklyDigests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(2);
    const shelvesSent = digests
      .filter((digest) => digest.deliveryStatus !== "failed")
      .map((digest) => digest.createdAt);
    const sentAt = [
      ...reminders.map((reminder) => reminder.createdAt),
      ...shelvesSent,
    ].filter((at) => now - at < WEEK_MS);
    const streak = await Promise.all(
      reminders.slice(0, IGNORED_STREAK).map(async (reminder) => {
        const read = await ctx.db
          .query("itemReads")
          .withIndex("by_user_and_item", (q) =>
            q.eq("userId", userId).eq("itemId", reminder.itemId),
          )
          .unique();
        return {
          createdAt: reminder.createdAt,
          opened: read !== null && read.lastOpenedAt >= reminder.createdAt,
        };
      }),
    );
    const shelf = preferences.weeklyShelfEnabled
      ? {
          nextAt: preferences.nextDigestAt,
          sentThisWeek: shelvesSent.some((at) => now - at < WEEK_MS),
        }
      : undefined;
    if (reminderBlocked(now, sentAt, streak, shelf) !== undefined) return null;

    const checks = { read: 0, cook: 0 };
    for (const candidate of reminderCandidates(
      items,
      now,
      reminders[0]?.kind,
      await tripStopItemIds(ctx, userId),
    )) {
      if (checks[candidate.kind]++ >= REMINDER_CHECKS_PER_KIND) continue;
      const earlier = await ctx.db
        .query("saveReminders")
        .withIndex("by_user_and_item", (q) =>
          q.eq("userId", userId).eq("itemId", candidate.item._id),
        )
        .take(MAX_FAILED_REMINDERS);
      if (
        earlier.length >= MAX_FAILED_REMINDERS ||
        earlier.some((reminder) => reminder.deliveryStatus !== "failed")
      )
        continue;
      const read = await ctx.db
        .query("itemReads")
        .withIndex("by_user_and_item", (q) =>
          q.eq("userId", userId).eq("itemId", candidate.item._id),
        )
        .unique();
      if (openedTooRecently(candidate.kind, read?.lastOpenedAt, now)) continue;

      const reminderId = await ctx.db.insert("saveReminders", {
        userId,
        itemId: candidate.item._id,
        kind: candidate.kind,
        createdAt: now,
        deliveryStatus: "pending",
        deliveryNextAttemptAt: now,
      });
      await ctx.scheduler.runAfter(
        0,
        internal.notificationDelivery.sendReminder,
        { reminderId },
      );
      return null;
    }
    return null;
  },
});
