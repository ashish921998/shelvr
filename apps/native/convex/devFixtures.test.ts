// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
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
    await backend.run(async (ctx) => {
      await ctx.db.insert("cityStamps", {
        userId,
        city: "paris",
        country: "FR",
        stampedAt: 1,
      });
      await ctx.db.insert("cityStamps", {
        userId: otherUserId,
        city: "tokyo",
        country: "JP",
        stampedAt: 1,
      });
    });

    await expect(
      client.mutation(api.devFixtures.resetCurrentUser, {}),
    ).resolves.toEqual({ items: 7, spaces: 3, memberships: 4 });
    await expect(
      client.mutation(api.devFixtures.resetCurrentUser, {}),
    ).resolves.toEqual({ items: 7, spaces: 3, memberships: 4 });
    await expect(
      client.query(api.cityStamps.listCityStamps, {}),
    ).resolves.toEqual([
      expect.objectContaining({ city: "austin", country: "US" }),
      expect.objectContaining({ city: "lisbon", country: "PT" }),
      expect.objectContaining({ city: "madrid", country: "ES" }),
    ]);

    await backend.run(async (ctx) => {
      const stampsOf = async (id: typeof userId) =>
        (
          await ctx.db
            .query("cityStamps")
            .withIndex("by_user_and_city", (q) => q.eq("userId", id))
            .collect()
        ).map((row) => row.city);
      expect(await stampsOf(userId)).toEqual(["austin", "lisbon", "madrid"]);
      expect(await stampsOf(otherUserId)).toEqual(["tokyo"]);
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
});

describe("the vote link fixture", () => {
  async function linkRows(backend: TestBackend, userId: Id<"users">) {
    return await backend.run(async (ctx) => {
      const shares = await ctx.db
        .query("planShares")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      const votes = await ctx.db.query("planVotes").collect();
      return { shares, votes };
    });
  }

  it("seeds an Austin link with Sam's vote newest", async () => {
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "true");
    const { client } = await anonymousFixtureUser();
    await client.mutation(api.devFixtures.resetCurrentUser, {});

    const votes = await client.query(api.planShares.cityPlanVotes, {
      city: "Austin",
    });
    expect(votes).toMatchObject({
      voters: 2,
      latest: { name: "Sam", place: "Jo's Coffee", choice: "pick" },
      places: [
        { key: "p0", name: "Jo's Coffee", picks: 1, passes: 0 },
        { key: "p1", name: "Houndstooth Coffee", picks: 1, passes: 1 },
      ],
    });
    expect(votes!.expiresAt - Date.now()).toBeGreaterThan(
      4 * 24 * 60 * 60 * 1000,
    );
  });

  it("leaves one link for the account after a second reset", async () => {
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "true");
    const { backend, userId, client } = await anonymousFixtureUser();
    await client.mutation(api.devFixtures.resetCurrentUser, {});
    await client.mutation(api.devFixtures.resetCurrentUser, {});

    const { shares, votes } = await linkRows(backend, userId);
    expect(shares).toHaveLength(1);
    expect(votes.map((vote) => vote.shareId)).toEqual([
      shares[0]._id,
      shares[0]._id,
    ]);
  });

  it("has already pushed, so a vote on it pushes nothing", async () => {
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "true");
    vi.stubEnv("PLAN_VOTE_PUSH_ENABLED", "true");
    const { backend, userId, client } = await anonymousFixtureUser();
    await client.mutation(api.devFixtures.resetCurrentUser, {});
    const [share] = (await linkRows(backend, userId)).shares;

    await backend.mutation(internal.planShares.recordPlanVote, {
      token: share.token,
      voterId: "qa-voter",
      picks: ["p1"],
      passes: [],
      ip: "203.0.113.7",
    });

    const notices = await backend.run((ctx) =>
      ctx.db.query("planVoteNotices").collect(),
    );
    expect(notices).toEqual([
      expect.objectContaining({
        shareId: share._id,
        voterId: "fixture-guest",
        deliveryStatus: "complete",
      }),
    ]);
  });

  it("refuses an account with 50 links without deleting anything", async () => {
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "true");
    const { backend, userId, client } = await anonymousFixtureUser();
    await backend.run(async (ctx) => {
      const spaceId = await ctx.db.insert("spaces", { userId, name: "Goa" });
      const itemId = await ctx.db.insert("items", {
        userId,
        type: "note",
        status: "ready",
        note: "Thalassa",
        tags: [],
        searchText: "thalassa",
      });
      for (let index = 0; index < 50; index += 1) {
        await ctx.db.insert("planShares", {
          token: `link-${index}`,
          userId,
          spaceId,
          places: [{ key: "p0", name: "Thalassa", why: "", itemId }],
          expiresAt: Date.now(),
        });
      }
    });

    await expect(
      client.mutation(api.devFixtures.resetCurrentUser, {}),
    ).rejects.toThrow(/plan shares reach 50 rows/);
    expect((await linkRows(backend, userId)).shares).toHaveLength(50);
  });
});

