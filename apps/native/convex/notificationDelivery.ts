import { v } from "convex/values";
import { z } from "zod";
import {
  internalAction,
  internalMutation,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { liveOwner } from "./model/auth";
import {
  awaitingOutcome,
  recipientValidator,
  DIGEST_WINDOW_MS,
  digestCopy,
  planVoteCopy,
  reachedDevice,
  recipientError,
  reminderCopy,
  tripEveCopy,
  type Recipient,
} from "./model/notificationFields";
import {
  PLAN_VOTE_KIND,
  PLAN_VOTE_MAX_AGE_MS,
  planVotePushLive,
  planVoteRefusal,
  pushSubject,
} from "./model/planVote";
import {
  openedTooRecently,
  placeToVisit,
  remindersOn,
  reminderSubject,
  saveRemindersLive,
  type ReminderKind,
} from "./model/saveReminders";
import { TRIP_EVE_MAX_AGE_MS, tripSavedStopCount } from "./model/tripEve";
import { visibleSave } from "./model/placeRemovals";
import { userVisits, visitedKeysOnItem } from "./model/placeVisits";
import { liveSharePlaces, newestCityShare, shareVotes } from "./planShares";

const NOTIFICATION_KIND = "weekly_shelf";
const reminderNotificationKind = (kind: ReminderKind) => `${kind}_reminder`;
const TRIP_EVE_KIND = "trip_eve";

const LEASE_MS = 5 * 60 * 1000;
const RECEIPT_DELAY_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const REMINDER_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const MAX_DEVICES_PER_NOTIFICATION = 20;
const resultSchema = z.object({
  status: z.enum(["ok", "error"]),
  id: z.string().optional(),
  message: z.string().optional(),
  details: z.object({ error: z.string().optional() }).optional(),
});

export const recover = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const legacy = await ctx.db
      .query("weeklyDigests")
      .withIndex("by_delivery_status_and_attempt", (q) =>
        q.eq("deliveryStatus", undefined),
      )
      .take(50);
    for (const digest of legacy) {
      await ctx.db.patch(digest._id, {
        deliveryStatus:
          digest.deliveredAt !== undefined
            ? "complete"
            : now - digest.createdAt >= MAX_AGE_MS
              ? "failed"
              : "pending",
        deliveryNextAttemptAt: now,
      });
    }
    const due = await ctx.db
      .query("weeklyDigests")
      .withIndex("by_delivery_status_and_attempt", (q) =>
        q.eq("deliveryStatus", "pending").lte("deliveryNextAttemptAt", now),
      )
      .take(50);
    for (const digest of due) {
      await ctx.scheduler.runAfter(0, internal.notificationDelivery.send, {
        digestId: digest._id,
      });
    }
    const reminders = await ctx.db
      .query("saveReminders")
      .withIndex("by_delivery_status_and_attempt", (q) =>
        q.eq("deliveryStatus", "pending").lte("deliveryNextAttemptAt", now),
      )
      .take(50);
    for (const reminder of reminders) {
      await ctx.scheduler.runAfter(
        0,
        internal.notificationDelivery.sendReminder,
        { reminderId: reminder._id },
      );
    }
    const tripEves = await ctx.db
      .query("tripEveReminders")
      .withIndex("by_delivery_status_and_attempt", (q) =>
        q.eq("deliveryStatus", "pending").lte("deliveryNextAttemptAt", now),
      )
      .take(50);
    for (const tripEve of tripEves) {
      await ctx.scheduler.runAfter(
        0,
        internal.notificationDelivery.sendTripEve,
        { reminderId: tripEve._id },
      );
    }
    const planVotes = await ctx.db
      .query("planVoteNotices")
      .withIndex("by_delivery_status_and_attempt", (q) =>
        q.eq("deliveryStatus", "pending").lte("deliveryNextAttemptAt", now),
      )
      .take(50);
    for (const notice of planVotes) {
      await ctx.scheduler.runAfter(
        0,
        internal.notificationDelivery.sendPlanVote,
        { noticeId: notice._id },
      );
    }
    return null;
  },
});

