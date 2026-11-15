// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  joiner,
  listWithOwner,
  near,
  seedSave,
} from "./sharedLists.test.helpers";
import { setTestConsent, type TestBackend } from "./test.setup";

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

async function portoBranch(
  base: TestBackend,
  listId: Id<"sharedLists">,
  addedBy: Id<"users">,
) {
  return await base.run((ctx) =>
    ctx.db.insert("sharedListPlaces", {
      listId,
      addedBy,
      name: "Manteigaria",
      lat: 41.1496,
      lng: -8.611,
      city: "Porto",
      appleId: "A-mant-porto",
      category: "Bakery",
      addedAt: Date.now(),
    }),
  );
}

describe("Went on a shared list", () => {
  it("stamps a free member's Passport for a place a friend added", async () => {
    const { base, bo, place } = await friendPlace();
    await bo.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: place._id,
      visited: true,
      stamp: true,
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
      stamp: true,
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
      stamp: true,
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

  it("keeps the stamp once the member also marks their own save", async () => {
    const { base, owner, listId } = await friendPlace();
    const list = await owner.t.query(api.sharedLists.getSharedList, {
      listId,
    });
    const place = list?.places.find((p) => p.name === "Manteigaria");
    if (place?.itemId === undefined) throw new Error("own save missing");
    await owner.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: place._id,
      visited: true,
      stamp: true,
    });
    const itemId = place.itemId;
    await base.run((ctx) => ctx.db.patch(itemId, { placePins: [] }));
    await owner.t.mutation(api.placeVisits.setVisited, {
      itemId,
      name: "Manteigaria",
      visited: true,
    });
    await owner.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: place._id,
      visited: false,
    });
    const rows = await visitRows(base, owner.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.itemId).toBe(place.itemId);
    expect(rows[0]?.spots).toEqual([]);
  });

  it("can be taken out of the Passport without touching the list", async () => {
    const { base, bo, place } = await friendPlace();
    await bo.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: place._id,
      visited: true,
      stamp: true,
    });
    await bo.t.mutation(api.placeVisits.removeListStamp, {
      name: "Manteigaria",
    });
    expect(await visitRows(base, bo.userId)).toEqual([]);
    expect((await base.run((ctx) => ctx.db.get(place._id)))?.visitedAt).toEqual(
      expect.any(Number),
    );
  });

  it("leaves the Passport alone for an installed app that sends no stamp flag", async () => {
    const { base, bo, place } = await friendPlace();
    await bo.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: place._id,
      visited: true,
    });
    expect(await visitRows(base, bo.userId)).toEqual([]);
  });

  it("removes its stamp when the member unmarks a place they added", async () => {
    const { base, owner, listId } = await friendPlace();
    const list = await owner.t.query(api.sharedLists.getSharedList, {
      listId,
    });
    const place = list?.places.find((p) => p.name === "Manteigaria");
    if (place === undefined) throw new Error("seed place missing");
    await owner.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: place._id,
      visited: true,
      stamp: true,
    });
    expect(await visitRows(base, owner.userId)).toHaveLength(1);
    await owner.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: place._id,
      visited: false,
    });
    expect(await visitRows(base, owner.userId)).toEqual([]);
  });

  it("sends no member's place to Apple when that member declined AI", async () => {
    const { base, owner, bo, place } = await friendPlace();
    await base.run((ctx) => setTestConsent(ctx, owner.userId, "declined"));
    await bo.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: place._id,
      visited: true,
      stamp: true,
    });
    const jobs = await base.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(jobs.filter((job) => job.name.includes("locateCountry"))).toEqual(
      [],
    );
    expect(await visitRows(base, bo.userId)).toHaveLength(1);
  });

  it("never looks up a declined member's place later, even on a country retry", async () => {
    const { base, owner, bo, place } = await friendPlace();
    await bo.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: place._id,
      visited: true,
      stamp: true,
    });
    await base.run((ctx) => setTestConsent(ctx, owner.userId, "declined"));
    const [row] = await visitRows(base, bo.userId);
    const claim = await base.mutation(internal.placeVisits.claimCountryLookup, {
      visitId: row._id,
      lat: place.lat,
      lng: place.lng,
    });
    expect(claim).toBeNull();
  });

  it("stamps a second branch with the same name and undoes only that one", async () => {
    const { base, owner, bo, listId, place } = await friendPlace();
    const porto = await portoBranch(base, listId, owner.userId);
    for (const placeId of [place._id, porto]) {
      await bo.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
        placeId,
        visited: true,
        stamp: true,
      });
    }
    const [both] = await visitRows(base, bo.userId);
    expect(both?.spots).toHaveLength(2);
    expect(both?.stampPlaces?.map((entry) => entry.city)).toEqual([
      "Lisbon",
      "Porto",
    ]);
    await bo.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: porto,
      visited: false,
    });
    const [lisbon] = await visitRows(base, bo.userId);
    expect(lisbon?.spots).toEqual([
      expect.objectContaining({ appleId: "A-mant" }),
    ]);
    expect(lisbon?.stampPlaces?.map((entry) => entry.city)).toEqual(["Lisbon"]);
    await bo.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: place._id,
      visited: false,
    });
    expect(await visitRows(base, bo.userId)).toEqual([]);
  });

  it("checks the adder of each branch before a country retry", async () => {
    const { base, bo, listId, place } = await friendPlace();
    const { token } = await base.run(async (ctx) => {
      const list = await ctx.db.get(listId);
      if (list === null) throw new Error("list missing");
      return { token: list.inviteToken };
    });
    const cy = await joiner(base, token, { name: "Cy Reis" });
    const porto = await portoBranch(base, listId, cy.userId);
    for (const placeId of [place._id, porto]) {
      await bo.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
        placeId,
        visited: true,
        stamp: true,
      });
    }
    await base.run((ctx) => setTestConsent(ctx, cy.userId, "declined"));
    const [row] = await visitRows(base, bo.userId);
    const [lisbon, portoSpot] = row?.stampPlaces ?? [];
    if (lisbon === undefined || portoSpot === undefined) {
      throw new Error("stamp places missing");
    }
    const claim = (point: { lat: number; lng: number }) =>
      base.mutation(internal.placeVisits.claimCountryLookup, {
        visitId: row._id,
        lat: point.lat,
        lng: point.lng,
      });
    expect(await claim(portoSpot)).toBeNull();
    expect(await claim(lisbon)).not.toBeNull();
  });

  it("counts a list stamp toward the badge of its place's kind", async () => {
    const { bo, place } = await friendPlace();
    await bo.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: place._id,
      visited: true,
      stamp: true,
    });
    const [badge] = await bo.t.query(api.placeVisits.listBadgeStamps, {});
    expect(badge?.kinds.length).toBeGreaterThan(0);
  });

  it("removes one branch's stamp from Passport and keeps the other", async () => {
    const { base, owner, bo, listId, place } = await friendPlace();
    const porto = await portoBranch(base, listId, owner.userId);
    for (const placeId of [place._id, porto]) {
      await bo.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
        placeId,
        visited: true,
        stamp: true,
      });
    }
    await bo.t.mutation(api.placeVisits.removeListStamp, {
      name: "Manteigaria",
      spot: { lat: 41.1496, lng: -8.611 },
    });
    const [row] = await visitRows(base, bo.userId);
    expect(row?.spots).toEqual([
      expect.objectContaining({ appleId: "A-mant" }),
    ]);
    expect(row?.stampPlaces?.map((entry) => entry.city)).toEqual(["Lisbon"]);
  });

  it("undoes a list stamp on a branch the member's save holds but they never marked", async () => {
    const { base, owner, listId } = await friendPlace();
    const itemId = await seedSave(base, owner.userId, {
      cities: ["Lisbon", "Porto"],
      pins: [
        { name: "Manteigaria", ...near(2), appleId: "A-mant", city: "Lisbon" },
        {
          name: "Manteigaria",
          lat: 41.1496,
          lng: -8.611,
          appleId: "A-mant-porto",
          city: "Porto",
        },
      ],
    });
    await owner.t.mutation(api.placeVisits.setVisited, {
      itemId,
      name: "Manteigaria",
      visited: true,
      spot: { ...near(2), appleId: "A-mant" },
    });
    const porto = await portoBranch(base, listId, owner.userId);
    for (const visited of [true, false]) {
      await owner.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
        placeId: porto,
        visited,
        stamp: true,
      });
    }
    const [row] = await visitRows(base, owner.userId);
    expect(row?.spots?.map((spot) => spot.appleId)).toEqual(["A-mant"]);
  });

  it("checks a list adder only for the stamp place their list added", async () => {
    const { base, owner, bo, place } = await friendPlace();
    await bo.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: place._id,
      visited: true,
      stamp: true,
    });
    await base.run((ctx) => setTestConsent(ctx, owner.userId, "declined"));
    const [row] = await visitRows(base, bo.userId);
    if (row === undefined) throw new Error("stamp missing");
    const own = { lat: 41.1496, lng: -8.611 };
    await base.run((ctx) =>
      ctx.db.patch(row._id, {
        stampPlaces: [...(row.stampPlaces ?? []), { ...own, city: "Porto" }],
      }),
    );
    const claim = (point: { lat: number; lng: number }) =>
      base.mutation(internal.placeVisits.claimCountryLookup, {
        visitId: row._id,
        ...point,
      });
    expect(await claim(own)).not.toBeNull();
    expect(await claim({ lat: place.lat, lng: place.lng })).toBeNull();
  });

  it("keeps a spot the member marks from their own save after the list stamped it", async () => {
    const { base, owner, listId } = await friendPlace();
    const list = await owner.t.query(api.sharedLists.getSharedList, {
      listId,
    });
    const place = list?.places.find((p) => p.name === "Manteigaria");
    if (place?.itemId === undefined) throw new Error("own save missing");
    await owner.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: place._id,
      visited: true,
      stamp: true,
    });
    await owner.t.mutation(api.placeVisits.setVisited, {
      itemId: place.itemId,
      name: "Manteigaria",
      visited: true,
      spot: { lat: place.lat, lng: place.lng, appleId: "A-mant" },
    });
    await owner.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: place._id,
      visited: false,
    });
    const [row] = await visitRows(base, owner.userId);
    expect(row?.spots?.map((spot) => spot.appleId)).toEqual(["A-mant"]);
    expect(row?.stampPlaces?.[0]?.listPlaceId).toBeUndefined();
  });

  it("keeps a spot the member marks as visited before after the list stamped it", async () => {
    const { base, owner, listId } = await friendPlace();
    const list = await owner.t.query(api.sharedLists.getSharedList, {
      listId,
    });
    const place = list?.places.find((p) => p.name === "Manteigaria");
    if (place?.itemId === undefined) throw new Error("own save missing");
    await owner.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: place._id,
      visited: true,
      stamp: true,
    });
    await owner.t.mutation(api.placeVisits.markVisitedBefore, {
      places: [
        {
          itemId: place.itemId,
          name: "Manteigaria",
          spot: { lat: place.lat, lng: place.lng, appleId: "A-mant" },
        },
      ],
    });
    await owner.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: place._id,
      visited: false,
    });
    const [row] = await visitRows(base, owner.userId);
    expect(row?.spots?.map((spot) => spot.appleId)).toEqual(["A-mant"]);
    expect(row?.stampPlaces?.[0]?.listPlaceId).toBeUndefined();
  });

  it("looks up the country once the member claims a list stamp from their own save", async () => {
    const { base, owner, bo, listId, place } = await friendPlace();
    if (place.itemId !== undefined)
      throw new Error("expected a friend's place");
    const porto = await portoBranch(base, listId, bo.userId);
    await base.run((ctx) => setTestConsent(ctx, bo.userId, "declined"));
    await owner.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: porto,
      visited: true,
      stamp: true,
    });
    const portoLookups = async () =>
      (
        await base.run((ctx) =>
          ctx.db.system.query("_scheduled_functions").collect(),
        )
      ).filter(
        (job) =>
          job.name.includes("locateCountry") &&
          (job.args[0] as { lat: number }).lat === 41.1496,
      );
    expect(await portoLookups()).toEqual([]);
    const ownList = await owner.t.query(api.sharedLists.getSharedList, {
      listId,
    });
    const own = ownList?.places.find((p) => p._id === place._id);
    if (own?.itemId === undefined) throw new Error("own save missing");
    await owner.t.mutation(api.placeVisits.setVisited, {
      itemId: own.itemId,
      name: "Manteigaria",
      visited: true,
      spot: { lat: 41.1496, lng: -8.611, appleId: "A-mant-porto" },
    });
    expect(await portoLookups()).toHaveLength(1);
  });

  it("keeps a stamp two lists gave until both are undone", async () => {
    const { base, owner, bo, listId, place } = await friendPlace();
    const second = await owner.t.mutation(api.sharedLists.createSharedList, {
      name: "Pastries",
      cities: ["Lisbon"],
    });
    await bo.t.mutation(api.sharedLists.joinSharedList, {
      token: second.inviteToken,
    });
    const other = (
      await bo.t.query(api.sharedLists.getSharedList, {
        listId: second.listId,
      })
    )?.places.find((p) => p.name === "Manteigaria");
    if (other === undefined || second.listId === listId) {
      throw new Error("second list place missing");
    }
    const went = (placeId: typeof place._id, visited: boolean) =>
      bo.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
        placeId,
        visited,
        stamp: true,
      });
    await went(place._id, true);
    await went(other._id, true);
    await went(place._id, false);
    const [kept] = await visitRows(base, bo.userId);
    expect(kept?.spots).toHaveLength(1);
    expect(kept?.stampPlaces?.[0]?.listPlaceId).toBe(other._id);
    await went(other._id, false);
    expect(await visitRows(base, bo.userId)).toEqual([]);
  });

  it("drops claims from deleted list places before adding a new one", async () => {
    const { base, owner, bo, listId, place } = await friendPlace();
    const second = await owner.t.mutation(api.sharedLists.createSharedList, {
      name: "Pastries",
      cities: ["Lisbon"],
    });
    await bo.t.mutation(api.sharedLists.joinSharedList, {
      token: second.inviteToken,
    });
    const other = (
      await bo.t.query(api.sharedLists.getSharedList, {
        listId: second.listId,
      })
    )?.places.find((p) => p.name === "Manteigaria");
    if (other === undefined) throw new Error("second list place missing");
    await bo.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: place._id,
      visited: true,
      stamp: true,
    });
    const gone = await base.run(async (ctx) => {
      const ids = [];
      for (let i = 0; i < 25; i++) {
        const id = await ctx.db.insert("sharedListPlaces", {
          listId,
          addedBy: owner.userId,
          name: "Manteigaria",
          lat: place.lat,
          lng: place.lng,
          city: "Lisbon",
          addedAt: Date.now(),
        });
        await ctx.db.delete(id);
        ids.push(id);
      }
      return ids;
    });
    const [row] = await visitRows(base, bo.userId);
    if (row?.stampPlaces?.[0] === undefined) throw new Error("stamp missing");
    await base.run((ctx) =>
      ctx.db.patch(row._id, {
        stampPlaces: [{ ...row.stampPlaces![0]!, alsoListPlaceIds: gone }],
      }),
    );
    await bo.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: other._id,
      visited: true,
      stamp: true,
    });
    const [after] = await visitRows(base, bo.userId);
    expect(after?.stampPlaces?.[0]?.alsoListPlaceIds).toEqual([other._id]);
  });
});
