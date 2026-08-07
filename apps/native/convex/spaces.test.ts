// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest, type TestConvexForDataModel } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "@convex/_generated/api";
import type { DataModel } from "@convex/_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type TestCtx = TestConvexForDataModel<DataModel>;

async function entitledUser(userId: string): Promise<TestCtx> {
  const t = convexTest(schema, modules).withIdentity({
    subject: `${userId}|session-1`,
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("subscriptions", {
      userId,
      status: "pro",
      expiresAt: Date.now() + 60_000,
      updatedAt: Date.now(),
    });
  });
  return t;
}

describe("space creation", () => {
  it("is idempotent by trimmed name for onboarding retries", async () => {
    const t = await entitledUser("user-a");

    const first = await t.mutation(api.spaces.createSpace, {
      name: "  Read later  ",
    });
    const second = await t.mutation(api.spaces.createSpace, {
      name: "Read later",
    });

    expect(second).toBe(first);

    await t.run(async (ctx) => {
      const subscription = await ctx.db
        .query("subscriptions")
        .withIndex("by_user", (q) => q.eq("userId", "user-a"))
        .unique();
      if (subscription === null) throw new Error("Subscription not found");
      await ctx.db.patch(subscription._id, {
        status: "lapsed",
        expiresAt: Date.now() - 1,
      });
    });

    await expect(
      t.mutation(api.spaces.createSpace, { name: "A new space" }),
    ).rejects.toThrow("Pro required");

    const retriedAfterLapse = await t.mutation(api.spaces.createSpace, {
      name: " Read later ",
    });
    expect(retriedAfterLapse).toBe(first);

    const spaces = await t.run(async (ctx) =>
      await ctx.db
        .query("spaces")
        .withIndex("by_user", (q) => q.eq("userId", "user-a"))
        .collect(),
    );
    expect(spaces).toHaveLength(1);
  });
});
