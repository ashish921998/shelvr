// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
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
  it("reports reset eligibility only for anonymous development accounts", async () => {
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "true");
    const { client } = await anonymousFixtureUser();
    const backend = newConvexTest();
    const oauthId = await backend.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "oauth@example.com",
      });
      await ctx.db.insert("authAccounts", {
        userId,
        provider: "google",
        providerAccountId: "google-1",
      });
      return userId;
    });

    await expect(
      client.query(api.devFixtures.canResetCurrentUser, {}),
    ).resolves.toBe(true);
    await expect(
      backend
        .withIdentity({ subject: `${oauthId}|session-1` })
        .query(api.devFixtures.canResetCurrentUser, {}),
    ).resolves.toBe(false);

    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "false");
    await expect(
      client.query(api.devFixtures.canResetCurrentUser, {}),
    ).resolves.toBe(false);
  });

  it("reports no reset eligibility for a deleting or removed anonymous account", async () => {
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "true");
    const { backend, client, userId } = await anonymousFixtureUser();
    await expect(
      client.query(api.devFixtures.canResetCurrentUser, {}),
    ).resolves.toBe(true);

    await backend.run((ctx) => ctx.db.patch(userId, { deleting: true }));
    await expect(
      client.query(api.devFixtures.canResetCurrentUser, {}),
    ).resolves.toBe(false);
    await expect(
      client.mutation(api.devFixtures.resetCurrentUser, {}),
    ).rejects.toThrow(/Not authenticated/);

    await backend.run((ctx) => ctx.db.delete(userId));
    await expect(
      client.query(api.devFixtures.canResetCurrentUser, {}),
    ).resolves.toBe(false);
  });

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
    const userId = await backend.run(
      async (ctx) =>
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
    const otherUserId = await backend.run(
      async (ctx) =>
        await ctx.db.insert("users", { email: "other@example.com" }),
    );
    const storageId = await backend.run(
      async (ctx) => await ctx.storage.store(new Blob(["old fixture"])),
    );
    const otherItemId = await backend.run(async (ctx) => {
      const oldSpaceId = await ctx.db.insert("spaces", {
        userId,
        name: "Old trip",
        dynamic: false,
      });
      await ctx.db.insert("trips", {
        userId,
        spaceId: oldSpaceId,
        pace: "easy",
        days: [],
        wishlist: [],
      });
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
      expect(
        await ctx.db
          .query("trips")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect(),
      ).toEqual([]);
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

describe("locateTripStops", () => {
  async function tripFixture() {
    const fixture = await anonymousFixtureUser();
    const spaceId = await fixture.backend.run(async (ctx) => {
      const userId = fixture.userId;
      const spaceId = await ctx.db.insert("spaces", {
        userId,
        name: "Lisbon trip",
        dynamic: false,
      });
      const itemId = await ctx.db.insert("items", {
        userId,
        type: "link",
        status: "ready",
        title: "Lisbon in a day",
        tags: [],
        searchText: "Lisbon in a day",
      });
      const stop = (name: string) => ({
        itemId,
        name,
        why: "In the reel",
        slot: "morning" as const,
      });
      await ctx.db.insert("trips", {
        userId,
        spaceId,
        pace: "easy",
        days: [
          {
            areas: [],
            stops: [stop("Belém Tower"), stop("Time Out Market")],
            gaps: [],
          },
        ],
        wishlist: [stop("Miradouro da Graça")],
      });
      return spaceId;
    });
    return { ...fixture, spaceId };
  }

  it("pins the named stops and lays the trip out again", async () => {
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "true");
    const { backend, spaceId } = await tripFixture();

    const located = await backend.mutation(
      internal.devFixtures.locateTripStops,
      {
        spaceId,
        places: [
          { name: "belém tower", lat: 38.6916, lng: -9.216 },
          { name: "Time Out Market", lat: 38.7069, lng: -9.1458 },
        ],
      },
    );

    expect(located).toBe(2);
    const trip = await backend.run(async (ctx) =>
      ctx.db
        .query("trips")
        .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
        .first(),
    );
    const placed = [
      ...trip!.days.flatMap((day) => day.stops),
      ...trip!.wishlist,
    ]
      .filter((stop) => stop.lat !== undefined)
      .map((stop) => stop.name)
      .sort();
    expect(placed).toEqual(["Belém Tower", "Time Out Market"]);
  });

  it("is unavailable unless anonymous development auth is enabled", async () => {
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "false");
    const { backend, spaceId } = await tripFixture();

    await expect(
      backend.mutation(internal.devFixtures.locateTripStops, {
        spaceId,
        places: [],
      }),
    ).rejects.toThrow(/fixtures are disabled/);
  });
});

describe("resetAnonymousUsersForE2e", () => {
  function stubE2eBackend() {
    vi.stubEnv("E2E_FAKE_AI", "local-v1");
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "true");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "ci-no-model");
    vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210");
  }

  it("seeds every live anonymous account and leaves others alone", async () => {
    stubE2eBackend();
    const { backend, userId } = await anonymousFixtureUser();
    const { deletingId, oauthId } = await backend.run(async (ctx) => {
      const deletingId = await ctx.db.insert("users", { deleting: true });
      await ctx.db.insert("authAccounts", {
        userId: deletingId,
        provider: "anonymous",
        providerAccountId: `anonymous:${deletingId}`,
      });
      const oauthId = await ctx.db.insert("users", {
        email: "oauth@example.com",
      });
      await ctx.db.insert("authAccounts", {
        userId: oauthId,
        provider: "google",
        providerAccountId: "google-1",
      });
      return { deletingId, oauthId };
    });

    await expect(
      backend.mutation(internal.devFixtures.resetAnonymousUsersForE2e, {}),
    ).resolves.toBe(1);
    await backend.mutation(internal.devFixtures.resetAnonymousUsersForE2e, {});

    const counts = await backend.run(async (ctx) => {
      const itemsOf = async (id: typeof userId) =>
        (
          await ctx.db
            .query("items")
            .withIndex("by_user", (q) => q.eq("userId", id))
            .collect()
        ).length;
      return {
        anonymous: await itemsOf(userId),
        deleting: await itemsOf(deletingId),
        oauth: await itemsOf(oauthId),
      };
    });
    expect(counts).toEqual({ anonymous: 4, deleting: 0, oauth: 0 });
  });

  it("seeds each of several anonymous accounts", async () => {
    stubE2eBackend();
    const { backend, userId } = await anonymousFixtureUser();
    const secondId = await backend.run(async (ctx) => {
      const id = await ctx.db.insert("users", {});
      await ctx.db.insert("authAccounts", {
        userId: id,
        provider: "anonymous",
        providerAccountId: `anonymous:${id}`,
      });
      return id;
    });

    await expect(
      backend.mutation(internal.devFixtures.resetAnonymousUsersForE2e, {}),
    ).resolves.toBe(2);
    const counts = await backend.run(async (ctx) =>
      Promise.all(
        [userId, secondId].map(
          async (id) =>
            (
              await ctx.db
                .query("items")
                .withIndex("by_user", (q) => q.eq("userId", id))
                .collect()
            ).length,
        ),
      ),
    );
    expect(counts).toEqual([4, 4]);
  });

  it("refuses more than 25 anonymous accounts without seeding any", async () => {
    stubE2eBackend();
    const { backend, userId } = await anonymousFixtureUser();
    await backend.run(async (ctx) => {
      for (let i = 0; i < 25; i++) {
        const id = await ctx.db.insert("users", {});
        await ctx.db.insert("authAccounts", {
          userId: id,
          provider: "anonymous",
          providerAccountId: `anonymous:${id}`,
        });
      }
    });

    await expect(
      backend.mutation(internal.devFixtures.resetAnonymousUsersForE2e, {}),
    ).rejects.toThrow(/more than 25 anonymous accounts/);
    const items = await backend.run(async (ctx) =>
      ctx.db
        .query("items")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    );
    expect(items).toHaveLength(0);
  });

  it.each([
    ["E2E_FAKE_AI", "", /switch_off/],
    [
      "CONVEX_CLOUD_URL",
      "https://amiable-setter-120.convex.cloud",
      /not_local/,
    ],
    ["AUTH_ENABLE_ANONYMOUS", "false", /dev_sign_in_off/],
    ["GOOGLE_GENERATIVE_AI_API_KEY", "real-key", /real_key/],
  ])("refuses unless every e2e lock holds (%s)", async (name, value, error) => {
    stubE2eBackend();
    vi.stubEnv(name, value);
    const { backend, userId } = await anonymousFixtureUser();

    await expect(
      backend.mutation(internal.devFixtures.resetAnonymousUsersForE2e, {}),
    ).rejects.toThrow(error);
    const items = await backend.run(async (ctx) =>
      ctx.db
        .query("items")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    );
    expect(items).toHaveLength(0);
  });
});
