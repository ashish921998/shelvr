// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest, type TestConvexForDataModel } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type TestCtx = TestConvexForDataModel<DataModel>;

function signedInAs(userId: string): TestCtx {
  return convexTest(schema, modules).withIdentity({
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
});
