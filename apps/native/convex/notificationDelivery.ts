import { v } from "convex/values";
import { z } from "zod";
import {
  internalAction,
  internalMutation,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  recipientValidator,
  digestCopy,
  recipientError,
  reminderCopy,
  type Recipient,
} from "./model/notificationFields";
import { reminderSubject } from "./model/saveReminders";

/** Each kind rides in the payload and in telemetry, so an open is attributed
 * to what was sent. */
export const NOTIFICATION_KIND = "weekly_shelf";
export const reminderNotificationKind = (kind: "read" | "cook") =>
  `${kind}_reminder`;

const LEASE_MS = 5 * 60 * 1000;
const RECEIPT_DELAY_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** A reminder says "today", so one that could not go out within a few hours
 * is dropped rather than delivered late with the wrong day in it. */
const REMINDER_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const MAX_DEVICES_PER_DIGEST = 20;
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
    // Upgrade pre-retry rows in bounded batches, including failed legacy sends.
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
    return null;
  },
});

/**
 * The user's live devices, reconciled with the recipients of an earlier
 * attempt: a device disabled since then is failed out instead of retried, and
 * a device's current locale wins over the one stored with the attempt.
 */
async function liveRecipients(
  ctx: MutationCtx,
  userId: string,
  stored: Recipient[] | undefined,
): Promise<Recipient[]> {
  // Read enabled devices straight from the index. A user who has cycled many
  // tokens keeps every disabled row, and those rows must not count against
  // the page of live recipients or be scanned on every attempt.
  const devices = await ctx.db
    .query("notificationDevices")
    .withIndex("by_user_and_enabled", (q) =>
      q.eq("userId", userId).eq("enabled", true),
    )
    .take(MAX_DEVICES_PER_DIGEST);
  const tokens = new Set(devices.map((device) => device.token));
  return (
    stored ??
    devices.map((device) => ({
      token: device.token,
      locale: device.locale,
      state: "pending" as const,
    }))
  ).map((recipient): Recipient => {
    if (
      (recipient.state === "pending" || recipient.state === "receipt") &&
      !tokens.has(recipient.token)
    ) {
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

/** Disables the user's devices that Expo reports as no longer registered. */
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

/** The delivery fields an attempt's outcome writes, and its status. */
function settle(
  recipients: Recipient[],
  attempt: number,
  age: number,
  maxAge: number,
  now: number,
) {
  const pending = recipients.some(
    (recipient) =>
      recipient.state === "pending" || recipient.state === "receipt",
  );
  const exhausted = attempt >= MAX_ATTEMPTS || age >= maxAge;
  const retry = pending && !exhausted;
  const anyDelivered = recipients.some(
    (recipient) => recipient.state === "delivered",
  );
  const status: "pending" | "complete" | "failed" = retry
    ? "pending"
    : pending || !anyDelivered
      ? "failed"
      : "complete";
  return {
    status,
    fields: {
      deliveryRecipients: recipients,
      deliveryStatus: status,
      deliveryNextAttemptAt: retry
        ? now + Math.min(RECEIPT_DELAY_MS * 2 ** (attempt - 1), 60 * 60 * 1000)
        : undefined,
      // This records provider acceptance from receipts, not a device read acknowledgment.
      deliveredAt: !pending && anyDelivered ? now : undefined,
      deliveryError:
        pending && exhausted
          ? "retry_limit_reached"
          : recipients.find((recipient) => recipient.error)?.error,
    },
  };
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
    const preferences = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user", (q) => q.eq("userId", digest.userId))
      .unique();
    const attempts = digest.deliveryAttempts ?? 0;
    if (
      !preferences?.weeklyShelfEnabled ||
      attempts >= MAX_ATTEMPTS ||
      now - digest.createdAt >= MAX_AGE_MS
    ) {
      await ctx.db.patch(digestId, {
        deliveryStatus: "failed",
        deliveryNextAttemptAt: undefined,
        deliveryError: !preferences?.weeklyShelfEnabled
          ? "notifications_disabled"
          : "retry_limit_reached",
      });
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
    // The save the body names. A `partial` enrichment means the title was
    // guessed from the URL alone because the page could not be read, so one is
    // only named when nothing better is on the shelf. Resolved at claim time,
    // not at creation, so a retry names whatever is still there.
    const featuredTitle = (
      ready.find(
        (item) => item.title !== undefined && item.enrichment === undefined,
      ) ?? ready.find((item) => item.title !== undefined)
    )?.title;
    if (recipients.length === 0 || itemCount === 0) {
      await ctx.db.patch(digestId, {
        deliveryStatus: "failed",
        deliveryNextAttemptAt: undefined,
        deliveryError: itemCount === 0 ? "no_items" : "no_devices",
      });
      return null;
    }
    const attempt = attempts + 1;
    await ctx.db.patch(digestId, {
      deliveryStatus: "pending",
      deliveryAttempts: attempt,
      deliveryRecipients: recipients,
      deliveryNextAttemptAt: now + LEASE_MS,
    });
    return { attempt, recipients, itemCount, featuredTitle };
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
    await ctx.db.patch(digest._id, fields);
    // Exactly one event per digest: `finish` bails above unless it is the
    // attempt that owns the lease, and a non-pending status is terminal, so
    // this transition happens once however many times delivery is retried.
    if (status !== "pending")
      await ctx.scheduler.runAfter(0, internal.analytics.captureNotification, {
        userId: digest.userId,
        notificationId: digest._id,
        kind: NOTIFICATION_KIND,
        itemCount: digest.itemIds.length,
        delivered: status === "complete",
        sentAt: now,
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

/**
 * One delivery attempt against Expo: collect receipts for tickets from the
 * previous attempt, then send `message` to every recipient still pending.
 * Returns the recipients' new states for the caller's `finish` to settle.
 */
async function exchange(
  initial: Recipient[],
  message: (recipient: Recipient) => Record<string, unknown>,
): Promise<Recipient[]> {
  let recipients = initial;
  // Check old tickets before sending pending tokens; newly accepted tickets wait for the next run.
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
    const recipients = await exchange(delivery.recipients, (recipient) => ({
      ...digestCopy(
        recipient.locale,
        delivery.itemCount,
        delivery.featuredTitle,
      ),
      data: {
        url: `/digest/${digestId}`,
        kind: NOTIFICATION_KIND,
        notificationId: digestId,
      },
      sound: "default",
      channelId: "weekly-shelf",
    }));
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
      kind: v.union(v.literal("read"), v.literal("cook")),
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
    const preferences = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user", (q) => q.eq("userId", reminder.userId))
      .unique();
    const attempts = reminder.deliveryAttempts ?? 0;
    const disabled = preferences?.remindersEnabled === false;
    const fail = (deliveryError: string) =>
      ctx.db.patch(reminderId, {
        deliveryStatus: "failed",
        deliveryNextAttemptAt: undefined,
        deliveryError,
      });
    if (
      disabled ||
      attempts >= MAX_ATTEMPTS ||
      now - reminder.createdAt >= REMINDER_MAX_AGE_MS
    ) {
      await fail(disabled ? "notifications_disabled" : "retry_limit_reached");
      return null;
    }
    // Resolved on every attempt, so a save deleted or renamed since the
    // reminder was chosen is never named.
    const item = await ctx.db.get(reminder.itemId);
    const subject =
      item !== null &&
      item.userId === reminder.userId &&
      item.status === "ready"
        ? reminderSubject(item, reminder.kind)
        : undefined;
    const recipients = await liveRecipients(
      ctx,
      reminder.userId,
      reminder.deliveryRecipients,
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
    await ctx.db.patch(reminder._id, fields);
    // One event per reminder, for the same reason as the digest's.
    if (status !== "pending")
      await ctx.scheduler.runAfter(0, internal.analytics.captureNotification, {
        userId: reminder.userId,
        notificationId: reminder._id,
        kind: reminderNotificationKind(reminder.kind),
        itemCount: 1,
        delivered: status === "complete",
        sentAt: now,
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
    const recipients = await exchange(delivery.recipients, (recipient) => ({
      ...reminderCopy(recipient.locale, delivery.kind, delivery.subject),
      // Straight to the save: the notification already said which one.
      data: {
        url: `/item/${delivery.itemId}`,
        kind: reminderNotificationKind(delivery.kind),
        notificationId: reminderId,
      },
      sound: "default",
      channelId: "save-reminders",
    }));
    await ctx.runMutation(internal.notificationDelivery.finishReminder, {
      reminderId,
      attempt: delivery.attempt,
      recipients,
    });
    return null;
  },
});
