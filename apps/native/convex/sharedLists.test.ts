// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { MAX_LIST_MEMBERS } from "./model/sharedLists";
import { newConvexTest, signedInUser, type TestBackend } from "./test.setup";

const LISBON = { lat: 38.7223, lng: -9.1393 };
const near = (steps: number) => ({
  lat: LISBON.lat + steps * 0.001,
  lng: LISBON.lng,
});

type Pin = {
  name: string;
  lat: number;
  lng: number;
  appleId?: string;
  category?: string;
  city?: string;
};

export async function seedSave(
  base: TestBackend,
  userId: Id<"users">,
  options: {
    city?: string;
    cities?: string[];
    pins: Pin[];
    tags?: string[];
    title?: string;
  },
): Promise<Id<"items">> {
  const cities = options.cities ?? [options.city ?? "Lisbon"];
  return await base.run(async (ctx) =>
    ctx.db.insert("items", {
      userId,
      type: "link",
      status: "ready",
      title: options.title ?? "A reel",
      cities,
      places: options.pins.map((pin) => pin.name),
      placePins: options.pins.map((pin) => ({
        ...pin,
        ...(pin.city === undefined && cities.length === 1
          ? { city: cities[0] }
          : {}),
      })),
      url: "https://www.tiktok.com/@someone/video/1",
      tags: options.tags ?? ["food"],
      searchText: options.title ?? "A reel",
    }),
  );
}

export async function listWithOwner(options: { pro?: boolean } = {}) {
  const base = newConvexTest();
  const owner = await signedInUser(base, {
    pro: options.pro ?? true,
    email: "ana@example.com",
  });
  await base.run((ctx) => ctx.db.patch(owner.userId, { name: "Ana Silva" }));
  const itemId = await seedSave(base, owner.userId, {
    pins: [
      { name: "Time Out Market", ...LISBON, category: "Restaurant" },
      {
        name: "Manteigaria",
        ...near(2),
        appleId: "A-mant",
        category: "Bakery",
      },
    ],
  });
  const listId = await owner.t.mutation(api.sharedLists.createSharedList, {
    name: "  Lisbon  weekend ",
    cities: ["Lisbon"],
  });
  const token = await base.run(
    async (ctx) => (await ctx.db.get(listId))?.inviteToken ?? "",
  );
  return { base, owner, itemId, listId, token };
}

export async function joiner(
  base: TestBackend,
  token: string,
  options: { pro?: boolean; name?: string } = {},
) {
  const person = await signedInUser(base, { pro: options.pro ?? false });
  await base.run((ctx) =>
    ctx.db.patch(person.userId, { name: options.name ?? "Bo Costa" }),
  );
  const joined = await person.t.mutation(api.sharedLists.joinSharedList, {
    token,
  });
  return { ...person, joined };
}

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
    const listId = await owner.t.mutation(api.sharedLists.createSharedList, {
      name: "Lisbon",
      cities: ["lisbon"],
    });
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
  it("lets a free person in, once, and shows them the owner's places as new", async () => {
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
          place.isNew &&
          !place.addedByYou &&
          place.itemId === undefined &&
          place.addedByName === "Ana",
      ),
    ).toBe(true);
    const lists = await bo.t.query(api.sharedLists.listSharedLists, {});
    expect(lists).toEqual([
      expect.objectContaining({ _id: listId, newCount: 2, isOwner: false }),
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

describe("removeSharedListMember", () => {
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
