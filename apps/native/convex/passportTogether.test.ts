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
  return { owner, bo, listId, place };
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
