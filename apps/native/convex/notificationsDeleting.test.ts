// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  newConvexTest,
  seedNotes,
  signedInUser,
  type TestBackend,
} from "./test.setup";
import { DELETE_BATCH } from "./users";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-09-25T18:00:00Z");

/**
 * An account whose deletion is still draining (row marked `deleting`, later
 * batches not yet run) must get no new weekly shelf or save reminder, and a
 * notification prepared before the tap must find no recipient. The weekly
 * shelf and reminder passes read only preferences and devices, so the first
 * deletion transaction removes both, next to the capture tokens.
 */
describe("notifications for an account mid-deletion", () => {
  // Scheduled continuations run on timers in convex-test; fake timers keep the
  // deletion parked between its first and second batch for the whole test.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("SAVE_REMINDERS_ENABLED", "true");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  /** `shelfDue` makes the weekly shelf due now; off, the shelf is a week out
   * so it does not take the day's one slot ahead of a save reminder. */
  async function deletingUser({ shelfDue = true } = {}) {
    const backend = newConvexTest();
    // The account row and its saves predate the deletion by days, so the
    // article qualifies for a read reminder. More saves than one deletion
    // batch removes, so the first transaction marks the row `deleting` and
    // schedules a continuation that this test never runs: the account is
    // caught between two batches. The notes go in first, so the first batch
    // drains them and leaves the article in place.
    vi.setSystemTime(NOW - 4 * DAY);
    const { t, userId } = await signedInUser(backend);
    vi.setSystemTime(NOW - 3 * DAY);
    await seedNotes(backend, userId, DELETE_BATCH + 5);
    vi.setSystemTime(NOW - 3 * DAY + 1000);
    const articleId = await backend.run((ctx) =>
      ctx.db.insert("items", {
        userId,
        type: "link",
        status: "ready",
        tags: [],
        searchText: "",
        title: "Why bread rises",
        content: "A long read about yeast.",
      }),
    );
    vi.setSystemTime(NOW);
    await backend.run(async (ctx) => {
      await ctx.db.insert("notificationPreferences", {
        userId,
        weeklyShelfEnabled: true,
        nextDigestAt: shelfDue ? NOW - 1 : NOW + 7 * DAY,
        nextReminderAt: NOW - 1,
        timezone: "UTC",
        updatedAt: NOW,
      });
      await ctx.db.insert("notificationDevices", {
        userId,
        token: "ExponentPushToken[deleting]",
        platform: "ios",
        enabled: true,
        lastSeenAt: NOW,
      });
    });
    await t.mutation(api.users.deleteCurrentUserAccount, {});
    const user = await backend.run((ctx) => ctx.db.get(userId));
    expect(user?.deleting).toBe(true);
    const remaining = await backend.run((ctx) =>
      ctx.db
        .query("items")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    );
    expect(remaining.map((item) => item._id)).toContain(articleId);
    return { backend, userId, articleId };
  }

  const digests = (backend: TestBackend, userId: Id<"users">) =>
    backend.run((ctx) =>
      ctx.db
        .query("weeklyDigests")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    );
  const reminders = (backend: TestBackend, userId: Id<"users">) =>
    backend.run((ctx) =>
      ctx.db
        .query("saveReminders")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    );

  it("removes the push devices and preferences in the first deletion transaction", async () => {
    const { backend, userId } = await deletingUser();
    const [devices, preferences] = await backend.run((ctx) =>
      Promise.all([
        ctx.db
          .query("notificationDevices")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect(),
        ctx.db
          .query("notificationPreferences")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect(),
      ]),
    );
    expect(devices).toHaveLength(0);
    expect(preferences).toHaveLength(0);
  });

  it("prepareWeeklyDigest writes no digest for an owner marked deleting", async () => {
    const { backend, userId } = await deletingUser();
    // The hourly cron tick lands between two deletion batches.
    await backend.mutation(internal.notifications.prepareWeeklyDigest, {
      userId,
      now: NOW,
    });
    expect(await digests(backend, userId)).toHaveLength(0);
  });

  it("prepareSaveReminder writes no reminder for an owner marked deleting", async () => {
    const { backend, userId } = await deletingUser({ shelfDue: false });
    await backend.mutation(internal.notifications.prepareSaveReminder, {
      userId,
      now: NOW,
    });
    expect(await reminders(backend, userId)).toHaveLength(0);
  });

  it("claim hands no recipients for a digest whose owner is deleting", async () => {
    const { backend, userId, articleId } = await deletingUser();
    // A shelf prepared just before the user tapped Delete, not yet sent.
    const digestId = await backend.run((ctx) =>
      ctx.db.insert("weeklyDigests", {
        userId,
        weekStart: NOW,
        itemIds: [articleId],
        createdAt: NOW,
        deliveryStatus: "pending",
        deliveryNextAttemptAt: NOW,
      }),
    );
    const delivery = await backend.mutation(
      internal.notificationDelivery.claim,
      { digestId },
    );
    expect(delivery).toBeNull();
    // Closed for good, so the recovery cron never retries it.
    const digest = await backend.run((ctx) => ctx.db.get(digestId));
    expect(digest?.deliveryStatus).toBe("failed");
    expect(digest?.deliveryNextAttemptAt).toBeUndefined();
  });

  it("claimReminder hands no recipients for a reminder whose owner is deleting", async () => {
    const { backend, userId, articleId } = await deletingUser();
    const reminderId = await backend.run((ctx) =>
      ctx.db.insert("saveReminders", {
        userId,
        itemId: articleId,
        kind: "read",
        createdAt: NOW,
        deliveryStatus: "pending",
        deliveryNextAttemptAt: NOW,
      }),
    );
    const delivery = await backend.mutation(
      internal.notificationDelivery.claimReminder,
      { reminderId },
    );
    expect(delivery).toBeNull();
    const reminder = await backend.run((ctx) => ctx.db.get(reminderId));
    expect(reminder?.deliveryStatus).toBe("failed");
    expect(reminder?.deliveryNextAttemptAt).toBeUndefined();
  });
});
