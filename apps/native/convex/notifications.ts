import { notificationLocale } from "./model/notificationFields";
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { enrichItem, enrichedItemValidator } from "./items";
import { requireUserId } from "./model/auth";
import {
  localHour,
  nextLocalHourAt,
  nextWeeklyDigestAt,
  parseTimezoneInput,
  resolveTimezone,
} from "./model/notificationSchedule";
import { takeWithinBytes } from "./model/readBudget";
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

const DIGEST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DIGEST_ITEMS = 3;
const MAX_USER_ITEMS = 1000;
/** Due users scheduled per transaction. A full page chains a follow-up run so a
 * backlog drains at scheduler speed instead of one page per hourly tick. */
export const DUE_DIGEST_BATCH_SIZE = 50;
export const DUE_REMINDER_BATCH_SIZE = 50;
/** The newest ready saves a reminder pass reads, bounded by count and bytes:
 * article bodies make item rows large, and the pass runs daily per user. */
const REMINDER_SCAN_ROWS = 500;
const REMINDER_SCAN_BYTES = 6 * 1024 * 1024;
/** Candidates of each kind checked against read state and history per pass. */
const REMINDER_CHECKS_PER_KIND = 20;
/** Failed attempts at one save before it is given up on. */
const MAX_FAILED_REMINDERS = 2;

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
      // No row means no device was ever registered, so nothing can arrive.
      remindersEnabled:
        preferences !== null && preferences.remindersEnabled !== false,
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
    // A supplied zone is rejected if Intl does not know it; a stored zone that
    // predates validation is repaired to UTC here instead of being written back.
    const timezone =
      parseTimezoneInput(args.timezone) ?? resolveTimezone(existing?.timezone);
    const fallback = nextWeeklyDigestAt(now, timezone);
    const previous = existing?.nextDigestAt;
    const schedule =
      previous !== undefined &&
      previous > now &&
      previous <= now + DIGEST_WINDOW_MS
        ? previous
        : fallback;
    const fields = {
      weeklyShelfEnabled: args.weeklyShelfEnabled,
      nextDigestAt: args.weeklyShelfEnabled
        ? (args.nextDigestAt ??
          (timezone === existing?.timezone ? schedule : fallback))
        : schedule,
      timezone,
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
    locale: v.optional(v.string()),
    token: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android")),
    // Accepted for compatibility with installed clients; scheduling belongs to setPreferences.
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
    // Validate before any write so a bad zone cannot leave a half-registered device.
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
      // Re-bind is allowed only for the owner or for a released token. The
      // client revokes every stored token before sign-out, so the account-switch
      // flow on one device always arrives here with a disabled row.
      await ctx.db.patch(existingToken._id, {
        userId,
        platform: args.platform,
        ...languageFields,
        enabled: true,
        lastSeenAt: now,
      });
    } else {
      // The server cannot prove a token belongs to the caller's device, so an
      // enabled row owned by another account is never moved: that would let
      // anyone who learns a token redirect and silence its owner's digests.
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
    } else if (
      existingPreferences.remindersEnabled !== false &&
      existingPreferences.nextReminderAt === undefined
    ) {
      // Arms reminders for a user who had none scheduled: one whose rows
      // predate reminders, or whose last pass found no device to send to.
      await ctx.db.patch(existingPreferences._id, {
        nextReminderAt: nextLocalHourAt(
          now,
          existingPreferences.timezone,
          DEFAULT_REMINDER_HOUR,
        ),
        updatedAt: now,
      });
    }
    return null;
  },
});

export const setSaveReminders = mutation({
  args: { enabled: v.boolean(), timezone: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const now = Date.now();
    const timezone =
      parseTimezoneInput(args.timezone) ?? resolveTimezone(existing?.timezone);
    // A user who has travelled since their slot was booked would otherwise
    // keep getting reminders, and the weekly shelf, at the old zone's hour.
    const moved = existing !== null && existing.timezone !== timezone;
    const booked = moved ? undefined : existing?.nextReminderAt;
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
        ...(moved ? { nextDigestAt: nextWeeklyDigestAt(now, timezone) } : {}),
        updatedAt: now,
      });
    }
    return null;
  },
});

