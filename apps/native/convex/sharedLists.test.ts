// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import { MAX_LIST_CITIES } from "./model/sharedListLimits";
import { MAX_LIST_MEMBERS } from "./model/sharedLists";
import {
  joiner,
  LISBON,
  listWithOwner,
  seedSave,
} from "./sharedLists.test.helpers";
import { newConvexTest, signedInUser } from "./test.setup";

describe("createSharedList", () => {
  it("needs Pro", async () => {
    const base = newConvexTest();
    const free = await signedInUser(base, { pro: false });
    await expect(
      free.t.mutation(api.sharedLists.createSharedList, {
        name: "Ours",
        cities: ["Lisbon"],
      }),
    ).rejects.toThrow(/pro/i);
  });

  it("copies the caller's pins for the cities and makes the caller a member", async () => {
    const { owner, itemId, listId } = await listWithOwner();
    const list = await owner.t.query(api.sharedLists.getSharedList, { listId });
    expect(list).not.toBeNull();
    expect(list?.name).toBe("Lisbon weekend");
    expect(list?.isOwner).toBe(true);
    expect(list?.placeCount).toBe(2);
    expect(list?.cities).toEqual(["Lisbon"]);
    expect(list?.members).toEqual([
      expect.objectContaining({
        firstName: "Ana",
        isYou: true,
        isOwner: true,
      }),
    ]);
    expect(
      list?.places.map((place) => [
        place.name,
        place.itemId,
        place.addedByYou,
        place.isNew,
      ]),
    ).toEqual(
      expect.arrayContaining([
        ["Time Out Market", itemId, true, false],
        ["Manteigaria", itemId, true, false],
      ]),
    );
    expect(list?.trips).toEqual([]);
  });

  it("does not count a list trip's stops as the planner's saves", async () => {
    const { owner, itemId, listId } = await listWithOwner();
    const tripId = await owner.t.mutation(
      internal.tripPlannerData.saveTripPlanInternal,
      {
        city: "Lisbon",
        dayCount: 1,
        pace: "easy",
        interests: [],
        listId,
        days: [
          [
            {
              source: "list",
              itemId,
              name: "Ramen Shop",
              lat: 38.71,
              lng: -9.14,
            },
          ],
        ],
        unplanned: [],
      },
    );
    const { page } = await owner.t.query(api.tripPlannerData.listTripPlans, {
      paginationOpts: { numItems: 5, cursor: null },
    });
    expect(page).toEqual([
      expect.objectContaining({ _id: tripId, stopCount: 1, savedCount: 0 }),
    ]);
  });

  it("leaves out pins of other cities and never copies a save's title", async () => {
    const base = newConvexTest();
    const owner = await signedInUser(base, { pro: true });
    await seedSave(base, owner.userId, {
      title: "Porto secrets",
      cities: ["Porto", "Lisbon"],
      pins: [
        { name: "Majestic", lat: 41.1467, lng: -8.6075, city: "Porto" },
        { name: "Brasileira", ...LISBON, city: "Lisbon" },
      ],
    });
    const { listId } = await owner.t.mutation(
      api.sharedLists.createSharedList,
      { name: "Lisbon", cities: ["lisbon"] },
    );
    const rows = await base.run((ctx) =>
      ctx.db
        .query("sharedListPlaces")
        .withIndex("by_list_and_added", (q) => q.eq("listId", listId))
        .collect(),
    );
    expect(rows.map((row) => row.name)).toEqual(["Brasileira"]);
    expect(JSON.stringify(rows)).not.toContain("Porto secrets");
  });
});

describe("a list's cities", () => {
  async function emptyList(cities: string[]) {
    const base = newConvexTest();
    const owner = await signedInUser(base, { pro: true });
    const { listId, inviteToken: token } = await owner.t.mutation(
      api.sharedLists.createSharedList,
      { name: "Ours", cities },
    );
    return { base, owner, listId, token };
  }

  it("refuses a list when no city survives tidying", async () => {
    const base = newConvexTest();
    const owner = await signedInUser(base, { pro: true });
    for (const cities of [[], ["   "]]) {
      await expect(
        owner.t.mutation(api.sharedLists.createSharedList, {
          name: "Ours",
          cities,
        }),
      ).rejects.toThrow(/City required/);
    }
  });

  it("keeps the tidied choice, one per city and capped, on a list with no places", async () => {
    const { base, owner, listId, token } = await emptyList([
      "  Lisbon ",
      "LISBON",
      "Porto",
      "Faro",
      "Braga",
      "Sintra",
      "Evora",
    ]);
    const chosen = ["Lisbon", "Porto", "Faro", "Braga", "Sintra"];
    expect(MAX_LIST_CITIES).toBe(chosen.length);
    expect((await base.run((ctx) => ctx.db.get(listId)))?.cities).toEqual(
      chosen,
    );
    const list = await owner.t.query(api.sharedLists.getSharedList, { listId });
    expect(list?.placeCount).toBe(0);
    expect(list?.cities).toEqual(chosen);
    expect(
      (await base.query(api.sharedLists.invitePreview, { token }))?.cities,
    ).toEqual(chosen);
  });

  it("names the chosen cities first, then others its places carry, once each", async () => {
    const { base, owner, listId, token } = await emptyList(["Lisbon"]);
    for (const [name, lat, city] of [
      ["Forum", 37.01, "Faro"],
      ["Marina", 37.02, "Faro"],
      ["Rossio", 38.71, "LISBON"],
    ] as const) {
      await owner.t.mutation(api.sharedLists.addSharedListPlace, {
        listId,
        place: { name, lat, lng: -8, city },
      });
    }
    const list = await owner.t.query(api.sharedLists.getSharedList, { listId });
    expect(list?.cities).toEqual(["Lisbon", "Faro"]);
    expect(
      (await base.query(api.sharedLists.invitePreview, { token }))?.cities,
    ).toEqual(["Lisbon", "Faro"]);
  });
});

