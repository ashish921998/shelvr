// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import { joiner, listWithOwner } from "./sharedLists.test.helpers";

async function sharedPlace() {
  const { base, owner, token, listId } = await listWithOwner();
  const bo = await joiner(base, token);
  const list = await bo.t.query(api.sharedLists.getSharedList, { listId });
  const place = list?.places.find((p) => p.name === "Manteigaria");
  if (place === undefined) throw new Error("seed place missing");
  return { base, owner, bo, listId, place };
}

describe("passportTogether", () => {
  it("counts nothing when only you went", async () => {
    const { bo, place } = await sharedPlace();
    await bo.t.mutation(api.sharedLists.setSharedListPlaceWent, {
      placeId: place._id,
      went: true,
    });
    expect(await bo.t.query(api.placeVisits.passportTogether, {})).toBe(0);
  });

  it("counts a list stamp another member also went to, for both of you", async () => {
    const { owner, bo, place } = await sharedPlace();
    for (const person of [owner, bo]) {
      await person.t.mutation(api.sharedLists.setSharedListPlaceWent, {
        placeId: place._id,
        went: true,
      });
    }
    expect(await bo.t.query(api.placeVisits.passportTogether, {})).toBe(1);
    expect(await owner.t.query(api.placeVisits.passportTogether, {})).toBe(1);
  });

  it("counts each spot of a same-name place on its own", async () => {
    const { base, owner, bo, place } = await sharedPlace();
    const branchId = await base.run(async (ctx) => {
      const doc = await ctx.db.get(place._id);
      if (doc === null) throw new Error("seed place missing");
      const {
        _id: _ignored,
        _creationTime: _created,
        appleId: _appleId,
        ...fields
      } = doc;
      return await ctx.db.insert("sharedListPlaces", {
        ...fields,
        lat: doc.lat + 0.05,
        went: [],
      });
    });
    for (const placeId of [place._id, branchId]) {
      for (const person of [owner, bo]) {
        await person.t.mutation(api.sharedLists.setSharedListPlaceWent, {
          placeId,
          went: true,
        });
      }
    }
    expect(await bo.t.query(api.placeVisits.passportTogether, {})).toBe(2);
  });

  it("stops counting once the other member leaves the list", async () => {
    const { owner, bo, listId, place } = await sharedPlace();
    for (const person of [owner, bo]) {
      await person.t.mutation(api.sharedLists.setSharedListPlaceWent, {
        placeId: place._id,
        went: true,
      });
    }
    await owner.t.mutation(api.sharedLists.leaveSharedList, { listId });
    expect(await bo.t.query(api.placeVisits.passportTogether, {})).toBe(0);
  });
});
