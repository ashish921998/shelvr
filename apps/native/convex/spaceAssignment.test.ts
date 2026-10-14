// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { newConvexTest, signedInUser } from "./test.setup";
import { describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { TestConvexForDataModel } from "convex-test";
import type { DataModel, Id } from "./_generated/dataModel";

type TestCtx = TestConvexForDataModel<DataModel>;

// Mirrors spaces.test.ts's helper: an authenticated, Pro-entitled test user.
async function entitledUser(): Promise<TestCtx> {
  return (await signedInUser(newConvexTest(), { pro: true })).t;
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
    const t = await entitledUser();
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
      // The explicit assignment is untouched, never downgraded to suggested.
      expect(bySpace.get(dynamicSpace)).toBe("saved");
      // The AI's pick landed as a suggestion only.
      expect(bySpace.get(otherSpace)).toBe("suggested");
    });
  });

  it("never duplicates a membership when classification re-proposes the saved space", async () => {
    const t = await entitledUser();
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
    const t = await entitledUser();
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
    const t = await entitledUser();
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

/**
 * Auto-file: the one opt-in under which the pipeline writes `saved`. The
 * space owner's standing choice stands in for the per-item accept, so the
 * user-owned invariants still hold: only dynamic spaces, never over a
 * dismissal, and never for a lapsed account turning it on.
 */
describe("auto-file spaces", () => {
  async function joinStatuses(t: TestCtx, itemId: Id<"items">) {
    const joins = await t.run(
      async (ctx) =>
        await ctx.db
          .query("spaceItems")
          .withIndex("by_item", (q) => q.eq("itemId", itemId))
          .collect(),
    );
    return new Map(joins.map((j) => [j.spaceId, j.status]));
  }

  it("files a match straight into an auto-file space and still suggests elsewhere", async () => {
    const t = await entitledUser();
    const autoSpace = await t.mutation(api.spaces.createSpace, {
      name: "Recipes",
      dynamic: true,
      autoFile: true,
    });
    const plainSpace = await t.mutation(api.spaces.createSpace, {
      name: "Travel",
      dynamic: true,
    });
    const itemId = await t.mutation(api.items.createLinkItem, {
      url: "https://example.com/recipe",
    });

    await t.mutation(internal.items.setSpacesForItem, {
      itemId,
      spaceIds: [autoSpace, plainSpace],
    });

    const statuses = await joinStatuses(t, itemId);
    expect(statuses.get(autoSpace)).toBe("saved");
    expect(statuses.get(plainSpace)).toBe("suggested");
    const space = await t.query(api.spaces.getSpace, { id: autoSpace });
    expect(space?.autoFile).toBe(true);
  });

  it("does nothing while dynamic is off, even with auto-file set", async () => {
    const t = await entitledUser();
    const space = await t.mutation(api.spaces.createSpace, {
      name: "Quiet",
      dynamic: false,
      autoFile: true,
    });
    const itemId = await t.mutation(api.items.createLinkItem, {
      url: "https://example.com",
    });

    await t.mutation(internal.items.setSpacesForItem, {
      itemId,
      spaceIds: [space],
    });

    expect((await joinStatuses(t, itemId)).size).toBe(0);
  });

  it("never re-files a save the user removed from the space", async () => {
    const t = await entitledUser();
    const space = await t.mutation(api.spaces.createSpace, {
      name: "Recipes",
      dynamic: true,
      autoFile: true,
    });
    const itemId = await t.mutation(api.items.createLinkItem, {
      url: "https://example.com/recipe",
    });
    await t.mutation(internal.items.setSpacesForItem, {
      itemId,
      spaceIds: [space],
    });
    await t.mutation(api.spaces.removeItemFromSpace, {
      itemId,
      spaceId: space,
    });

    // A retry or refresh classifies it into the same space again.
    await t.mutation(internal.items.setSpacesForItem, {
      itemId,
      spaceIds: [space],
    });

    expect((await joinStatuses(t, itemId)).get(space)).toBe("dismissed");
  });

  it("leaves saves made before auto-file was turned on as suggestions", async () => {
    // Pin the clock so the older save is strictly older than the switch.
    vi.useFakeTimers({ now: 1_000_000 });
    const t = await entitledUser();
    const space = await t.mutation(api.spaces.createSpace, {
      name: "Recipes",
      dynamic: true,
    });
    const olderItem = await t.mutation(api.items.createLinkItem, {
      url: "https://example.com/old-recipe",
    });
    vi.setSystemTime(2_000_000);
    await t.mutation(api.spaces.updateSpace, { id: space, autoFile: true });
    vi.setSystemTime(3_000_000);
    const newerItem = await t.mutation(api.items.createLinkItem, {
      url: "https://example.com/new-recipe",
    });

    // A retry of the older save classifies it after the switch.
    for (const itemId of [olderItem, newerItem]) {
      await t.mutation(internal.items.setSpacesForItem, {
        itemId,
        spaceIds: [space],
      });
    }

    expect((await joinStatuses(t, olderItem)).get(space)).toBe("suggested");
    expect((await joinStatuses(t, newerItem)).get(space)).toBe("saved");
    vi.useRealTimers();
  });

  it("clears auto-file when dynamic goes off, so an older build cannot revive it", async () => {
    const t = await entitledUser();
    const space = await t.mutation(api.spaces.createSpace, {
      name: "Recipes",
      dynamic: true,
      autoFile: true,
    });

    // An older build only knows `dynamic`.
    await t.mutation(api.spaces.updateSpace, { id: space, dynamic: false });
    await t.mutation(api.spaces.updateSpace, { id: space, dynamic: true });

    const doc = await t.run(async (ctx) => await ctx.db.get(space));
    expect(doc?.dynamic).toBe(true);
    expect(doc?.autoFile).toBe(false);
    expect(doc?.autoFileSince).toBeUndefined();
  });

  it("lets a lapsed user turn auto-file off but not on", async () => {
    const { t, userId } = await signedInUser(newConvexTest(), { pro: true });
    const space = await t.mutation(api.spaces.createSpace, {
      name: "Recipes",
      dynamic: true,
      autoFile: true,
    });
    await t.run(async (ctx) => {
      const subscription = await ctx.db
        .query("subscriptions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique();
      if (subscription === null) throw new Error("Subscription not found");
      await ctx.db.patch(subscription._id, {
        status: "lapsed",
        expiresAt: Date.now() - 1,
      });
    });

    await t.mutation(api.spaces.updateSpace, { id: space, autoFile: false });
    await expect(
      t.mutation(api.spaces.updateSpace, { id: space, autoFile: true }),
    ).rejects.toThrow("Pro required");
    const doc = await t.run(async (ctx) => await ctx.db.get(space));
    expect(doc?.autoFile).toBe(false);
  });
});