async function liveRecipients(
  ctx: MutationCtx,
  userId: string,
  stored: Recipient[] | undefined,
): Promise<Recipient[]> {
  const devices = await ctx.db
    .query("notificationDevices")
    .withIndex("by_user_and_enabled", (q) =>
      q.eq("userId", userId).eq("enabled", true),
    )
    .take(MAX_DEVICES_PER_NOTIFICATION);
  const tokens = new Set(devices.map((device) => device.token));
  return (
    stored ??
    devices.map((device) => ({
      token: device.token,
      locale: device.locale,
      state: "pending" as const,
    }))
  ).map((recipient): Recipient => {
    if (awaitingOutcome(recipient) && !tokens.has(recipient.token)) {
      return {
        token: recipient.token,
        locale: recipient.locale,
        state: "failed",
        error: "device_unavailable",
      };
    }
    const locale = devices.find(
      (device) => device.token === recipient.token,
    )?.locale;
    return locale === undefined ? recipient : { ...recipient, locale };
  });
}

async function releaseUnregistered(
  ctx: MutationCtx,
  userId: string,
  recipients: Recipient[],
) {
  for (const recipient of recipients) {
    if (recipient.error !== "DeviceNotRegistered") continue;
    const device = await ctx.db
      .query("notificationDevices")
      .withIndex("by_token", (q) => q.eq("token", recipient.token))
      .unique();
    if (device?.userId === userId)
      await ctx.db.patch(device._id, { enabled: false });
  }
}

function settle(
  recipients: Recipient[],
  attempt: number,
  age: number,
  maxAge: number,
  now: number,
) {
  const pending = recipients.some(awaitingOutcome);
  const exhausted = attempt >= MAX_ATTEMPTS || age >= maxAge;
  const retry = pending && !exhausted;
  const status: "pending" | "complete" | "failed" = retry
    ? "pending"
    : recipients.some(reachedDevice)
      ? "complete"
      : "failed";
  return {
    status,
    fields: {
      deliveryRecipients: recipients,
      deliveryStatus: status,
      deliveryNextAttemptAt: retry
        ? now + Math.min(RECEIPT_DELAY_MS * 2 ** (attempt - 1), 60 * 60 * 1000)
        : undefined,
      deliveredAt: status === "complete" ? now : undefined,
      deliveryError:
        pending && exhausted
          ? "retry_limit_reached"
          : recipients.find((recipient) => recipient.error)?.error,
    },
  };
}

type Closed = {
  deliveryStatus: "complete" | "failed";
  deliveryNextAttemptAt: undefined;
  deliveredAt: number | undefined;
  deliveryError: string;
  deliverySentAt?: number;
};

const OWNER_UNAVAILABLE: Pick<
  Closed,
  "deliveryStatus" | "deliveryNextAttemptAt" | "deliveryError"
> = {
  deliveryStatus: "failed",
  deliveryNextAttemptAt: undefined,
  deliveryError: "owner_unavailable",
};

function firstSendAt(
  recorded: number | undefined,
  recipients: Recipient[],
  now: number,
): number | undefined {
  return recorded ?? (recipients.some(reachedDevice) ? now : undefined);
}

async function closeBetweenAttempts(
  ctx: MutationCtx,
  close: (fields: Closed) => Promise<void>,
  attempted: Recipient[] | undefined,
  deliveryError: string,
  event: {
    userId: string;
    notificationId: string;
    kind: string;
    itemCount: number;
    sentAt?: number;
  },
) {
  const now = Date.now();
  const delivered = attempted?.some(reachedDevice) ?? false;
  const sentAt = firstSendAt(event.sentAt, attempted ?? [], now);
  await close({
    deliveryStatus: delivered ? "complete" : "failed",
    deliveryNextAttemptAt: undefined,
    deliveredAt: delivered ? now : undefined,
    deliveryError,
    ...(sentAt !== undefined && { deliverySentAt: sentAt }),
  });
  if (attempted !== undefined)
    await ctx.scheduler.runAfter(0, internal.analytics.captureNotification, {
      userId: event.userId,
      notificationId: event.notificationId,
      kind: event.kind,
      itemCount: event.itemCount,
      delivered,
      sentAt: sentAt ?? now,
    });
}

