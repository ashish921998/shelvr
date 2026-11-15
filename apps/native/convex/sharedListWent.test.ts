// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { joiner, listWithOwner } from "./sharedLists.test.helpers";
import { signedInUser, type TestBackend } from "./test.setup";

async function twoMembers() {
  const { base, owner, token, listId } = await listWithOwner();
  const bo = await joiner(base, token);
  const list = await bo.t.query(api.sharedLists.getSharedList, { listId });
  const place = list?.places.find((p) => p.name === "Manteigaria");
  if (place === undefined) throw new Error("seed place missing");
  return { base, owner, bo, listId, place };
}

async function placeAs(
  member: { t: { query: TestBackend["query"] } },
  listId: Id<"sharedLists">,
) {
  const list = await member.t.query(api.sharedLists.getSharedList, { listId });
  const place = list?.places.find((p) => p.name === "Manteigaria");
  if (place === undefined) throw new Error("place missing");
  return place;
}

async function stampCount(base: TestBackend, userId: Id<"users">) {
  const rows = await base.run((ctx) =>
    ctx.db
      .query("placeVisits")
      .withIndex("by_user_and_visited", (q) => q.eq("userId", userId))
      .collect(),
  );
  return rows.length;
}

describe("Went for each member of a shared list", () => {
  it("shows each member who went, you first, and stamps each Passport", async () => {
    const { base, owner, bo, listId, place } = await twoMembers();
    await owner.t.mutation(api.sharedLists.setSharedListPlaceWent, {
      placeId: place._id,
      went: true,
    });
    await bo.t.mutation(api.sharedLists.setSharedListPlaceWent, {
      placeId: place._id,
      went: true,
    });
    expect((await placeAs(bo, listId)).wentBy).toEqual([
      { firstName: "Bo", isYou: true },
      { firstName: "Ana", isYou: false },
    ]);
    expect((await placeAs(owner, listId)).wentBy).toEqual([
      { firstName: "Ana", isYou: true },
      { firstName: "Bo", isYou: false },
    ]);
    expect(await stampCount(base, bo.userId)).toBe(1);
  });

  it("undoes only your own Went and keeps the place marked while anyone went", async () => {
    const { base, owner, bo, listId, place } = await twoMembers();
    for (const member of [owner, bo]) {
      await member.t.mutation(api.sharedLists.setSharedListPlaceWent, {
        placeId: place._id,
        went: true,
      });
    }
    await bo.t.mutation(api.sharedLists.setSharedListPlaceWent, {
      placeId: place._id,
      went: false,
    });
    const after = await placeAs(bo, listId);
    expect(after.wentBy).toEqual([{ firstName: "Ana", isYou: false }]);
    expect(after.visitedAt).toEqual(expect.any(Number));
    expect(await stampCount(base, bo.userId)).toBe(0);
    await owner.t.mutation(api.sharedLists.setSharedListPlaceWent, {
      placeId: place._id,
      went: false,
    });
    const cleared = await placeAs(bo, listId);
    expect(cleared.wentBy).toBeUndefined();
    expect(cleared.visitedAt).toBeUndefined();
  });

  it("drops a member's Went when they leave or are removed", async () => {
    const { base, owner, bo, listId, place } = await twoMembers();
    const list = await base.run((ctx) => ctx.db.get(listId));
    if (list === null) throw new Error("list missing");
    const cy = await joiner(base, list.inviteToken, { name: "Cy Reis" });
    for (const member of [bo, cy]) {
      await member.t.mutation(api.sharedLists.setSharedListPlaceWent, {
        placeId: place._id,
        went: true,
      });
    }
    await bo.t.mutation(api.sharedLists.leaveSharedList, { listId });
    await owner.t.mutation(api.sharedLists.removeSharedListMember, {
      listId,
      memberId: cy.userId,
    });
    const stored = await base.run((ctx) => ctx.db.get(place._id));
    expect(stored?.went).toEqual([]);
  });

  it("records the member's own Went when an installed app marks the shared row", async () => {
    const { owner, bo, listId, place } = await twoMembers();
    await owner.t.mutation(api.sharedLists.setSharedListPlaceWent, {
      placeId: place._id,
      went: true,
    });
    await bo.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: place._id,
      visited: true,
    });
    expect((await placeAs(bo, listId)).wentBy).toEqual([
      { firstName: "Bo", isYou: true },
      { firstName: "Ana", isYou: false },
    ]);
    await bo.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: place._id,
      visited: false,
    });
    const after = await placeAs(bo, listId);
    expect(after.wentBy).toEqual([{ firstName: "Ana", isYou: false }]);
  });

  it("refuses someone outside the list", async () => {
    const { base, place } = await twoMembers();
    const stranger = await signedInUser(base, {});
    await expect(
      stranger.t.mutation(api.sharedLists.setSharedListPlaceWent, {
        placeId: place._id,
        went: true,
      }),
    ).rejects.toThrow();
  });

  it("forgets a deleted member's Went on a list that stays", async () => {
    const { base, owner, bo, place } = await twoMembers();
    for (const member of [owner, bo]) {
      await member.t.mutation(api.sharedLists.setSharedListPlaceWent, {
        placeId: place._id,
        went: true,
      });
    }
    await bo.t.mutation(api.users.deleteCurrentUserAccount, {});
    for (let pass = 0; pass < 30; pass++) {
      if ((await base.run((ctx) => ctx.db.get(bo.userId))) === null) break;
      await base.mutation(internal.users.processAccountDeletion, {
        userId: bo.userId,
      });
    }
    const stored = await base.run((ctx) => ctx.db.get(place._id));
    expect(stored?.went?.map((entry) => entry.userId)).toEqual([owner.userId]);
  });

  it("takes your Went off the list when you remove the stamp from Passport", async () => {
    const { owner, bo, listId, place } = await twoMembers();
    for (const member of [owner, bo]) {
      await member.t.mutation(api.sharedLists.setSharedListPlaceWent, {
        placeId: place._id,
        went: true,
      });
    }
    await bo.t.mutation(api.placeVisits.removeListStamp, {
      name: "Manteigaria",
    });
    const after = await placeAs(bo, listId);
    expect(after.wentBy).toEqual([{ firstName: "Ana", isYou: false }]);
    expect(after.visitedAt).toEqual(expect.any(Number));
  });

  it("takes your Went off every list that gave the stamp you remove", async () => {
    const { owner, bo, listId, place } = await twoMembers();
    const second = await owner.t.mutation(api.sharedLists.createSharedList, {
      name: "Pastries",
      cities: ["Lisbon"],
    });
    await bo.t.mutation(api.sharedLists.joinSharedList, {
      token: second.inviteToken,
    });
    const other = await placeAs(bo, second.listId);
    for (const placeId of [place._id, other._id]) {
      await bo.t.mutation(api.sharedLists.setSharedListPlaceWent, {
        placeId,
        went: true,
      });
    }
    await bo.t.mutation(api.placeVisits.removeListStamp, {
      name: "Manteigaria",
    });
    expect((await placeAs(bo, listId)).wentBy).toBeUndefined();
    expect((await placeAs(bo, second.listId)).wentBy).toBeUndefined();
  });
});
