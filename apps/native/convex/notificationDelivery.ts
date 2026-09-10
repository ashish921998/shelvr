import { v } from "convex/values";
import { z } from "zod";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  recipientValidator,
  recipientError,
  type Recipient,
} from "./model/notificationDelivery";

const LEASE_MS = 5 * 60 * 1000;
const RECEIPT_DELAY_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
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
    return null;
  },
});

export const claim = internalMutation({
  args: { digestId: v.id("weeklyDigests") },
  returns: v.union(
    v.null(),
    v.object({
      attempt: v.number(),
      recipients: v.array(recipientValidator),
      itemCount: v.number(),
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
    // Read enabled devices straight from the index. A user who has cycled many
    // tokens keeps every disabled row, and those rows must not count against
    // the page of live recipients or be scanned on every attempt.
    const devices = await ctx.db
      .query("notificationDevices")
      .withIndex("by_user_and_enabled", (q) =>
        q.eq("userId", digest.userId).eq("enabled", true),
      )
      .take(MAX_DEVICES_PER_DIGEST);
    const tokens = new Set(devices.map((device) => device.token));
    const recipients: Recipient[] = (
      digest.deliveryRecipients ??
      devices.map((device) => ({
        token: device.token,
        state: "pending" as const,
      }))
    ).map((recipient): Recipient => {
      if (
        (recipient.state === "pending" || recipient.state === "receipt") &&
        !tokens.has(recipient.token)
      ) {
        return {
          token: recipient.token,
          state: "failed",
          error: "device_unavailable",
        };
      }
      return recipient;
    });
    const items = await Promise.all(digest.itemIds.map((id) => ctx.db.get(id)));
    const itemCount = items.filter(
      (item) => item?.userId === digest.userId && item.status === "ready",
    ).length;
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
    return { attempt, recipients, itemCount };
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
    for (const recipient of args.recipients) {
      if (recipient.error !== "DeviceNotRegistered") continue;
      const device = await ctx.db
        .query("notificationDevices")
        .withIndex("by_token", (q) => q.eq("token", recipient.token))
        .unique();
      if (device?.userId === digest.userId)
        await ctx.db.patch(device._id, { enabled: false });
    }
    const now = Date.now();
    const pending = args.recipients.some(
      (recipient) =>
        recipient.state === "pending" || recipient.state === "receipt",
    );
    const exhausted =
      args.attempt >= MAX_ATTEMPTS || now - digest.createdAt >= MAX_AGE_MS;
    const retry = pending && !exhausted;
    const anyDelivered = args.recipients.some(
      (recipient) => recipient.state === "delivered",
    );
    await ctx.db.patch(digest._id, {
      deliveryRecipients: args.recipients,
      deliveryStatus: retry
        ? "pending"
        : pending || !anyDelivered
          ? "failed"
          : "complete",
      deliveryNextAttemptAt: retry
        ? now +
          Math.min(RECEIPT_DELAY_MS * 2 ** (args.attempt - 1), 60 * 60 * 1000)
        : undefined,
      // This records provider acceptance from receipts, not a device read acknowledgment.
      deliveredAt: !pending && anyDelivered ? now : undefined,
      deliveryError:
        pending && exhausted
          ? "retry_limit_reached"
          : args.recipients.find((recipient) => recipient.error)?.error,
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

export const send = internalAction({
  args: { digestId: v.id("weeklyDigests") },
  returns: v.null(),
  handler: async (ctx, { digestId }) => {
    const delivery = await ctx.runMutation(
      internal.notificationDelivery.claim,
      { digestId },
    );
    if (!delivery) return null;
    let recipients: Recipient[] = delivery.recipients;
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
              title: "Your weekly shelf is ready",
              body: `${delivery.itemCount} saved things are waiting on your weekly shelf.`,
              data: { url: `/digest/${digestId}` },
              sound: "default",
              channelId: "weekly-shelf",
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
    await ctx.runMutation(internal.notificationDelivery.finish, {
      digestId,
      attempt: delivery.attempt,
      recipients,
    });
    return null;
  },
});
