// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { placeKey } from "./model/plan";
import { newConvexTest, type TestBackend } from "./test.setup";

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
      const oldItemId = await ctx.db.insert("items", {
        userId,
        type: "image",
        status: "ready",
        title: "Old item",
        storageId,
        tags: [],
        searchText: "old item",
      });
      await ctx.db.insert("placeVisits", {
        userId,
        key: "joscoffee",
        name: "Jo's Coffee",
        itemId: oldItemId,
        visitedAt: 1,
        spots: [{ lat: 30.2502, lng: -97.7496 }],
      });
      const keepId = await ctx.db.insert("items", {
        userId: otherUserId,
        type: "note",
        status: "ready",
        title: "Keep me",
        note: "Other user's data",
        tags: [],
        searchText: "keep me",
      });
      await ctx.db.insert("placeVisits", {
        userId: otherUserId,
        key: "joscoffee",
        name: "Jo's Coffee",
        itemId: keepId,
        visitedAt: 1,
      });
      return keepId;
    });

    await expect(
      client.mutation(api.devFixtures.resetCurrentUser, {}),
    ).resolves.toEqual({ items: 7, spaces: 3, memberships: 4 });
    await expect(
      client.mutation(api.devFixtures.resetCurrentUser, {}),
    ).resolves.toEqual({ items: 7, spaces: 3, memberships: 4 });

    await backend.run(async (ctx) => {
      const items = await ctx.db
        .query("items")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      expect(items.map((item) => item.title).sort()).toEqual([
        "Apartment Shopping Checklist",
        "Austin coffee stops",
        "Austin favorites",
        "Belém Tower",
        "Houston eats",
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
      expect(
        await ctx.db
          .query("placeVisits")
          .withIndex("by_user_and_key", (q) => q.eq("userId", userId))
          .collect(),
      ).toEqual([]);
      expect(
        await ctx.db
          .query("placeVisits")
          .withIndex("by_user_and_key", (q) => q.eq("userId", otherUserId))
          .collect(),
      ).toMatchObject([{ key: "joscoffee", itemId: otherItemId }]);
    });
  });

  it("puts Austin back to its seeded, unvisited state after a place was marked", async () => {
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "true");
    const { client } = await anonymousFixtureUser();
    await client.mutation(api.devFixtures.resetCurrentUser, {});
    const austin = async () =>
      (await client.query(api.items.listCities, {})).find(
        (entry) => entry.city === "Austin",
      );
    const [favorite] = await client.query(api.items.listCityItems, {
      city: "Austin",
    });
    await client.mutation(api.placeVisits.setVisited, {
      itemId: favorite!._id,
      name: "Jo's Coffee",
      visited: true,
      spot: { lat: 30.2502, lng: -97.7496 },
    });
    expect(await austin()).toMatchObject({ placeCount: 2, visitedCount: 1 });

    await client.mutation(api.devFixtures.resetCurrentUser, {});

    expect(await austin()).toEqual({
      city: "Austin",
      count: 2,
      placeCount: 2,
      cover: null,
    });
    expect(await client.query(api.placeVisits.listVisits, {})).toEqual([]);
  });

  it("refuses an account with too many marked places without deleting anything", async () => {
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "true");
    const { backend, userId, client } = await anonymousFixtureUser();
    await backend.run(async (ctx) => {
      const itemId = await ctx.db.insert("items", {
        userId,
        type: "note",
        status: "ready",
        note: "Places",
        tags: [],
        searchText: "places",
      });
      for (let index = 0; index < 201; index += 1) {
        await ctx.db.insert("placeVisits", {
          userId,
          key: `place${index}`,
          name: `Place ${index}`,
          itemId,
          visitedAt: index,
        });
      }
    });

    await expect(
      client.mutation(api.devFixtures.resetCurrentUser, {}),
    ).rejects.toThrow(/visits exceeds 200 rows/);
    await backend.run(async (ctx) => {
      expect(
        await ctx.db
          .query("placeVisits")
          .withIndex("by_user_and_key", (q) => q.eq("userId", userId))
          .collect(),
      ).toHaveLength(201);
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
    ).resolves.toEqual({ items: 7, spaces: 3, memberships: 4 });
  });

  it("clears the caller's place visits and map pages, a blocked page too", async () => {
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "true");
    const { backend, userId, client } = await anonymousFixtureUser();
    const otherUserId = await backend.run(
      async (ctx) =>
        await ctx.db.insert("users", { email: "other@example.com" }),
    );
    await backend.run(async (ctx) => {
      for (const owner of [userId, otherUserId]) {
        const itemId = await ctx.db.insert("items", {
          userId: owner,
          type: "link",
          status: "ready",
          tags: [],
          searchText: "contramar",
        });
        await ctx.db.insert("placeVisits", {
          userId: owner,
          key: placeKey("Contramar"),
          name: "Contramar",
          itemId,
          visitedAt: 1,
        });
      }
      await ctx.db.insert("publicMaps", {
        userId,
        token: "a".repeat(32),
        cities: ["Austin"],
      });
      await ctx.db.insert("publicMaps", {
        userId,
        token: "b".repeat(32),
        cities: ["Lisbon"],
        blockedAt: 1,
      });
      await ctx.db.insert("publicMaps", {
        userId: otherUserId,
        token: "c".repeat(32),
        cities: ["Austin"],
      });
    });

    await client.mutation(api.devFixtures.resetCurrentUser, {});

    await backend.run(async (ctx) => {
      const visitsOf = (id: Id<"users">) =>
        ctx.db
          .query("placeVisits")
          .withIndex("by_user_and_key", (q) => q.eq("userId", id))
          .collect();
      const pagesOf = (id: Id<"users">) =>
        ctx.db
          .query("publicMaps")
          .withIndex("by_user", (q) => q.eq("userId", id))
          .collect();
      expect(await visitsOf(userId)).toEqual([]);
      expect(await pagesOf(userId)).toEqual([]);
      expect(await visitsOf(otherUserId)).toHaveLength(1);
      expect(await pagesOf(otherUserId)).toHaveLength(1);
    });
  });

  it("refuses an account with too many place visits without deleting anything", async () => {
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "true");
    const { backend, userId, client } = await anonymousFixtureUser();
    await backend.run(async (ctx) => {
      const itemId = await ctx.db.insert("items", {
        userId,
        type: "link",
        status: "ready",
        tags: [],
        searchText: "places",
      });
      for (let index = 0; index < 201; index += 1) {
        await ctx.db.insert("placeVisits", {
          userId,
          key: `place ${index}`,
          name: `Place ${index}`,
          itemId,
          visitedAt: index,
        });
      }
    });

    await expect(
      client.mutation(api.devFixtures.resetCurrentUser, {}),
    ).rejects.toThrow(/visits exceeds 200 rows/);
    await backend.run(async (ctx) => {
      expect(
        await ctx.db
          .query("placeVisits")
          .withIndex("by_user_and_key", (q) => q.eq("userId", userId))
          .collect(),
      ).toHaveLength(201);
      expect(
        await ctx.db
          .query("items")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect(),
      ).toHaveLength(1);
    });
  });
});