describe("invitePreview", () => {
  it("answers a signed-out caller from the token", async () => {
    const { base, token } = await listWithOwner();
    const preview = await base.query(api.sharedLists.invitePreview, { token });
    expect(preview).toEqual({
      inviterName: "Ana",
      name: "Lisbon weekend",
      placeCount: 2,
      cities: ["Lisbon"],
      placeNames: expect.arrayContaining(["Time Out Market", "Manteigaria"]),
    });
    expect(preview?.placeNames).toHaveLength(2);
  });

  it("is null for an unknown token or a deleting owner", async () => {
    const { base, owner, token } = await listWithOwner();
    expect(
      await base.query(api.sharedLists.invitePreview, { token: "nope" }),
    ).toBeNull();
    await base.run((ctx) => ctx.db.patch(owner.userId, { deleting: true }));
    expect(
      await base.query(api.sharedLists.invitePreview, { token }),
    ).toBeNull();
  });
});

describe("the web invite route", () => {
  it("serves the preview from the token and 404s otherwise", async () => {
    const { base, owner, token } = await listWithOwner();
    const found = await base.fetch(`/list/invites/${token}`);
    expect(found.status).toBe(200);
    expect(await found.json()).toMatchObject({
      inviterName: "Ana",
      name: "Lisbon weekend",
      placeCount: 2,
    });
    expect((await base.fetch("/list/invites/nope")).status).toBe(404);
    await base.run((ctx) => ctx.db.patch(owner.userId, { deleting: true }));
    expect((await base.fetch(`/list/invites/${token}`)).status).toBe(404);
  });
});

describe("joinSharedList", () => {
  it("lets a free person in, once, and treats what is already there as seen", async () => {
    const { base, token, listId } = await listWithOwner();
    const bo = await joiner(base, token);
    expect(bo.joined).toBe(listId);
    expect(await bo.t.mutation(api.sharedLists.joinSharedList, { token })).toBe(
      listId,
    );
    const members = await base.run((ctx) =>
      ctx.db
        .query("sharedListMembers")
        .withIndex("by_list_and_user", (q) => q.eq("listId", listId))
        .collect(),
    );
    expect(members).toHaveLength(2);
    const list = await bo.t.query(api.sharedLists.getSharedList, { listId });
    expect(list?.isOwner).toBe(false);
    expect(list?.covered).toBe(true);
    expect(list?.inviteToken).toBe(token);
    expect(list?.members.map((member) => member.firstName)).toEqual([
      "Ana",
      "Bo",
    ]);
    expect(
      list?.places.every(
        (place) =>
          !place.isNew &&
          !place.addedByYou &&
          place.itemId === undefined &&
          place.addedByName === "Ana",
      ),
    ).toBe(true);
    const lists = await bo.t.query(api.sharedLists.listSharedLists, {});
    expect(lists).toEqual([
      expect.objectContaining({ _id: listId, newCount: 0, isOwner: false }),
    ]);
  });

  it("is not covered for a free member once the owner lapses", async () => {
    const { base, owner, token, listId } = await listWithOwner();
    const bo = await joiner(base, token);
    await base.run(async (ctx) => {
      const sub = await ctx.db
        .query("subscriptions")
        .withIndex("by_user", (q) => q.eq("userId", owner.userId))
        .unique();
      if (sub) await ctx.db.delete(sub._id);
    });
    const list = await bo.t.query(api.sharedLists.getSharedList, { listId });
    expect(list?.covered).toBe(false);
  });

  it("answers null when the owner is deleting and refuses a full list", async () => {
    const { base, owner, token } = await listWithOwner();
    for (let n = 1; n < MAX_LIST_MEMBERS; n++) {
      await joiner(base, token, { name: `Member ${n}` });
    }
    const late = await signedInUser(base, { pro: false });
    await expect(
      late.t.mutation(api.sharedLists.joinSharedList, { token }),
    ).rejects.toThrow(/full/);
    await base.run((ctx) => ctx.db.patch(owner.userId, { deleting: true }));
    expect(
      await late.t.mutation(api.sharedLists.joinSharedList, { token }),
    ).toBeNull();
  });

  it("hides a list from someone who is not on it", async () => {
    const { base, listId } = await listWithOwner();
    const stranger = await signedInUser(base, { pro: true });
    expect(
      await stranger.t.query(api.sharedLists.getSharedList, { listId }),
    ).toBeNull();
    await expect(
      stranger.t.mutation(api.sharedLists.removeSharedListMember, {
        listId,
        memberId: stranger.userId,
      }),
    ).rejects.toThrow(/not found/);
  });
});

