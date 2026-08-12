// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import type { TestConvexForDataModel } from "convex-test";
import { newConvexTest } from "./test.setup";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";

type TestCtx = TestConvexForDataModel<DataModel>;

function signedInAs(userId: string): TestCtx {
  return newConvexTest().withIdentity({
    subject: `${userId}|session-1`,
  });
}

describe("Convex Auth identity boundaries", () => {
  it("uses the stable users-table id instead of the session-bearing subject", async () => {
    const t = signedInAs("user-a");
    await t.run(async (ctx) => {
      await ctx.db.insert("subscriptions", {
        userId: "user-a",
        status: "pro",
        expiresAt: Date.now() + 60_000,
        updatedAt: Date.now(),
      });
    });

    await expect(t.query(api.subscriptions.getEntitlement, {})).resolves.toEqual({
      status: "pro",
      expiresAt: expect.any(Number),
    });
  });
});

describe("RevenueCat subscription webhook writes", () => {
  it("acknowledges a non-Convex app user id without creating a row", async () => {
    const t = signedInAs("user-a");

    await expect(
      t.mutation(internal.subscriptions.upsertSubscription, {
        userId: "1d2ff20a-7139-4398-b4e0-c03dc1b0b6dc",
        status: "trialing",
        expiresAt: Date.now() + 60_000,
        eventTimestampMs: 1,
      }),
    ).resolves.toBeNull();

    const rows = await t.run(async (ctx) => await ctx.db.query("subscriptions").collect());
    expect(rows).toEqual([]);
  });

  it("does not create Pro for a first-seen advisory event", async () => {
    const t = signedInAs("user-a");

    await t.mutation(internal.subscriptions.upsertSubscription, {
      userId: "user-a",
      expiresAt: Date.now() + 60_000,
      eventTimestampMs: 1,
    });

    const row = await t.run(async (ctx) =>
      await ctx.db
        .query("subscriptions")
        .withIndex("by_user", (q) => q.eq("userId", "user-a"))
        .unique(),
    );
    expect(row).toBeNull();
  });

  it("writes a subscription for a user that exists", async () => {
    const t = signedInAs("user-live");

    // The webhook's userId is the Convex Auth users-table document id.
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", { email: "live@example.com" });
    });

    await t.mutation(internal.subscriptions.upsertSubscription, {
      userId: userId as string,
      status: "trialing",
      expiresAt: Date.now() + 60_000,
      eventTimestampMs: 1,
    });

    const row = await t.run(async (ctx) =>
      await ctx.db
        .query("subscriptions")
        .withIndex("by_user", (q) => q.eq("userId", userId as string))
        .unique(),
    );
    expect(row?.status).toBe("trialing");
  });

  it("does not resurrect a deleted user's row on a renewal webhook", async () => {
    const t = signedInAs("user-gone");
    const originalExpiresAt = Date.now() + 60_000;

    const userId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", { email: "gone@example.com" });
      // Seed an active subscription, then delete the user (as account deletion
      // does) but leave the subscription row behind to model a post-deletion
      // renewal event arriving.
      await ctx.db.insert("subscriptions", {
        userId: id as string,
        status: "trialing",
        expiresAt: originalExpiresAt,
        updatedAt: Date.now(),
        eventTimestampMs: 1,
      });
      await ctx.db.delete(id);
      return id;
    });

    // A newer renewal event arrives after deletion.
    await t.mutation(internal.subscriptions.upsertSubscription, {
      userId: userId as string,
      status: "pro",
      expiresAt: Date.now() + 120_000,
      eventTimestampMs: 2,
    });

    const row = await t.run(async (ctx) =>
      await ctx.db
        .query("subscriptions")
        .withIndex("by_user", (q) => q.eq("userId", userId as string))
        .unique(),
    );
    // The stale row is neither patched nor a fresh one inserted.
    expect(row).toMatchObject({
      status: "trialing",
      expiresAt: originalExpiresAt,
      eventTimestampMs: 1,
    });
  });
});
