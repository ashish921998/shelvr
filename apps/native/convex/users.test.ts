// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it, vi } from "vitest";

import type { TestConvexForDataModel } from "convex-test";
import { newConvexTest, seedNotes, signedInUser } from "./test.setup";

import { api } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { DELETE_BATCH } from "./users";

type TestCtx = TestConvexForDataModel<DataModel>;
type Backend = ReturnType<typeof newConvexTest>;

/** A signed-in Pro user backed by a real users row. */
async function as(
  backend: Backend,
): Promise<{ t: TestCtx; userId: Id<"users"> }> {
  return await signedInUser(backend, { pro: true });
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
    const t = newConvexTest();
    await expect(
      t.mutation(api.users.deleteCurrentUserAccount, {}),
    ).rejects.toThrow(/Not authenticated/);
  });

  it("removes items, spaces, memberships, operations, storage, and subscription", async () => {
    const { t, userId } = await as(newConvexTest());
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
      expect(
        await ctx.db.system.get("_storage", seeded.storageId),
      ).not.toBeNull();
      expect(
        await ctx.db.system.get("_storage", seeded.pendingStorageId),
      ).not.toBeNull();
    });

    // The one-time cancel-survey ask row is user-owned state; it must drain
    // with the account too.
    await t.run(async (ctx) => {
      await ctx.db.insert("cancelSurveys", {
        userId,
        askedAt: 1700000000000,
        outcome: "submitted",
        reason: "too_expensive",
        respondedAt: 1700000000001,
      });
      // Feedback submissions hold the user's authored messages; they drain
      // with the account as well.
      await ctx.db.insert("feedbackSubmissions", {
        userId,
        message: "Loved the app, sad to go",
        surface: "profile",
        status: "delivered",
        attempts: 1,
      });
      // "We went" places say where the user has been.
      await ctx.db.insert("placeVisits", {
        userId,
        key: "tigre",
        name: "Tigre",
        itemId: seeded.noteId,
        visitedAt: 1700000000002,
      });
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
      expect(
        await ctx.db
          .query("feedbackSubmissions")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect(),
      ).toHaveLength(0);
      expect(
        await ctx.db
          .query("placeVisits")
          .withIndex("by_user_and_visited", (q) => q.eq("userId", userId))
          .collect(),
      ).toHaveLength(0);
      expect(await ctx.db.system.get("_storage", seeded.storageId)).toBeNull();
      expect(
        await ctx.db.system.get("_storage", seeded.pendingStorageId),
      ).toBeNull();
    });
  });

  it("drains accounts larger than one batch via scheduled continuations", async () => {
    // The continuation mutation validates `userId: v.id("users")`, so this
    // test needs a real users row (a synthetic string subject won't do).
    vi.useFakeTimers();
    try {
      const backend = newConvexTest();
      const { userId, t } = await signedInUser(backend, {
        email: "big@example.com",
        pro: true,
        session: true,
      });
      await seedNotes(backend, userId, DELETE_BATCH + 1);

      await t.mutation(api.users.deleteCurrentUserAccount, {});
      await backend.finishAllScheduledFunctions(vi.runAllTimers);

      await backend.run(async (ctx) => {
        expect(
          await ctx.db
            .query("items")
            .withIndex("by_user", (q) => q.eq("userId", userId as string))
            .collect(),
        ).toHaveLength(0);
        expect(
          await ctx.db
            .query("subscriptions")
            .withIndex("by_user", (q) => q.eq("userId", userId as string))
            .unique(),
        ).toBeNull();
        expect(await ctx.db.get(userId)).toBeNull();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not delete another user's data", async () => {
    const backend = newConvexTest();
    const { t: ta, userId: userA } = await as(backend);
    const { t: tb, userId: userB } = await as(backend);

    await seedOwnedData(ta, userA);
    const bSeeded = await seedOwnedData(tb, userB);

    await ta.mutation(api.users.deleteCurrentUserAccount, {});

    await tb.run(async (ctx) => {
      const items = await ctx.db
        .query("items")
        .withIndex("by_user", (q) => q.eq("userId", userB))
        .collect();
      expect(items).toHaveLength(2);
      const spaces = await ctx.db
        .query("spaces")
        .withIndex("by_user", (q) => q.eq("userId", userB))
        .collect();
      expect(spaces).toHaveLength(1);
      expect(
        await ctx.db.system.get("_storage", bSeeded.storageId),
      ).not.toBeNull();
      const sub = await ctx.db
        .query("subscriptions")
        .withIndex("by_user", (q) => q.eq("userId", userB))
        .unique();
      expect(sub).not.toBeNull();
    });

    // B's identity still works; A's is gone with the account.
    await expect(tb.query(api.spaces.listSpaces, {})).resolves.toHaveLength(1);
    await expect(ta.query(api.spaces.listSpaces, {})).rejects.toThrow(
      /Not authenticated/,
    );

    await ta.run(async (ctx) => {
      expect(
        await ctx.db
          .query("items")
          .withIndex("by_user", (q) => q.eq("userId", userA))
          .collect(),
      ).toHaveLength(0);
    });
  });

  it("removes auth sessions, accounts, and the users document", async () => {
    const backend = newConvexTest();

    const { userId, sessionId, t } = await signedInUser(backend, {
      email: "delete-me@example.com",
      pro: true,
      session: true,
    });
    const accountId = await backend.run(async (ctx) => {
      await ctx.db.insert("authRefreshTokens", {
        sessionId: sessionId!,
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
      return accountId;
    });

    await t.mutation(api.users.deleteCurrentUserAccount, {});

    await backend.run(async (ctx) => {
      expect(await ctx.db.get(userId)).toBeNull();
      expect(await ctx.db.get(sessionId!)).toBeNull();
      expect(await ctx.db.get(accountId)).toBeNull();
      const tokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", sessionId!))
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

  // Feedback rows hold authored messages, so a chatty account must be able
  // to exceed one deletion batch and still drain completely (via the same
  // scheduled continuations as every other table) before the auth identity
  // is removed.
  it("drains more than one batch of feedback rows via scheduled continuations", async () => {
    vi.useFakeTimers();
    try {
      const backend = newConvexTest();
      const { userId, t } = await signedInUser(backend, {
        email: "chatty@example.com",
        pro: true,
        session: true,
      });
      await backend.run(async (ctx) => {
        for (let i = 0; i < DELETE_BATCH + 1; i++) {
          await ctx.db.insert("feedbackSubmissions", {
            userId: userId as string,
            message: `feedback ${i}`,
            surface: "home",
            status: "delivered",
            attempts: 1,
          });
        }
      });

      await t.mutation(api.users.deleteCurrentUserAccount, {});
      await backend.finishAllScheduledFunctions(vi.runAllTimers);

      await backend.run(async (ctx) => {
        expect(
          await ctx.db
            .query("feedbackSubmissions")
            .withIndex("by_user", (q) => q.eq("userId", userId as string))
            .collect(),
        ).toHaveLength(0);
        // The auth identity is only removed by the final batch, so its
        // absence proves the continuations ran to completion.
        expect(await ctx.db.get(userId)).toBeNull();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  // Regression: the onboarding demo table must drain with the account: no
  // orphan allowance row (or dangling item reference) may survive deletion.
  it("removes the onboarding demo allowance with the account", async () => {
    const backend = newConvexTest();
    const { userId, t } = await signedInUser(backend, {
      email: "demo-delete@example.com",
      pro: true,
      session: true,
    });
    await backend.run(async (ctx) => {
      const itemId = await ctx.db.insert("items", {
        userId: userId as string,
        type: "link",
        status: "processing",
        url: "https://example.com",
        tags: [],
        searchText: "",
      });
      await ctx.db.insert("onboardingDemos", {
        userId: userId as string,
        itemId,
        createdAt: Date.now(),
      });
    });

    await t.mutation(api.users.deleteCurrentUserAccount, {});

    await backend.run(async (ctx) => {
      expect(
        await ctx.db
          .query("onboardingDemos")
          .withIndex("by_user", (q) => q.eq("userId", userId as string))
          .collect(),
      ).toHaveLength(0);
    });
  });
});

/** A real signed-in Pro user with `itemCount` notes. More than `DELETE_BATCH`
 * leaves the account mid-deletion after the first mutation, so the owner row
 * is still there to carry the marker. */
async function fencedUser(backend: Backend, itemCount: number) {
  const { userId, t } = await signedInUser(backend, {
    email: "fence@example.com",
    pro: true,
    session: true,
  });
  await seedNotes(backend, userId, itemCount);
  return { userId, t };
}

async function remainingItems(backend: TestCtx, userId: Id<"users">) {
  return await backend.run(
    async (ctx) =>
      (
        await ctx.db
          .query("items")
          .withIndex("by_user", (q) => q.eq("userId", userId as string))
          .collect()
      ).length,
  );
}

/** The same authenticated identity, driven through a query, a mutation, a
 * demo save and the capture-token action. Every one must refuse. */
async function expectRetainedIdentityRejected(t: TestCtx) {
  await expect(t.query(api.spaces.listSpaces, {})).rejects.toThrow(
    /Not authenticated/,
  );
  await expect(
    t.mutation(api.items.createNoteItem, { text: "after deletion" }),
  ).rejects.toThrow(/Not authenticated/);
  await expect(
    t.mutation(api.demo.createDemoItem, { url: "https://example.com/x" }),
  ).rejects.toThrow(/Not authenticated/);
  await expect(t.action(api.appIntents.issueCaptureToken, {})).rejects.toThrow(
    /Not authenticated/,
  );
}

describe("account deletion fence", () => {
  it("marks the owner deleting in the first transaction and keeps the marker between batches", async () => {
    vi.useFakeTimers();
    try {
      const backend = newConvexTest();
      const { userId, t } = await fencedUser(backend, DELETE_BATCH + 1);

      await t.mutation(api.users.deleteCurrentUserAccount, {});

      // Mid-deletion: rows remain, the owner row is still there, and it is
      // marked.
      expect(await remainingItems(backend, userId)).toBe(1);
      expect(await backend.run((ctx) => ctx.db.get(userId))).toMatchObject({
        deleting: true,
      });

      await backend.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await remainingItems(backend, userId)).toBe(0);
      expect(await backend.run((ctx) => ctx.db.get(userId))).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("resumes safely when deletion is requested again mid-cleanup and schedules the Apple revoke once", async () => {
    vi.useFakeTimers();
    try {
      const backend = newConvexTest();
      const { userId, t } = await fencedUser(backend, DELETE_BATCH + 1);
      await backend.run((ctx) =>
        ctx.db.insert("appleTokens", {
          userId,
          refreshToken: "r.token",
          updatedAt: Date.now(),
        }),
      );

      await t.mutation(api.users.deleteCurrentUserAccount, {});
      expect(await remainingItems(backend, userId)).toBe(1);
      // The retry during cleanup must not fail because the owner is already
      // deleting; it resumes the drain.
      await expect(
        t.mutation(api.users.deleteCurrentUserAccount, {}),
      ).resolves.toBeNull();
      expect(await remainingItems(backend, userId)).toBe(0);

      const revokes = await backend.run(async (ctx) =>
        (await ctx.db.system.query("_scheduled_functions").collect()).filter(
          (job) => job.name === "appleRevoke:revoke",
        ),
      );
      expect(revokes).toHaveLength(1);

      await backend.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await backend.run((ctx) => ctx.db.get(userId))).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("is a safe no-op once the account is gone", async () => {
    const backend = newConvexTest();
    const { userId, t } = await fencedUser(backend, 1);

    await t.mutation(api.users.deleteCurrentUserAccount, {});
    expect(await backend.run((ctx) => ctx.db.get(userId))).toBeNull();

    await expect(
      t.mutation(api.users.deleteCurrentUserAccount, {}),
    ).resolves.toBeNull();
    expect(await backend.run((ctx) => ctx.db.get(userId))).toBeNull();
  });

  it("rejects the retained identity in query, mutation and action while deleting and after removal", async () => {
    vi.useFakeTimers();
    try {
      const backend = newConvexTest();
      const { userId, t } = await fencedUser(backend, DELETE_BATCH + 1);

      // Live: the identity works everywhere.
      await expect(t.query(api.spaces.listSpaces, {})).resolves.toEqual([]);
      await expect(
        t.action(api.appIntents.issueCaptureToken, {}),
      ).resolves.toEqual(expect.any(String));

      await t.mutation(api.users.deleteCurrentUserAccount, {});
      expect(await backend.run((ctx) => ctx.db.get(userId))).toMatchObject({
        deleting: true,
      });
      await expectRetainedIdentityRejected(t);
      expect(await remainingItems(backend, userId)).toBe(1);

      await backend.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await backend.run((ctx) => ctx.db.get(userId))).toBeNull();
      await expectRetainedIdentityRejected(t);
      expect(
        await backend.run((ctx) => ctx.db.query("captureTokens").collect()),
      ).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("answers null from getCurrentUser for a deleting owner", async () => {
    vi.useFakeTimers();
    try {
      const backend = newConvexTest();
      const { userId, t } = await fencedUser(backend, DELETE_BATCH + 1);
      await expect(t.query(api.users.getCurrentUser, {})).resolves.toEqual({
        _id: userId,
        email: "fence@example.com",
      });

      await t.mutation(api.users.deleteCurrentUserAccount, {});
      await expect(t.query(api.users.getCurrentUser, {})).resolves.toBeNull();

      await backend.finishAllScheduledFunctions(vi.runAllTimers);
      await expect(t.query(api.users.getCurrentUser, {})).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("still rejects a signed-out deletion request", async () => {
    const backend = newConvexTest();
    await expect(
      backend.mutation(api.users.deleteCurrentUserAccount, {}),
    ).rejects.toThrow(/Not authenticated/);
  });
});