export const claim = internalMutation({
  args: { digestId: v.id("weeklyDigests") },
  returns: v.union(
    v.null(),
    v.object({
      attempt: v.number(),
      recipients: v.array(recipientValidator),
      itemCount: v.number(),
      featuredTitle: v.optional(v.string()),
      olderIncluded: v.boolean(),
    }),
  ),
  handler: async (ctx, { digestId }) => {
    const digest = await ctx.db.get(digestId);
    const now = Date.now();
    if (
      !digest ||
      digest.deliveredAt !== undefined ||
      (digest.deliveryStatus !== undefined &&
        digest.deliveryStatus !== "pending") ||
      (digest.deliveryNextAttemptAt ?? 0) > now
    )
      return null;
    if ((await liveOwner(ctx, digest.userId)) === null) {
      await ctx.db.patch(digestId, OWNER_UNAVAILABLE);
      return null;
    }
    const preferences = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user", (q) => q.eq("userId", digest.userId))
      .unique();
    const attempts = digest.deliveryAttempts ?? 0;
    const close = (deliveryError: string) =>
      closeBetweenAttempts(
        ctx,
        (fields) => ctx.db.patch(digestId, fields),
        digest.deliveryRecipients,
        deliveryError,
        {
          userId: digest.userId,
          notificationId: digestId,
          kind: NOTIFICATION_KIND,
          itemCount: digest.itemIds.length,
          sentAt: digest.deliverySentAt,
        },
      );
    if (!preferences?.weeklyShelfEnabled) {
      await close("notifications_disabled");
      return null;
    }
    if (attempts >= MAX_ATTEMPTS || now - digest.createdAt >= MAX_AGE_MS) {
      await close("retry_limit_reached");
      return null;
    }
    const recipients = await liveRecipients(
      ctx,
      digest.userId,
      digest.deliveryRecipients,
    );
    const items = await Promise.all(digest.itemIds.map((id) => ctx.db.get(id)));
    const ready = items.flatMap((item) =>
      item !== null && item.userId === digest.userId && item.status === "ready"
        ? [item]
        : [],
    );
    const itemCount = ready.length;
    const featuredTitle = (
      ready.find(
        (item) => item.title !== undefined && item.enrichment === undefined,
      ) ?? ready.find((item) => item.title !== undefined)
    )?.title;
    const olderIncluded = ready.some(
      (item) => item._creationTime < digest.createdAt - DIGEST_WINDOW_MS,
    );
    if (recipients.length === 0 || itemCount === 0) {
      await close(itemCount === 0 ? "no_items" : "no_devices");
      return null;
    }
    const attempt = attempts + 1;
    await ctx.db.patch(digestId, {
      deliveryStatus: "pending",
      deliveryAttempts: attempt,
      deliveryRecipients: recipients,
      deliveryNextAttemptAt: now + LEASE_MS,
    });
    return { attempt, recipients, itemCount, featuredTitle, olderIncluded };
  },
});

