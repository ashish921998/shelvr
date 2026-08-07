// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

import { convexTest, type TestConvexForDataModel } from "convex-test";

import { api } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import schema from "./schema";

type TestCtx = TestConvexForDataModel<DataModel>;

const modules = import.meta.glob("./**/*.ts");

async function as(userId: string): Promise<TestCtx> {
  const t = convexTest(schema, modules).withIdentity({
    subject: `${userId}|session-1`,
  });
  await seedPro(t, userId);
  return t;
}

async function seedPro(t: TestCtx, userId: string): Promise<void> {
  await t.run(async (ctx) => {
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const fields = {
      status: "pro" as const,
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
      updatedAt: Date.now(),
    };
    if (existing !== null) {
      await ctx.db.patch(existing._id, fields);
    } else {
      await ctx.db.insert("subscriptions", { userId, ...fields });
    }
  });
}

async function storeBlob(t: TestCtx): Promise<Id<"_storage">> {
  return await t.run(async (ctx) => {
    return await ctx.storage.store(
      new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])]),
    );
  });
}

/** Seeds note + image, space + membership, pending op with storage. */
async function seedOwnedData(t: TestCtx, userId: string) {
  const storageId = await storeBlob(t);
  const pendingStorageId = await storeBlob(t);

  return await t.run(async (ctx) => {
    const noteId = await ctx.db.insert("items", {
      userId,
      type: "note",
      status: "ready",
      tags: [],
      searchText: "grocery list",
      note: "milk",
      title: "Grocery",
    });
    const imageId = await ctx.db.insert("items", {
      userId,
      type: "image",
      status: "ready",
      tags: ["photo"],
      searchText: "photo",
      storageId,
      title: "Shot",
    });
    const spaceId = await ctx.db.insert("spaces", {
      userId,
      name: "Kitchen",
      dynamic: false,
    });
    const membershipId = await ctx.db.insert("spaceItems", {
      userId,
      spaceId,
      itemId: noteId,
      status: "saved",
    });
    const opId = await ctx.db.insert("itemOperations", {
      userId,
      operationId: "image:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      kind: "image",
      status: "pending",
      storageId: pendingStorageId,
      updatedAt: Date.now(),
    });
    return {
      noteId,
      imageId,
      spaceId,
      membershipId,
      opId,
      storageId,
      pendingStorageId,
    };
  });
}

describe("deleteCurrentUserAccount", () => {
  it("rejects unauthenticated callers", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.users.deleteCurrentUserAccount, {}),
    ).rejects.toThrow(/Not authenticated/);
  });

  it("removes items, spaces, memberships, operations, storage, and subscription", async () => {
    const userId = "user-delete-a";
    const t = await as(userId);
    const seeded = await seedOwnedData(t, userId);

    await t.run(async (ctx) => {
      expect(
        (
          await ctx.db
            .query("items")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .collect()
        ).length,
      ).toBe(2);
      expect(await ctx.db.system.get("_storage", seeded.storageId)).not.toBeNull();
      expect(
        await ctx.db.system.get("_storage", seeded.pendingStorageId),
      ).not.toBeNull();
    });

    await t.mutation(api.users.deleteCurrentUserAccount, {});

    await t.run(async (ctx) => {
      expect(
        await ctx.db
          .query("items")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect(),
      ).toHaveLength(0);
      expect(
        await ctx.db
          .query("spaces")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect(),
      ).toHaveLength(0);
      expect(
        await ctx.db
          .query("spaceItems")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect(),
      ).toHaveLength(0);
      expect(
        await ctx.db
          .query("itemOperations")
          .withIndex("by_user_operation", (q) => q.eq("userId", userId))
          .collect(),
      ).toHaveLength(0);
      expect(
        await ctx.db
          .query("subscriptions")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .unique(),
      ).toBeNull();
      expect(await ctx.db.system.get("_storage", seeded.storageId)).toBeNull();
      expect(
        await ctx.db.system.get("_storage", seeded.pendingStorageId),
      ).toBeNull();
    });
  });

  it("does not delete another user's data", async () => {
    const backend = convexTest(schema, modules);
    const ta = backend.withIdentity({ subject: "user-a|session-1" });
    const tb = backend.withIdentity({ subject: "user-b|session-1" });
    await seedPro(ta, "user-a");
    await seedPro(tb, "user-b");

    await seedOwnedData(ta, "user-a");
    const bSeeded = await seedOwnedData(tb, "user-b");

    await ta.mutation(api.users.deleteCurrentUserAccount, {});

    await tb.run(async (ctx) => {
      const items = await ctx.db
        .query("items")
        .withIndex("by_user", (q) => q.eq("userId", "user-b"))
        .collect();
      expect(items).toHaveLength(2);
      const spaces = await ctx.db
        .query("spaces")
        .withIndex("by_user", (q) => q.eq("userId", "user-b"))
        .collect();
      expect(spaces).toHaveLength(1);
      expect(await ctx.db.system.get("_storage", bSeeded.storageId)).not.toBeNull();
      const sub = await ctx.db
        .query("subscriptions")
        .withIndex("by_user", (q) => q.eq("userId", "user-b"))
        .unique();
      expect(sub).not.toBeNull();
    });

    await ta.run(async (ctx) => {
      expect(
        await ctx.db
          .query("items")
          .withIndex("by_user", (q) => q.eq("userId", "user-a"))
          .collect(),
      ).toHaveLength(0);
    });
  });

  it("removes auth sessions, accounts, and the users document", async () => {
    const backend = convexTest(schema, modules);

    const { userId, sessionId, accountId } = await backend.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "delete-me@example.com",
      });
      const sessionId = await ctx.db.insert("authSessions", {
        userId,
        expirationTime: Date.now() + 60_000,
      });
      await ctx.db.insert("authRefreshTokens", {
        sessionId,
        expirationTime: Date.now() + 60_000,
      });
      const accountId = await ctx.db.insert("authAccounts", {
        userId,
        provider: "apple",
        providerAccountId: "apple-sub-1",
      });
      await ctx.db.insert("items", {
        userId: userId as string,
        type: "note",
        status: "ready",
        tags: [],
        searchText: "x",
        note: "x",
      });
      await ctx.db.insert("subscriptions", {
        userId: userId as string,
        status: "pro",
        expiresAt: Date.now() + 60_000,
        updatedAt: Date.now(),
      });
      return { userId, sessionId, accountId };
    });

    const t = backend.withIdentity({ subject: `${userId}|${sessionId}` });
    await t.mutation(api.users.deleteCurrentUserAccount, {});

    await backend.run(async (ctx) => {
      expect(await ctx.db.get(userId)).toBeNull();
      expect(await ctx.db.get(sessionId)).toBeNull();
      expect(await ctx.db.get(accountId)).toBeNull();
      const tokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", sessionId))
        .collect();
      expect(tokens).toHaveLength(0);
      expect(
        await ctx.db
          .query("items")
          .withIndex("by_user", (q) => q.eq("userId", userId as string))
          .collect(),
      ).toHaveLength(0);
    });
  });
});