describe("leaveSharedList", () => {
  it("hands an owner's list to the oldest member and keeps every place", async () => {
    const { base, owner, token, listId } = await listWithOwner();
    const bo = await joiner(base, token, { name: "Bo" });
    const cy = await joiner(base, token, { name: "Cy" });
    await owner.t.mutation(api.sharedLists.leaveSharedList, { listId });
    expect(
      await owner.t.query(api.sharedLists.getSharedList, { listId }),
    ).toBeNull();
    const list = await cy.t.query(api.sharedLists.getSharedList, { listId });
    expect(list?.placeCount).toBe(2);
    expect(list?.members).toEqual([
      expect.objectContaining({ userId: bo.userId, isOwner: true }),
      expect.objectContaining({ userId: cy.userId, isOwner: false }),
    ]);
    expect(await bo.t.query(api.sharedLists.getSharedList, { listId })).toEqual(
      expect.objectContaining({ isOwner: true }),
    );
  });

  it("skips a deleting member when choosing the new owner", async () => {
    const { base, owner, token, listId } = await listWithOwner();
    const bo = await joiner(base, token, { name: "Bo" });
    const cy = await joiner(base, token, { name: "Cy" });
    await base.run((ctx) => ctx.db.patch(bo.userId, { deleting: true }));
    await owner.t.mutation(api.sharedLists.leaveSharedList, { listId });
    const list = await base.run((ctx) => ctx.db.get(listId));
    expect(list?.ownerId).toBe(cy.userId);
  });

  it("deletes the list and its places when the last member leaves", async () => {
    const { base, owner, listId } = await listWithOwner();
    await owner.t.mutation(api.sharedLists.leaveSharedList, { listId });
    const left = await base.run(async (ctx) => ({
      list: await ctx.db.get(listId),
      places: await ctx.db.query("sharedListPlaces").collect(),
      members: await ctx.db.query("sharedListMembers").collect(),
    }));
    expect(left).toEqual({ list: null, places: [], members: [] });
  });
});

describe("getSharedList's save links", () => {
  it("drops the link once the save behind a place is gone", async () => {
    const { base, owner, itemId, listId } = await listWithOwner();
    const before = await owner.t.query(api.sharedLists.getSharedList, {
      listId,
    });
    expect(before?.places.map((place) => place.itemId)).toEqual([
      itemId,
      itemId,
    ]);
    await base.run((ctx) => ctx.db.delete(itemId));
    const after = await owner.t.query(api.sharedLists.getSharedList, {
      listId,
    });
    expect(after?.places).toHaveLength(2);
    expect(after?.places.map((place) => place.itemId)).toEqual([
      undefined,
      undefined,
    ]);
  });
});

describe("removeSharedListMember", () => {
  it("rotates the link even when the person has already left", async () => {
    const { base, owner, token, listId } = await listWithOwner();
    const bo = await joiner(base, token);
    await bo.t.mutation(api.sharedLists.leaveSharedList, { listId });
    await expect(
      owner.t.mutation(api.sharedLists.removeSharedListMember, {
        listId,
        memberId: bo.userId,
      }),
    ).resolves.toBeNull();
    const after = await base.run((ctx) => ctx.db.get(listId));
    expect(after?.inviteToken).not.toBe(token);
    expect(
      await bo.t.mutation(api.sharedLists.joinSharedList, { token }),
    ).toBeNull();
  });

  it("is for the owner, drops the member and rotates the invite link", async () => {
    const { base, owner, token, listId } = await listWithOwner();
    const bo = await joiner(base, token);
    await expect(
      bo.t.mutation(api.sharedLists.removeSharedListMember, {
        listId,
        memberId: owner.userId,
      }),
    ).rejects.toThrow(/owner/);
    await owner.t.mutation(api.sharedLists.removeSharedListMember, {
      listId,
      memberId: bo.userId,
    });
    expect(
      await bo.t.query(api.sharedLists.getSharedList, { listId }),
    ).toBeNull();
    expect(
      await bo.t.mutation(api.sharedLists.joinSharedList, { token }),
    ).toBeNull();
    const list = await owner.t.query(api.sharedLists.getSharedList, { listId });
    expect(list?.inviteToken).not.toBe(token);
    expect(list?.members).toHaveLength(1);
  });
});
