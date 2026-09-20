// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { newConvexTest } from "./test.setup";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("REVENUECAT_WEBHOOK_SECRET", "test-secret");
  vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "false");
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("billing issue webhook", () => {
  it("keeps a Pro subscriber saving until the grace period ends", async () => {
    const t = newConvexTest();
    const userId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", {});
      await ctx.db.insert("subscriptions", {
        userId: id,
        status: "pro",
        productId: "monthly_499",
        expiresAt: Date.now() + 60_000,
        updatedAt: 1,
        eventTimestampMs: 1,
      });
      return id;
    });
    const gracePeriodEnd = Date.now() + 16 * 24 * 60 * 60 * 1000;

    const response = await t.fetch("/webhooks/revenuecat", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
      body: JSON.stringify({
        event: {
          type: "BILLING_ISSUE",
          app_user_id: userId,
          product_id: "monthly_499",
          expiration_at_ms: Date.now() - 1,
          grace_period_expiration_at_ms: gracePeriodEnd,
          event_timestamp_ms: 2,
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("subscriptions")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .unique(),
      ),
    ).toMatchObject({ status: "pro", expiresAt: gracePeriodEnd });
    await expect(
      t
        .withIdentity({ subject: `${userId}|session-1` })
        .mutation(api.items.createNoteItem, { text: "grace period save" }),
    ).resolves.toBeDefined();
  });
});