export const unregisterDevice = mutation({
  args: { token: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const device = await ctx.db
      .query("notificationDevices")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (device?.userId === userId)
      await ctx.db.patch(device._id, { enabled: false });
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

export const markDigestOpened = mutation({
  args: { id: v.id("weeklyDigests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
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
    // Set only by a chained run. The cron always starts a fresh sweep.
    now: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // `now` is fixed for the whole sweep so the due set is a snapshot: users who
    // become due while the chain runs wait for the next tick, and the chain
    // cannot loop over an ever-growing range.
    const now = args.now ?? Date.now();
    // A pagination cursor, not a re-query, is what guarantees progress. Each
    // due user is moved forward by a separate `prepareWeeklyDigest` transaction
    // that may not have run yet, so re-reading `nextDigestAt <= now` from the
    // start could return the same page and schedule duplicate digests.
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
    const reads = await Promise.all(
      items
        .filter(
          (item) =>
            item.status === "ready" &&
            item._creationTime >= args.now - DIGEST_WINDOW_MS,
        )
        .map((item) =>
          ctx.db
            .query("itemReads")
            .withIndex("by_user_and_item", (q) =>
              q.eq("userId", args.userId).eq("itemId", item._id),
            )
            .unique(),
        ),
    );
    const openedItemIds = new Set(
      reads.flatMap((read) => (read === null ? [] : [read.itemId])),
    );
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

    const nextDigestAt = nextWeeklyDigestAt(args.now, preferences.timezone);
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
    // Set only by a chained run. The cron always starts a fresh sweep.
    now: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!saveRemindersLive()) return null;
    // A fixed `now` and a cursor, for the same reasons as the digest sweep.
    const now = args.now ?? Date.now();
    const due = await ctx.db
      .query("notificationPreferences")
      // `gte(0)` skips rows with no reminder scheduled: `undefined` sorts
      // before every number.
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

/**
 * One-off, after the deploy that adds save reminders: schedules a first
 * reminder pass for every user with a preferences row and none scheduled.
 * Without it a user is only armed by their next `registerDevice`, which
 * leaves out exactly the people who stopped opening the app. Anyone with no
 * device is parked again by their first pass, so running it twice is
 * harmless. Pages itself:
 * `npx convex run notifications:armSaveReminders`.
 */
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
      if (preferences.remindersEnabled === false) continue;
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

/**
 * The daily reminder pass for one user. It always moves the next pass to
 * tomorrow at the hour this user tends to save things, then sends at most one
 * reminder if the budget allows and a save qualifies. See
 * `model/saveReminders.ts` for the rules.
 */
export const prepareSaveReminder = internalMutation({
  args: { userId: v.string(), now: v.number() },
  returns: v.null(),
  handler: async (ctx, { userId, now }) => {
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
    if (preferences.remindersEnabled === false || device === null) {
      // Parked rather than advanced, so a user nobody can reach costs nothing
      // each day. `setSaveReminders` or the next `registerDevice` re-arms it.
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

    // The budget counts what reached, or is still trying to reach, a device.
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
    const sentAt = [
      ...reminders.map((reminder) => reminder.createdAt),
      ...digests
        .filter((digest) => digest.deliveryStatus !== "failed")
        .map((digest) => digest.createdAt),
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
    if (reminderBlocked(now, sentAt, streak) !== undefined) return null;

    const checks = { read: 0, cook: 0 };
    for (const candidate of reminderCandidates(
      items,
      now,
      reminders[0]?.kind,
    )) {
      if (checks[candidate.kind]++ >= REMINDER_CHECKS_PER_KIND) continue;
      // A failed reminder never reached the user (paused, expired, no
      // device), so it does not use up the save. Two failures do, so one
      // save that cannot be delivered never blocks every save behind it.
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
