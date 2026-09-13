// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { newConvexTest } from "./test.setup";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { TestConvexForDataModel } from "convex-test";
import type { DataModel } from "./_generated/dataModel";

type TestCtx = TestConvexForDataModel<DataModel>;

// Mirrors spaces.test.ts's helper: an authenticated, Pro-entitled test user.
async function entitledUser(userId: string): Promise<TestCtx> {
  const t = newConvexTest().withIdentity({
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

/**
 * Regression: explicit space assignment must survive the async classification
 * pipeline ("upload completed but was not assigned to selected space"). The
 * create transaction writes a `saved` row; the pipeline may only add
 * `suggested` rows into DYNAMIC spaces. The client half of the original bug
 * (onboarding replay creating spaces without `dynamic: true`) lives in
 * lib/replay-onboarding.ts; the last test pins the server default it relies on.
 */
describe("explicit space assignment vs classification", () => {
  it("keeps the user's saved assignment when classification suggests other spaces", async () => {
    const t = await entitledUser("assign-user");
    const dynamicSpace = await t.mutation(api.spaces.createSpace, {
      name: "Recipes",
      dynamic: true,
    });
    const itemId = await t.mutation(api.items.createLinkItem, {
      url: "https://example.com/recipe",
      spaceId: dynamicSpace,
    });

    // Classification suggests a different dynamic space entirely.
    const otherSpace = await t.mutation(api.spaces.createSpace, {
      name: "Travel",
      dynamic: true,
    });
    await t.mutation(internal.items.setSpacesForItem, {
      itemId,
      spaceIds: [otherSpace],
    });

    await t.run(async (ctx) => {
      const joins = await ctx.db
        .query("spaceItems")
        .withIndex("by_item", (q) => q.eq("itemId", itemId))
        .collect();
      const bySpace = new Map(joins.map((j) => [j.spaceId, j.status]));
      // The explicit assignment is untouched — never downgraded to suggested.
      expect(bySpace.get(dynamicSpace)).toBe("saved");
      // The AI's pick landed as a suggestion only.
      expect(bySpace.get(otherSpace)).toBe("suggested");
    });
  });

  it("never duplicates a membership when classification re-proposes the saved space", async () => {
    const t = await entitledUser("dupe-user");
    const space = await t.mutation(api.spaces.createSpace, {
      name: "Read later",
      dynamic: true,
    });
    const itemId = await t.mutation(api.items.createLinkItem, {
      url: "https://example.com",
      spaceId: space,
    });

    // The classifier names the same space the user already filed it into.
    await t.mutation(internal.items.setSpacesForItem, {
      itemId,
      spaceIds: [space],
    });

    await t.run(async (ctx) => {
      const joins = await ctx.db
        .query("spaceItems")
        .withIndex("by_item", (q) => q.eq("itemId", itemId))
        .collect();
      expect(joins).toHaveLength(1);
      expect(joins[0].status).toBe("saved");
    });
  });

  it("only suggests into dynamic spaces — quiet spaces never hear from the pipeline", async () => {
    const t = await entitledUser("quiet-user");
    // No `dynamic` → server default false (the onboarding-replay trap).
    const quietSpace = await t.mutation(api.spaces.createSpace, {
      name: "Quiet shelf",
    });
    const itemId = await t.mutation(api.items.createLinkItem, {
      url: "https://example.com",
    });

    await t.mutation(internal.items.setSpacesForItem, {
      itemId,
      spaceIds: [quietSpace],
    });

    await t.run(async (ctx) => {
      const joins = await ctx.db
        .query("spaceItems")
        .withIndex("by_item", (q) => q.eq("itemId", itemId))
        .collect();
      expect(joins).toHaveLength(0);
    });
  });

  it("createSpace persists the dynamic flag the classifier depends on", async () => {
    const t = await entitledUser("flag-user");
    const explicit = await t.mutation(api.spaces.createSpace, {
      name: "Explicit dynamic",
      dynamic: true,
    });
    const defaulted = await t.mutation(api.spaces.createSpace, {
      name: "Default quiet",
    });
    await t.run(async (ctx) => {
      const explicitDoc = await ctx.db.get(explicit);
      const defaultedDoc = await ctx.db.get(defaulted);
      expect(explicitDoc?.dynamic).toBe(true);
      expect(defaultedDoc?.dynamic).toBe(false);
    });
  });
});
