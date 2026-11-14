// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { joiner, listWithOwner } from "./sharedLists.test.helpers";
import type { TestBackend } from "./test.setup";

async function visitRows(base: TestBackend, userId: Id<"users">) {
  return await base.run((ctx) =>
    ctx.db
      .query("placeVisits")
      .withIndex("by_user_and_visited", (q) => q.eq("userId", userId))
      .collect(),
  );
}

async function friendPlace() {
  const { base, owner, token, listId } = await listWithOwner();
  const bo = await joiner(base, token);
  const list = await bo.t.query(api.sharedLists.getSharedList, { listId });
  const place = list?.places.find((p) => p.name === "Manteigaria");
  if (place === undefined) throw new Error("seed place missing");
  return { base, owner, bo, listId, place };
}

describe("Went on a shared list", () => {
  it("stamps a free member's Passport for a place a friend added", async () => {
    const { base, bo, place } = await friendPlace();
    await bo.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: place._id,
      visited: true,
    });
    const [row] = await visitRows(base, bo.userId);
    expect(row).toMatchObject({
      name: "Manteigaria",
      listPlaceId: place._id,
      spots: [{ lat: place.lat, lng: place.lng, appleId: "A-mant" }],
      stampPlaces: [{ lat: place.lat, lng: place.lng, city: "Lisbon" }],
    });
    expect(row.itemId).toBeUndefined();

    const stamps = await bo.t.query(api.placeVisits.listPassportStamps, {});
    expect(stamps).toEqual([
      expect.objectContaining({
        name: "Manteigaria",
        listPlaceId: place._id,
        city: "Lisbon",
        cover: null,
      }),
    ]);
    expect(stamps[0].itemId).toBeUndefined();
    expect(await bo.t.query(api.placeVisits.getPassport, {})).toEqual([]);
    expect(await bo.t.query(api.placeVisits.listBadgeStamps, {})).toHaveLength(
      1,
    );
  });

  it("removes only the stamp it made when unmarked", async () => {
    const { base, bo, place } = await friendPlace();
    await bo.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: place._id,
      visited: true,
    });
    await bo.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: place._id,
      visited: false,
    });
    expect(await visitRows(base, bo.userId)).toEqual([]);
  });

  it("keeps a stamp the member made from their own save", async () => {
    const { base, owner, listId } = await friendPlace();
    const list = await owner.t.query(api.sharedLists.getSharedList, {
      listId,
    });
    const place = list?.places.find((p) => p.name === "Manteigaria");
    if (place?.itemId === undefined) throw new Error("own save missing");
    await owner.t.mutation(api.placeVisits.setVisited, {
      itemId: place.itemId,
      name: "Manteigaria",
      visited: true,
    });
    const before = await visitRows(base, owner.userId);
    await owner.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: place._id,
      visited: true,
    });
    await owner.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: place._id,
      visited: false,
    });
    expect(await visitRows(base, owner.userId)).toEqual(before);
    expect(await owner.t.query(api.placeVisits.getPassport, {})).toHaveLength(
      1,
    );
  });

  it("can be taken out of the Passport without touching the list", async () => {
    const { base, bo, place } = await friendPlace();
    await bo.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: place._id,
      visited: true,
    });
    await bo.t.mutation(api.placeVisits.removeListStamp, {
      name: "Manteigaria",
    });
    expect(await visitRows(base, bo.userId)).toEqual([]);
    expect((await base.run((ctx) => ctx.db.get(place._id)))?.visitedAt).toEqual(
      expect.any(Number),
    );
  });
});
