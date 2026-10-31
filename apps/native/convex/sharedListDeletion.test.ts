// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { LIST_DRAIN_BATCH, MAX_LISTS_PER_USER } from "./model/sharedLists";
import { joiner, listWithOwner, seedSave } from "./sharedLists.test.helpers";
import { seedNotes, signedInUser, type TestBackend } from "./test.setup";
import { DELETE_BATCH } from "./users";

const MAX_PASSES = 30;

async function drain(base: TestBackend, userId: Id<"users">): Promise<void> {
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    if ((await base.run((ctx) => ctx.db.get(userId))) === null) return;
    await base.mutation(internal.users.processAccountDeletion, { userId });
  }
  expect(await base.run((ctx) => ctx.db.get(userId))).toBeNull();
}

async function remains(base: TestBackend, listId: Id<"sharedLists">) {
  return await base.run(async (ctx) => ({
    list: await ctx.db.get(listId),
    places: await ctx.db
      .query("sharedListPlaces")
      .withIndex("by_list_and_added", (q) => q.eq("listId", listId))
      .collect(),
    members: await ctx.db
      .query("sharedListMembers")
      .withIndex("by_list_and_user", (q) => q.eq("listId", listId))
      .collect(),
  }));
}

describe("deleting an account with shared lists", () => {
  it("hands the owner's list to the other live member and removes only the owner's places", async () => {
    const { base, owner, token, listId } = await listWithOwner();
    const bo = await joiner(base, token, { pro: true });
    const boItem = await seedSave(base, bo.userId, {
      pins: [{ name: "Ramiro", lat: 38.73, lng: -9.139 }],
    });
    await bo.t.mutation(api.sharedLists.addSavePlaces, {
      listId,
      itemId: boItem,
    });
    await owner.t.mutation(api.users.deleteCurrentUserAccount, {});
    await drain(base, owner.userId);
    const left = await remains(base, listId);
    expect(left.list?.ownerId).toBe(bo.userId);
    expect(left.list?.placeCount).toBe(1);
    expect(left.places.map((place) => place.name)).toEqual(["Ramiro"]);
    expect(left.members.map((member) => member.userId)).toEqual([bo.userId]);
    const seen = await bo.t.query(api.sharedLists.getSharedList, { listId });
    expect(seen?.isOwner).toBe(true);
    expect(seen?.members).toHaveLength(1);
  });

  it("deletes the list when the only other member is deleting too", async () => {
    const { base, owner, token, listId } = await listWithOwner();
    const bo = await joiner(base, token);
    await bo.t.mutation(api.sharedLists.addSharedListPlace, {
      listId,
      place: { name: "Ramiro", lat: 38.73, lng: -9.139 },
    });
    await bo.t.mutation(api.users.deleteCurrentUserAccount, {});
    await owner.t.mutation(api.users.deleteCurrentUserAccount, {});
    await drain(base, owner.userId);
    expect(await remains(base, listId)).toEqual({
      list: null,
      places: [],
      members: [],
    });
    await drain(base, bo.userId);
    expect(
      await base.run((ctx) => ctx.db.query("sharedListMembers").collect()),
    ).toEqual([]);
  });

  it("takes a deleted member's rows out of someone else's list and leaves the rest", async () => {
    const { base, owner, token, listId } = await listWithOwner();
    const bo = await joiner(base, token);
    await bo.t.mutation(api.sharedLists.addSharedListPlace, {
      listId,
      place: { name: "Ramiro", lat: 38.73, lng: -9.139 },
    });
    const before = await remains(base, listId);
    await bo.t.mutation(api.users.deleteCurrentUserAccount, {});
    await drain(base, bo.userId);
    const after = await remains(base, listId);
    expect(after.list).toEqual({ ...before.list, placeCount: 2 });
    expect(after.places).toEqual(
      before.places.filter((place) => place.addedBy === owner.userId),
    );
    expect(after.members.map((member) => member.userId)).toEqual([
      owner.userId,
    ]);
    const seen = await owner.t.query(api.sharedLists.getSharedList, { listId });
    expect(seen?.members).toHaveLength(1);
    expect(seen?.placeCount).toBe(2);
  });

  it("refuses a join and a preview while the owner's account is draining", async () => {
    const { base, owner, token, listId } = await listWithOwner();
    const bo = await joiner(base, token);
    await seedNotes(base, owner.userId, DELETE_BATCH + 1);
    await owner.t.mutation(api.users.deleteCurrentUserAccount, {});
    expect((await base.run((ctx) => ctx.db.get(listId)))?.ownerId).toBe(
      owner.userId,
    );
    const late = await signedInUser(base, { pro: true });
    expect(
      await late.t.mutation(api.sharedLists.joinSharedList, { token }),
    ).toBeNull();
    expect(
      await base.query(api.sharedLists.invitePreview, { token }),
    ).toBeNull();
    await drain(base, owner.userId);
    expect((await remains(base, listId)).list?.ownerId).toBe(bo.userId);
    expect(
      await late.t.mutation(api.sharedLists.joinSharedList, { token }),
    ).toBe(listId);
  });

  it("deletes a list with more places than one batch in the pass that reaches it", async () => {
    const { base, owner, token, listId } = await listWithOwner();
    const bo = await joiner(base, token);
    await base.run(async (ctx) => {
      for (let n = 0; n < LIST_DRAIN_BATCH + 50; n++) {
        await ctx.db.insert("sharedListPlaces", {
          listId,
          addedBy: bo.userId,
          name: `Spot ${n}`,
          lat: 38.7 + n * 0.0001,
          lng: -9.14,
          addedAt: n,
        });
      }
      await ctx.db.patch(listId, { placeCount: LIST_DRAIN_BATCH + 52 });
    });
    await bo.t.mutation(api.sharedLists.leaveSharedList, { listId });
    expect((await remains(base, listId)).places).toHaveLength(
      LIST_DRAIN_BATCH + 52,
    );
    await owner.t.mutation(api.users.deleteCurrentUserAccount, {});
    await drain(base, owner.userId);
    expect(await remains(base, listId)).toEqual({
      list: null,
      places: [],
      members: [],
    });
  });

  it("drains a person who is on as many lists as the cap allows", async () => {
    const { base, owner, listId, token } = await listWithOwner();
    const bo = await joiner(base, token);
    await base.run(async (ctx) => {
      for (let n = 1; n < MAX_LISTS_PER_USER; n++) {
        const id = await ctx.db.insert("sharedLists", {
          ownerId: owner.userId,
          name: `List ${n}`,
          inviteToken: `token-${n}`,
          placeCount: 0,
          createdAt: n,
        });
        await ctx.db.insert("sharedListMembers", {
          listId: id,
          userId: owner.userId,
          joinedAt: n,
          seenAt: n,
        });
      }
    });
    await owner.t.mutation(api.users.deleteCurrentUserAccount, {});
    await drain(base, owner.userId);
    expect((await remains(base, listId)).list?.ownerId).toBe(bo.userId);
    expect(
      (await base.run((ctx) => ctx.db.query("sharedLists").collect())).map(
        (list) => list._id,
      ),
    ).toEqual([listId]);
  });

  it("clears a membership whose list is already gone", async () => {
    const { base, owner, listId } = await listWithOwner();
    await base.run((ctx) => ctx.db.delete(listId));
    await owner.t.mutation(api.users.deleteCurrentUserAccount, {});
    await drain(base, owner.userId);
    expect(
      await base.run((ctx) => ctx.db.query("sharedListMembers").collect()),
    ).toEqual([]);
  });

  it("deletes the list when a member leaves and only a deleting owner remains", async () => {
    const { base, owner, token, listId } = await listWithOwner();
    const bo = await joiner(base, token);
    await base.run((ctx) => ctx.db.patch(owner.userId, { deleting: true }));
    await bo.t.mutation(api.sharedLists.leaveSharedList, { listId });
    expect(await remains(base, listId)).toEqual({
      list: null,
      places: [],
      members: [],
    });
  });
});