describe("seedMapPageFixtures", () => {
  async function mapPageAccount() {
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "true");
    const fixture = await anonymousFixtureUser();
    await fixture.client.mutation(api.devFixtures.resetCurrentUser, {});
    return fixture;
  }

  function seedMapPage(backend: TestBackend, userId: Id<"users">) {
    return backend.mutation(internal.devFixtures.seedMapPageFixtures, {
      userId,
    });
  }

  async function accountRows(backend: TestBackend, userId: Id<"users">) {
    return await backend.run(async (ctx) => ({
      items: await ctx.db
        .query("items")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      visits: await ctx.db
        .query("placeVisits")
        .withIndex("by_user_and_key", (q) => q.eq("userId", userId))
        .collect(),
    }));
  }

  it("adds the Mexico City saves and one visit, and a second run leaves one set", async () => {
    const { backend, userId } = await mapPageAccount();
    await expect(seedMapPage(backend, userId)).resolves.toBe(5);
    await expect(seedMapPage(backend, userId)).resolves.toBe(5);

    const { items, visits } = await accountRows(backend, userId);
    const saves = items.filter((item) => item.fixtureKey?.startsWith("cdmx-"));
    expect(items).toHaveLength(12);
    expect(saves.map((save) => [save.fixtureKey, save.type])).toEqual([
      ["cdmx-contramar", "link"],
      ["cdmx-tacos", "link"],
      ["cdmx-bakery", "link"],
      ["cdmx-short-link", "link"],
      ["cdmx-note", "note"],
    ]);
    for (const save of saves) {
      expect(save).toMatchObject({ status: "ready", cities: ["Mexico City"] });
      expect(save.places).toEqual(save.placePins?.map((pin) => pin.name));
      expect(save.placePins?.map((pin) => pin.city)).toEqual(
        save.places?.map(() => "Mexico City"),
      );
      expect(save.searchText).toBe(
        [save.title, "Mexico City", ...save.places!].join(" ").toLowerCase(),
      );
    }
    expect(visits).toEqual([
      expect.objectContaining({
        key: placeKey("Contramar"),
        name: "Contramar",
        itemId: saves[0]._id,
      }),
    ]);
  });

  it("gives the map page the places the QA plan expects", async () => {
    const { backend, userId, client } = await mapPageAccount();
    await seedMapPage(backend, userId);

    await expect(
      client.query(api.publicMaps.listPublicMapCities, {}),
    ).resolves.toEqual([
      {
        city: "Mexico City",
        places: [
          { name: "Contramar", went: true },
          { name: "Café Avellaneda", went: false },
          { name: "Panadería Rosetta", went: false },
          { name: "Taquería Orinoco", went: false },
        ],
      },
      {
        city: "Austin",
        places: [
          { name: "Jo's Coffee", went: false },
          { name: "Houndstooth Coffee", went: false },
        ],
      },
      {
        city: "Houston",
        places: [
          { name: "Lucy's", went: false },
          { name: "Marlowe's", went: false },
        ],
      },
    ]);

    const { token } = await client.mutation(api.publicMaps.setPublicMapCities, {
      cities: ["Mexico City", "Austin", "Lisbon"],
    });
    await expect(
      backend.query(internal.publicMaps.getPublicMap, { token }),
    ).resolves.toEqual({
      cities: [
        {
          city: "Mexico City",
          places: [
            {
              name: "Contramar",
              lat: 19.419,
              lng: -99.166,
              emoji: "🍽️",
              went: true,
              post: {
                site: "instagram",
                url: "https://www.instagram.com/reel/DFixtureMx1/",
              },
            },
            {
              name: "Café Avellaneda",
              lat: 19.348,
              lng: -99.162,
              emoji: "☕",
              went: false,
            },
            {
              name: "Panadería Rosetta",
              lat: 19.42,
              lng: -99.161,
              emoji: "🥐",
              went: false,
              post: { site: "youtube", url: "https://youtu.be/fixtureMx01" },
            },
            {
              name: "Taquería Orinoco",
              lat: 19.418,
              lng: -99.164,
              emoji: "🌮",
              went: false,
              post: {
                site: "tiktok",
                url: "https://www.tiktok.com/@shelvr.fixtures/video/7300000000000000001",
              },
            },
          ],
        },
        {
          city: "Austin",
          places: [
            {
              name: "Jo's Coffee",
              lat: 30.25,
              lng: -97.75,
              emoji: "☕",
              went: false,
            },
            {
              name: "Houndstooth Coffee",
              lat: 30.268,
              lng: -97.743,
              emoji: "☕",
              went: false,
            },
          ],
        },
      ],
    });
  });

  it("refuses an account over the reset limit without adding anything", async () => {
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "true");
    const { backend, userId } = await anonymousFixtureUser();
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

    await expect(seedMapPage(backend, userId)).rejects.toThrow(
      /items exceeds 200 rows/,
    );
    const { items, visits } = await accountRows(backend, userId);
    expect(items).toHaveLength(201);
    expect(visits).toEqual([]);
  });

  it("refuses a non-anonymous account", async () => {
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "true");
    const backend = newConvexTest();
    const userId = await backend.run(
      async (ctx) =>
        await ctx.db.insert("users", { email: "oauth@example.com" }),
    );

    await expect(seedMapPage(backend, userId)).rejects.toThrow(
      /require an anonymous account/,
    );
    expect((await accountRows(backend, userId)).items).toEqual([]);
  });

  it("refuses a deleting account", async () => {
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "true");
    const { backend, userId } = await anonymousFixtureUser();
    await backend.run((ctx) => ctx.db.patch(userId, { deleting: true }));

    await expect(seedMapPage(backend, userId)).rejects.toThrow(
      /require a live account/,
    );
    expect((await accountRows(backend, userId)).items).toEqual([]);
  });

  it.each([
    ["unset", undefined],
    ["false", "false"],
  ])("is unavailable when anonymous sign-in is %s", async (_label, value) => {
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", value);
    const { backend, userId } = await anonymousFixtureUser();

    await expect(seedMapPage(backend, userId)).rejects.toThrow(
      /fixtures are disabled/,
    );
    expect((await accountRows(backend, userId)).items).toEqual([]);
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
    expect(counts).toEqual({ anonymous: 7, deleting: 0, oauth: 0 });
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
    expect(counts).toEqual([7, 7]);
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