export const finish = internalMutation({
  args: {
    digestId: v.id("weeklyDigests"),
    attempt: v.number(),
    recipients: v.array(recipientValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const digest = await ctx.db.get(args.digestId);
    if (
      !digest ||
      digest.deliveryStatus !== "pending" ||
      digest.deliveryAttempts !== args.attempt
    )
      return null;
    await releaseUnregistered(ctx, digest.userId, args.recipients);
    const now = Date.now();
    const { status, fields } = settle(
      args.recipients,
      args.attempt,
      now - digest.createdAt,
      MAX_AGE_MS,
      now,
    );
    const sentAt = firstSendAt(digest.deliverySentAt, args.recipients, now);
    await ctx.db.patch(digest._id, {
      ...fields,
      ...(sentAt !== undefined && { deliverySentAt: sentAt }),
    });
    if (status !== "pending" && (await liveOwner(ctx, digest.userId)) !== null)
      await ctx.scheduler.runAfter(0, internal.analytics.captureNotification, {
        userId: digest.userId,
        notificationId: digest._id,
        kind: NOTIFICATION_KIND,
        itemCount: digest.itemIds.length,
        delivered: status === "complete",
        sentAt: sentAt ?? now,
      });
    return null;
  },
});

function failedResult(
  recipient: Recipient,
  result: z.infer<typeof resultSchema>,
): Recipient {
  const error = result.details?.error ?? result.message ?? "unknown_push_error";
  return recipientError(recipient, error);
}

async function post(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`https://exp.host/--/api/v2/push/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`expo_http_${response.status}`);
  return await response.json();
}

async function exchange(
  initial: Recipient[],
  collapseId: string,
  message: (recipient: Recipient) => Record<string, unknown>,
): Promise<Recipient[]> {
  let recipients = initial;
  const awaiting = recipients.filter(
    (recipient) => recipient.state === "receipt",
  );
  if (awaiting.length) {
    try {
      const response = z
        .object({ data: z.record(z.string(), resultSchema) })
        .parse(
          await post("getReceipts", {
            ids: awaiting.map((recipient) => recipient.ticketId),
          }),
        );
      recipients = recipients.map((recipient): Recipient => {
        if (recipient.state !== "receipt") return recipient;
        const result = response.data[recipient.ticketId];
        if (!result) {
          return { ...recipient, error: "receipt_pending" };
        }
        if (result.status === "ok") {
          return {
            token: recipient.token,
            locale: recipient.locale,
            state: "delivered",
            ticketId: recipient.ticketId,
          };
        }
        return failedResult(recipient, result);
      });
    } catch (error) {
      recipients = recipients.map((recipient) =>
        recipient.state === "receipt"
          ? { ...recipient, error: String(error) }
          : recipient,
      );
    }
  }
  const pending = recipients.filter(
    (recipient) => recipient.state === "pending",
  );
  if (pending.length) {
    try {
      const response = z.object({ data: z.array(resultSchema) }).parse(
        await post(
          "send",
          pending.map((recipient) => ({
            to: recipient.token,
            collapseId,
            tag: collapseId,
            ...message(recipient),
          })),
        ),
      );
      if (response.data.length !== pending.length)
        throw new Error("expo_ticket_count_mismatch");
      let index = 0;
      recipients = recipients.map((recipient): Recipient => {
        if (recipient.state !== "pending") return recipient;
        const result = response.data[index++];
        if (result.status === "ok" && result.id) {
          return {
            token: recipient.token,
            locale: recipient.locale,
            state: "receipt",
            ticketId: result.id,
          };
        }
        return result.status === "error"
          ? failedResult(recipient, result)
          : { ...recipient, error: "expo_missing_ticket_id" };
      });
    } catch (error) {
      recipients = recipients.map((recipient) =>
        recipient.state === "pending"
          ? { ...recipient, error: String(error) }
          : recipient,
      );
    }
  }
  return recipients;
}

export const send = internalAction({
  args: { digestId: v.id("weeklyDigests") },
  returns: v.null(),
  handler: async (ctx, { digestId }) => {
    const delivery = await ctx.runMutation(
      internal.notificationDelivery.claim,
      { digestId },
    );
    if (!delivery) return null;
    const recipients = await exchange(
      delivery.recipients,
      digestId,
      (recipient) => ({
        ...digestCopy(
          recipient.locale,
          delivery.itemCount,
          delivery.featuredTitle,
          { olderIncluded: delivery.olderIncluded },
        ),
        data: {
          url: `/digest/${digestId}`,
          kind: NOTIFICATION_KIND,
          notificationId: digestId,
        },
        sound: "default",
        channelId: "weekly-shelf",
      }),
    );
    await ctx.runMutation(internal.notificationDelivery.finish, {
      digestId,
      attempt: delivery.attempt,
      recipients,
    });
    return null;
  },
});

export const claimReminder = internalMutation({
  args: { reminderId: v.id("saveReminders") },
  returns: v.union(
    v.null(),
    v.object({
      attempt: v.number(),
      recipients: v.array(recipientValidator),
      kind: v.union(v.literal("read"), v.literal("cook"), v.literal("visit")),
      itemId: v.id("items"),
      subject: v.string(),
    }),
  ),
  handler: async (ctx, { reminderId }) => {
    const reminder = await ctx.db.get(reminderId);
    const now = Date.now();
    if (
      !reminder ||
      reminder.deliveryStatus !== "pending" ||
      (reminder.deliveryNextAttemptAt ?? 0) > now
    )
      return null;
    if ((await liveOwner(ctx, reminder.userId)) === null) {
      await ctx.db.patch(reminderId, OWNER_UNAVAILABLE);
      return null;
    }
    const preferences = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user", (q) => q.eq("userId", reminder.userId))
      .unique();
    const attempts = reminder.deliveryAttempts ?? 0;
    const disabled = preferences !== null && !remindersOn(preferences);
    const paused = !saveRemindersLive();
    const fail = (deliveryError: string) =>
      closeBetweenAttempts(
        ctx,
        (fields) => ctx.db.patch(reminderId, fields),
        reminder.deliveryRecipients,
        deliveryError,
        {
          userId: reminder.userId,
          notificationId: reminderId,
          kind: reminderNotificationKind(reminder.kind),
          itemCount: 1,
          sentAt: reminder.deliverySentAt,
        },
      );
    if (
      paused ||
      disabled ||
      attempts >= MAX_ATTEMPTS ||
      now - reminder.createdAt >= REMINDER_MAX_AGE_MS
    ) {
      await fail(
        paused
          ? "reminders_paused"
          : disabled
            ? "notifications_disabled"
            : attempts >= MAX_ATTEMPTS
              ? "retry_limit_reached"
              : "expired",
      );
      return null;
    }
    const item = await ctx.db.get(reminder.itemId);
    const subject =
      item !== null &&
      item.userId === reminder.userId &&
      item.status === "ready"
        ? reminder.kind === "visit"
          ? placeToVisit(
              await visibleSave(ctx, item),
              visitedKeysOnItem(
                await userVisits(ctx, reminder.userId, [item]),
                item,
              ),
            )
          : reminderSubject(item, reminder.kind)
        : undefined;
    const read = await ctx.db
      .query("itemReads")
      .withIndex("by_user_and_item", (q) =>
        q.eq("userId", reminder.userId).eq("itemId", reminder.itemId),
      )
      .unique();
    const opened = openedTooRecently(reminder.kind, read?.lastOpenedAt, now);
    const recipients = (
      await liveRecipients(ctx, reminder.userId, reminder.deliveryRecipients)
    ).map(
      (recipient): Recipient =>
        opened && recipient.state === "pending"
          ? {
              token: recipient.token,
              locale: recipient.locale,
              state: "failed",
              error: "item_opened",
            }
          : recipient,
    );
    if (subject === undefined || recipients.length === 0) {
      await fail(subject === undefined ? "no_items" : "no_devices");
      return null;
    }
    const attempt = attempts + 1;
    await ctx.db.patch(reminderId, {
      deliveryAttempts: attempt,
      deliveryRecipients: recipients,
      deliveryNextAttemptAt: now + LEASE_MS,
    });
    return {
      attempt,
      recipients,
      kind: reminder.kind,
      itemId: reminder.itemId,
      subject,
    };
  },
});

export const finishReminder = internalMutation({
  args: {
    reminderId: v.id("saveReminders"),
    attempt: v.number(),
    recipients: v.array(recipientValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const reminder = await ctx.db.get(args.reminderId);
    if (
      !reminder ||
      reminder.deliveryStatus !== "pending" ||
      reminder.deliveryAttempts !== args.attempt
    )
      return null;
    await releaseUnregistered(ctx, reminder.userId, args.recipients);
    const now = Date.now();
    const { status, fields } = settle(
      args.recipients,
      args.attempt,
      now - reminder.createdAt,
      REMINDER_MAX_AGE_MS,
      now,
    );
    const sentAt = firstSendAt(reminder.deliverySentAt, args.recipients, now);
    await ctx.db.patch(reminder._id, {
      ...fields,
      ...(sentAt !== undefined && { deliverySentAt: sentAt }),
    });
    if (
      status !== "pending" &&
      (await liveOwner(ctx, reminder.userId)) !== null
    )
      await ctx.scheduler.runAfter(0, internal.analytics.captureNotification, {
        userId: reminder.userId,
        notificationId: reminder._id,
        kind: reminderNotificationKind(reminder.kind),
        itemCount: 1,
        delivered: status === "complete",
        sentAt: sentAt ?? now,
      });
    return null;
  },
});

export const sendReminder = internalAction({
  args: { reminderId: v.id("saveReminders") },
  returns: v.null(),
  handler: async (ctx, { reminderId }) => {
    const delivery = await ctx.runMutation(
      internal.notificationDelivery.claimReminder,
      { reminderId },
    );
    if (!delivery) return null;
    const recipients = await exchange(
      delivery.recipients,
      reminderId,
      (recipient) => ({
        ...reminderCopy(recipient.locale, delivery.kind, delivery.subject),
        data: {
          url: `/item/${delivery.itemId}`,
          kind: reminderNotificationKind(delivery.kind),
          notificationId: reminderId,
        },
        sound: "default",
        channelId: "save-reminders",
      }),
    );
    await ctx.runMutation(internal.notificationDelivery.finishReminder, {
      reminderId,
      attempt: delivery.attempt,
      recipients,
    });
    return null;
  },
});

export const claimTripEve = internalMutation({
  args: { reminderId: v.id("tripEveReminders") },
  returns: v.union(
    v.null(),
    v.object({
      attempt: v.number(),
      recipients: v.array(recipientValidator),
      tripId: v.id("tripPlans"),
      city: v.string(),
      count: v.number(),
    }),
  ),
  handler: async (ctx, { reminderId }) => {
    const reminder = await ctx.db.get(reminderId);
    const now = Date.now();
    if (
      !reminder ||
      reminder.deliveryStatus !== "pending" ||
      (reminder.deliveryNextAttemptAt ?? 0) > now
    )
      return null;
    if ((await liveOwner(ctx, reminder.userId)) === null) {
      await ctx.db.patch(reminderId, OWNER_UNAVAILABLE);
      return null;
    }
    const preferences = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user", (q) => q.eq("userId", reminder.userId))
      .unique();
    const attempts = reminder.deliveryAttempts ?? 0;
    const disabled = preferences !== null && !remindersOn(preferences);
    const paused = !saveRemindersLive();
    const trip = await ctx.db.get(reminder.tripId);
    const count =
      trip !== null && trip.userId === reminder.userId
        ? await tripSavedStopCount(ctx, trip._id)
        : 0;
    const fail = (deliveryError: string) =>
      closeBetweenAttempts(
        ctx,
        (fields) => ctx.db.patch(reminderId, fields),
        reminder.deliveryRecipients,
        deliveryError,
        {
          userId: reminder.userId,
          notificationId: reminderId,
          kind: TRIP_EVE_KIND,
          itemCount: count,
          sentAt: reminder.deliverySentAt,
        },
      );
    if (
      paused ||
      disabled ||
      attempts >= MAX_ATTEMPTS ||
      now - reminder.createdAt >= TRIP_EVE_MAX_AGE_MS
    ) {
      await fail(
        paused
          ? "reminders_paused"
          : disabled
            ? "notifications_disabled"
            : attempts >= MAX_ATTEMPTS
              ? "retry_limit_reached"
              : "expired",
      );
      return null;
    }
    const recipients = await liveRecipients(
      ctx,
      reminder.userId,
      reminder.deliveryRecipients,
    );
    if (trip === null || count === 0 || recipients.length === 0) {
      await fail(trip === null || count === 0 ? "no_items" : "no_devices");
      return null;
    }
    const attempt = attempts + 1;
    await ctx.db.patch(reminderId, {
      deliveryAttempts: attempt,
      deliveryRecipients: recipients,
      deliveryNextAttemptAt: now + LEASE_MS,
    });
    return { attempt, recipients, tripId: trip._id, city: trip.city, count };
  },
});

export const finishTripEve = internalMutation({
  args: {
    reminderId: v.id("tripEveReminders"),
    attempt: v.number(),
    recipients: v.array(recipientValidator),
    count: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const reminder = await ctx.db.get(args.reminderId);
    if (
      !reminder ||
      reminder.deliveryStatus !== "pending" ||
      reminder.deliveryAttempts !== args.attempt
    )
      return null;
    await releaseUnregistered(ctx, reminder.userId, args.recipients);
    const now = Date.now();
    const { status, fields } = settle(
      args.recipients,
      args.attempt,
      now - reminder.createdAt,
      TRIP_EVE_MAX_AGE_MS,
      now,
    );
    const sentAt = firstSendAt(reminder.deliverySentAt, args.recipients, now);
    await ctx.db.patch(reminder._id, {
      ...fields,
      ...(sentAt !== undefined && { deliverySentAt: sentAt }),
    });
    if (
      status !== "pending" &&
      (await liveOwner(ctx, reminder.userId)) !== null
    )
      await ctx.scheduler.runAfter(0, internal.analytics.captureNotification, {
        userId: reminder.userId,
        notificationId: reminder._id,
        kind: TRIP_EVE_KIND,
        itemCount: args.count,
        delivered: status === "complete",
        sentAt: sentAt ?? now,
      });
    return null;
  },
});

export const sendTripEve = internalAction({
  args: { reminderId: v.id("tripEveReminders") },
  returns: v.null(),
  handler: async (ctx, { reminderId }) => {
    const delivery = await ctx.runMutation(
      internal.notificationDelivery.claimTripEve,
      { reminderId },
    );
    if (!delivery) return null;
    const recipients = await exchange(
      delivery.recipients,
      reminderId,
      (recipient) => ({
        ...tripEveCopy(recipient.locale, delivery.city, delivery.count),
        data: {
          url: `/trip-plan/${delivery.tripId}`,
          kind: TRIP_EVE_KIND,
          notificationId: reminderId,
        },
        sound: "default",
        channelId: "save-reminders",
      }),
    );
    await ctx.runMutation(internal.notificationDelivery.finishTripEve, {
      reminderId,
      attempt: delivery.attempt,
      recipients,
      count: delivery.count,
    });
    return null;
  },
});

export const claimPlanVote = internalMutation({
  args: { noticeId: v.id("planVoteNotices") },
  returns: v.union(
    v.null(),
    v.object({
      attempt: v.number(),
      recipients: v.array(recipientValidator),
      city: v.string(),
      subject: v.object({
        name: v.optional(v.string()),
        place: v.string(),
        choice: v.union(v.literal("pick"), v.literal("pass")),
      }),
      voters: v.number(),
    }),
  ),
  handler: async (ctx, { noticeId }) => {
    const notice = await ctx.db.get(noticeId);
    const now = Date.now();
    if (
      !notice ||
      notice.deliveryStatus !== "pending" ||
      (notice.deliveryNextAttemptAt ?? 0) > now
    )
      return null;
    const share = await ctx.db.get(notice.shareId);
    const linkGone = () =>
      ctx.db.patch(noticeId, {
        deliveryStatus: "failed",
        deliveryNextAttemptAt: undefined,
        deliveryError: "link_gone",
      });
    if (share === null) {
      await linkGone();
      return null;
    }
    if ((await liveOwner(ctx, share.userId)) === null) {
      await ctx.db.patch(noticeId, OWNER_UNAVAILABLE);
      return null;
    }
    const space = await ctx.db.get(share.spaceId);
    if (space === null || space.userId !== share.userId) {
      await linkGone();
      return null;
    }
    const preferences = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user", (q) => q.eq("userId", share.userId))
      .unique();
    const live = await liveSharePlaces(ctx, share);
    const votes = await shareVotes(ctx, share._id);
    const newest =
      share.city === undefined
        ? null
        : await newestCityShare(ctx, share.userId, share.city);
    const subject = pushSubject(
      votes,
      notice.voterId,
      live.map(({ place }) => place),
    );
    const fail = (deliveryError: string) =>
      closeBetweenAttempts(
        ctx,
        (fields) => ctx.db.patch(noticeId, fields),
        notice.deliveryRecipients,
        deliveryError,
        {
          userId: share.userId,
          notificationId: noticeId,
          kind: PLAN_VOTE_KIND,
          itemCount: votes.length,
          sentAt: notice.deliverySentAt,
        },
      );
    const reason = planVoteRefusal({
      live: planVotePushLive(),
      disabled: preferences !== null && !remindersOn(preferences),
      exhausted: (notice.deliveryAttempts ?? 0) >= MAX_ATTEMPTS,
      expired:
        now - notice.createdAt >= PLAN_VOTE_MAX_AGE_MS ||
        share.expiresAt <= now,
      newest: newest?._id === share._id,
      subject: subject !== null,
    });
    if (reason !== null || share.city === undefined || subject === null) {
      await fail(reason ?? "superseded");
      return null;
    }
    const recipients = await liveRecipients(
      ctx,
      share.userId,
      notice.deliveryRecipients,
    );
    if (recipients.length === 0) {
      await fail("no_devices");
      return null;
    }
    const attempt = (notice.deliveryAttempts ?? 0) + 1;
    await ctx.db.patch(noticeId, {
      deliveryAttempts: attempt,
      deliveryRecipients: recipients,
      deliveryNextAttemptAt: now + LEASE_MS,
    });
    return {
      attempt,
      recipients,
      city: share.city,
      subject,
      voters: votes.length,
    };
  },
});

export const finishPlanVote = internalMutation({
  args: {
    noticeId: v.id("planVoteNotices"),
    attempt: v.number(),
    recipients: v.array(recipientValidator),
    voters: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const notice = await ctx.db.get(args.noticeId);
    if (
      !notice ||
      notice.deliveryStatus !== "pending" ||
      notice.deliveryAttempts !== args.attempt
    )
      return null;
    const share = await ctx.db.get(notice.shareId);
    if (share !== null) {
      await releaseUnregistered(ctx, share.userId, args.recipients);
    }
    const now = Date.now();
    const { status, fields } = settle(
      args.recipients,
      args.attempt,
      now - notice.createdAt,
      PLAN_VOTE_MAX_AGE_MS,
      now,
    );
    const sentAt = firstSendAt(notice.deliverySentAt, args.recipients, now);
    await ctx.db.patch(notice._id, {
      ...fields,
      ...(sentAt !== undefined && { deliverySentAt: sentAt }),
    });
    if (
      status !== "pending" &&
      share !== null &&
      (await liveOwner(ctx, share.userId)) !== null
    )
      await ctx.scheduler.runAfter(0, internal.analytics.captureNotification, {
        userId: share.userId,
        notificationId: notice._id,
        kind: PLAN_VOTE_KIND,
        itemCount: args.voters,
        delivered: status === "complete",
        sentAt: sentAt ?? now,
      });
    return null;
  },
});

export const sendPlanVote = internalAction({
  args: { noticeId: v.id("planVoteNotices") },
  returns: v.null(),
  handler: async (ctx, { noticeId }) => {
    const delivery = await ctx.runMutation(
      internal.notificationDelivery.claimPlanVote,
      { noticeId },
    );
    if (!delivery) return null;
    const recipients = await exchange(
      delivery.recipients,
      noticeId,
      (recipient) => ({
        ...planVoteCopy(recipient.locale, delivery.city, delivery.subject),
        data: {
          url: `/city/${encodeURIComponent(delivery.city)}`,
          kind: PLAN_VOTE_KIND,
          notificationId: noticeId,
        },
        sound: "default",
        channelId: "plan-votes",
      }),
    );
    await ctx.runMutation(internal.notificationDelivery.finishPlanVote, {
      noticeId,
      attempt: delivery.attempt,
      recipients,
      voters: delivery.voters,
    });
    return null;
  },
});
