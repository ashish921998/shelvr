// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import { newConvexTest } from "./test.setup";

afterEach(() => {
  vi.unstubAllEnvs();
});

async function anonymousFixtureUser() {
  const backend = newConvexTest();
  const userId = await backend.run(async (ctx) => {
    const id = await ctx.db.insert("users", {});
    await ctx.db.insert("authAccounts", {
      userId: id,
      provider: "anonymous",
      providerAccountId: `anonymous:${id}`,
    });
    return id;
  });
  return {
    backend,
    userId,
    client: backend.withIdentity({ subject: `${userId}|session-1` }),
  };
}

describe("resetCurrentUser", () => {
  it("is unavailable unless anonymous development auth is enabled", async () => {
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "false");
    const { client } = await anonymousFixtureUser();

    await expect(
      client.mutation(api.devFixtures.resetCurrentUser, {}),
    ).rejects.toThrow(/fixtures are disabled/);
  });

  it("rejects a non-anonymous account", async () => {
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "true");
    const backend = newConvexTest();
    const userId = await backend.run(async (ctx) =>
      await ctx.db.insert("users", { email: "oauth@example.com" }),
    );
    const client = backend.withIdentity({ subject: `${userId}|session-1` });

    await expect(
      client.mutation(api.devFixtures.resetCurrentUser, {}),
    ).rejects.toThrow(/require an anonymous account/);
  });

  it("refuses oversized accounts without deleting anything", async () => {
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "true");
    const { backend, userId, client } = await anonymousFixtureUser();
    await backend.run(async (ctx) => {
      for (let index = 0; index < 201; index += 1) {
        await ctx.db.insert("items", {
          userId,
          type: "note",
          status: "ready",
          note: `Note ${index}`,
          tags: [],
          searchText: `note ${index}`,
        });
      }
    });

    await expect(
      client.mutation(api.devFixtures.resetCurrentUser, {}),
    ).rejects.toThrow(/items exceeds 200 rows/);
    await backend.run(async (ctx) => {
      expect(
        await ctx.db
          .query("items")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect(),
      ).toHaveLength(201);
    });
  });

  it("replaces only the caller's data and is idempotent", async () => {
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "true");
    const { backend, userId, client } = await anonymousFixtureUser();
    const otherUserId = await backend.run(async (ctx) =>
      await ctx.db.insert("users", { email: "other@example.com" }),
    );
    const storageId = await backend.run(async (ctx) =>
      await ctx.storage.store(new Blob(["old fixture"])),
    );
    const otherItemId = await backend.run(async (ctx) => {
      await ctx.db.insert("items", {
        userId,
        type: "image",
        status: "ready",
        title: "Old item",
        storageId,
        tags: [],
        searchText: "old item",
      });
      return await ctx.db.insert("items", {
        userId: otherUserId,
        type: "note",
        status: "ready",
        title: "Keep me",
        note: "Other user's data",
        tags: [],
        searchText: "keep me",
      });
    });

    await expect(
      client.mutation(api.devFixtures.resetCurrentUser, {}),
    ).resolves.toEqual({ items: 4, spaces: 3, memberships: 4 });
    await expect(
      client.mutation(api.devFixtures.resetCurrentUser, {}),
    ).resolves.toEqual({ items: 4, spaces: 3, memberships: 4 });

    await backend.run(async (ctx) => {
      const items = await ctx.db
        .query("items")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      expect(items.map((item) => item.title).sort()).toEqual([
        "Apartment Shopping Checklist",
        "Belém Tower",
        "The Value of Craft",
        "Weeknight Miso Ramen",
      ]);
      expect(
        await ctx.db
          .query("spaces")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect(),
      ).toHaveLength(3);
      expect(
        await ctx.db
          .query("spaceItems")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect(),
      ).toHaveLength(4);
      expect(
        await ctx.db
          .query("subscriptions")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .unique(),
      ).toMatchObject({ status: "lifetime", productId: "dev.flow-fixtures" });
      expect(await ctx.db.system.get("_storage", storageId)).toBeNull();
      expect(await ctx.db.get(otherItemId)).not.toBeNull();
    });
  });

  it("still resets when an item references an already-deleted storage object", async () => {
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "true");
    const { backend, userId, client } = await anonymousFixtureUser();
    await backend.run(async (ctx) => {
      const storageId = await ctx.storage.store(new Blob(["missing fixture"]));
      await ctx.db.insert("items", {
        userId,
        type: "image",
        status: "ready",
        storageId,
        tags: [],
        searchText: "missing fixture",
      });
      await ctx.storage.delete(storageId);
    });

    await expect(
      client.mutation(api.devFixtures.resetCurrentUser, {}),
    ).resolves.toEqual({ items: 4, spaces: 3, memberships: 4 });
  });
});