describe("the shared list fixture", () => {
  async function fixtureLists(backend: TestBackend, userId: Id<"users">) {
    return await backend.run(async (ctx) => {
      const memberships = await ctx.db
        .query("sharedListMembers")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      return memberships.map((membership) => membership.listId);
    });
  }

  async function partnerUsers(backend: TestBackend) {
    return await backend.run(async (ctx) =>
      (await ctx.db.query("users").collect()).filter(
        (user) => user.name === "Priya Sharma",
      ),
    );
  }

  async function realUser(backend: TestBackend, name: string) {
    return await backend.run(async (ctx) => {
      const id = await ctx.db.insert("users", { name });
      await ctx.db.insert("authAccounts", {
        userId: id,
        provider: "google",
        providerAccountId: `google-${id}`,
      });
      return id;
    });
  }

  async function insertList(
    backend: TestBackend,
    ownerId: Id<"users">,
    memberIds: Id<"users">[],
  ) {
    return await backend.run(async (ctx) => {
      const listId = await ctx.db.insert("sharedLists", {
        ownerId,
        name: "Weekend",
        cities: ["Lisbon"],
        inviteToken: `token-${ownerId}`,
        placeCount: 1,
        createdAt: Date.now(),
      });
      for (const userId of [ownerId, ...memberIds]) {
        await ctx.db.insert("sharedListMembers", {
          listId,
          userId,
          joinedAt: Date.now(),
          seenAt: Date.now(),
        });
      }
      await ctx.db.insert("sharedListPlaces", {
        listId,
        addedBy: ownerId,
        name: "Time Out Market",
        lat: 38.7069,
        lng: -9.1458,
        city: "Lisbon",
        addedAt: Date.now(),
      });
      return listId;
    });
  }

  it("seeds Date night spots with three places new from Priya", async () => {
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "true");
    const { client } = await anonymousFixtureUser();

    await expect(
      client.mutation(api.devFixtures.resetCurrentUser, {}),
    ).resolves.toEqual({ items: 7, spaces: 3, memberships: 4 });

    const lists = await client.query(api.sharedLists.listSharedLists, {});
    expect(lists).toHaveLength(1);
    expect(lists[0]).toMatchObject({
      name: "Date night spots",
      placeCount: 5,
      newCount: 3,
      newFrom: [{ firstName: "Priya", count: 3 }],
      isOwner: true,
    });
    const detail = await client.query(api.sharedLists.getSharedList, {
      listId: lists[0]._id,
    });
    expect(detail?.cities).toEqual(["Austin"]);
    expect(
      detail?.places.map((place) => [place.name, place.isNew, place.category]),
    ).toEqual([
      ["Uchi", true, "Restaurant"],
      ["Barton Springs Pool", true, "Park"],
      ["Franklin Barbecue", true, "Restaurant"],
      ["Houndstooth Coffee", false, undefined],
      ["Jo's Coffee", false, undefined],
    ]);
    expect(
      detail?.places.filter((place) => place.itemId !== undefined),
    ).toHaveLength(2);
  });

  it("leaves one fixture list and one Priya after a second reset", async () => {
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "true");
    const { backend, userId, client } = await anonymousFixtureUser();

    await client.mutation(api.devFixtures.resetCurrentUser, {});
    const [first] = await fixtureLists(backend, userId);
    await client.mutation(api.devFixtures.resetCurrentUser, {});

    const lists = await fixtureLists(backend, userId);
    expect(lists).toHaveLength(1);
    expect(lists[0]).not.toBe(first);
    expect(await partnerUsers(backend)).toHaveLength(1);
    await backend.run(async (ctx) => {
      expect(await ctx.db.get(first)).toBeNull();
      expect(
        await ctx.db
          .query("sharedListPlaces")
          .withIndex("by_list_and_added", (q) => q.eq("listId", first))
          .collect(),
      ).toEqual([]);
      expect(await ctx.db.query("sharedLists").collect()).toHaveLength(1);
    });
  });

  it("leaves a real list the way Leave list does", async () => {
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "true");
    const { backend, userId, client } = await anonymousFixtureUser();
    const boId = await realUser(backend, "Bo Costa");
    const listId = await insertList(backend, userId, [boId]);

    await client.mutation(api.devFixtures.resetCurrentUser, {});

    await backend.run(async (ctx) => {
      expect(await ctx.db.get(listId)).toMatchObject({
        ownerId: boId,
        placeCount: 1,
      });
      const members = await ctx.db
        .query("sharedListMembers")
        .withIndex("by_list_and_user", (q) => q.eq("listId", listId))
        .collect();
      expect(members.map((member) => member.userId)).toEqual([boId]);
      expect(
        await ctx.db
          .query("sharedListPlaces")
          .withIndex("by_list_and_added", (q) => q.eq("listId", listId))
          .collect(),
      ).toHaveLength(1);
    });
    const lists = await client.query(api.sharedLists.listSharedLists, {});
    expect(lists.map((list) => list.name)).toEqual(["Date night spots"]);
  });

  it("refuses an account on more than 20 lists without deleting anything", async () => {
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "true");
    const { backend, userId, client } = await anonymousFixtureUser();
    await backend.run(async (ctx) => {
      await ctx.db.insert("items", {
        userId,
        type: "note",
        status: "ready",
        note: "Keep me",
        tags: [],
        searchText: "keep me",
      });
    });
    for (let index = 0; index < 21; index += 1) {
      await insertList(backend, userId, []);
    }

    await expect(
      client.mutation(api.devFixtures.resetCurrentUser, {}),
    ).rejects.toThrow(/shared lists exceed 20 rows/);
    expect(await fixtureLists(backend, userId)).toHaveLength(21);
    await backend.run(async (ctx) => {
      expect(
        await ctx.db
          .query("items")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect(),
      ).toHaveLength(1);
    });
  });

  it("adds Priya's next place each run until the pool is used up", async () => {
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "true");
    const { backend, userId, client } = await anonymousFixtureUser();
    await client.mutation(api.devFixtures.resetCurrentUser, {});
    const [listId] = await fixtureLists(backend, userId);

    const added = [];
    const counts = [];
    for (let run = 0; run < 4; run += 1) {
      added.push(
        await backend.mutation(
          internal.devFixtures.simulateSharedListActivity,
          { listId },
        ),
      );
      counts.push(
        await backend.run(
          async (ctx) => (await ctx.db.get(listId))?.placeCount,
        ),
      );
    }

    expect(added).toEqual([
      "Veracruz All Natural",
      "Zilker Park",
      "Torchy's Tacos",
      null,
    ]);
    expect(counts).toEqual([6, 7, 8, 8]);
    const lists = await client.query(api.sharedLists.listSharedLists, {});
    expect(lists[0]?.newFrom).toEqual([{ firstName: "Priya", count: 6 }]);
  });

  it("adds nothing to a list that is not a fixture", async () => {
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "true");
    const { backend, userId, client } = await anonymousFixtureUser();
    const oauthId = await realUser(backend, "Ana Silva");
    const boId = await realUser(backend, "Bo Costa");
    const partnerId = await backend.run(async (ctx) =>
      ctx.db.insert("users", { name: "Priya Sharma" }),
    );
    await client.mutation(api.devFixtures.resetCurrentUser, {});
    const [fixture] = await fixtureLists(backend, userId);
    const notAnonymous = await insertList(backend, oauthId, [partnerId]);
    const noPartner = await insertList(backend, userId, [boId]);

    for (const listId of [notAnonymous, noPartner]) {
      await expect(
        backend.mutation(internal.devFixtures.simulateSharedListActivity, {
          listId,
        }),
      ).resolves.toBeNull();
    }
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", undefined);
    await expect(
      backend.mutation(internal.devFixtures.simulateSharedListActivity, {
        listId: fixture,
      }),
    ).resolves.toBeNull();
    await backend.run(async (ctx) => {
      for (const listId of [notAnonymous, noPartner, fixture]) {
        const places = await ctx.db
          .query("sharedListPlaces")
          .withIndex("by_list_and_added", (q) => q.eq("listId", listId))
          .collect();
        expect(places.map((place) => place.name)).not.toContain(
          "Veracruz All Natural",
        );
      }
    });
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
