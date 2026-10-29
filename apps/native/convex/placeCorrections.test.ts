// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import { newConvexTest, signedInUser } from "./test.setup";
import { completionPatch } from "./model/settlement";

const original = { name: "Old branch", city: "Lisbon", lat: 38.7, lng: -9.1 };
async function setup(pro = true) {
  const base = newConvexTest();
  const user = await signedInUser(base, { pro });
  const itemId = await base.run((ctx) =>
    ctx.db.insert("items", {
      userId: user.userId,
      type: "link",
      status: "ready",
      title: "Saved places",
      tags: [],
      cities: ["Lisbon"],
      places: [original.name],
      placePins: [original],
      searchText: "old branch lisbon",
    }),
  );
  const data = await user.t.query(api.placeCorrections.getPlaces, { itemId });
  if (!data) throw new Error("Missing save");
  return { base, ...user, itemId, data };
}

describe("place corrections", () => {
  it("replaces a branch, adds a place and updates city and search data", async () => {
    const { base, t, itemId, data } = await setup();
    const next = {
      name: "Correct branch",
      city: "Porto",
      lat: 41.1,
      lng: -8.6,
    };
    await t.mutation(api.placeCorrections.savePlaces, {
      itemId,
      version: data.version,
      places: [next, { name: "Cafe", city: "Porto" }],
    });
    const item = await base.run((ctx) => ctx.db.get(itemId));
    expect(item).toMatchObject({
      placesEdited: true,
      cities: ["Porto"],
      places: ["Correct branch", "Cafe"],
      placePins: [next],
    });
    expect(item?.searchText).toContain("correct branch");
    expect(item?.searchText).not.toContain("old branch");
    await expect(
      t.query(api.items.getItem, { id: itemId }),
    ).resolves.not.toBeNull();
  });
  it("keeps removals through a delayed pin lookup and reprocessing", async () => {
    const { base, t, itemId, data } = await setup();
    await t.mutation(api.placeCorrections.savePlaces, {
      itemId,
      version: data.version,
      places: [],
    });
    await base.mutation(internal.placePins.storePins, {
      itemId,
      found: [original],
    });
    const item = await base.run((ctx) => ctx.db.get(itemId));
    if (!item) throw new Error("Missing save");
    expect(item.placePins).toEqual([]);
    const patch = completionPatch(
      item,
      {
        reading: {},
        classification: {
          description: "Read again",
          tags: [],
          cities: ["Lisbon"],
          places: [original.name],
          intents: [{ kind: "open_maps", label: "Old", value: original.name }],
        },
      },
      true,
    );
    expect(patch).toMatchObject({ cities: [], places: [], intents: [] });
    expect(patch.placePins).toBeUndefined();
  });
  it("rejects stale edits, invalid pins and more than the supported place count", async () => {
    const { t, itemId, data } = await setup();
    await expect(
      t.mutation(api.placeCorrections.savePlaces, {
        itemId,
        version: data.version,
        places: [{ ...original, lat: 999 }],
      }),
    ).rejects.toThrow();
    await t.mutation(api.placeCorrections.savePlaces, {
      itemId,
      version: data.version,
      places: [],
    });
    await expect(
      t.mutation(api.placeCorrections.savePlaces, {
        itemId,
        version: data.version,
        places: [original],
      }),
    ).rejects.toThrow();
  });
  it("does not clear a city or freeze extraction when saving an unchanged empty editor", async () => {
    const { base, t, itemId } = await setup();
    await base.run((ctx) =>
      ctx.db.patch(itemId, { places: undefined, placePins: undefined }),
    );
    const data = await t.query(api.placeCorrections.getPlaces, { itemId });
    await t.mutation(api.placeCorrections.savePlaces, {
      itemId,
      version: data!.version,
      places: [],
    });
    const item = await base.run((ctx) => ctx.db.get(itemId));
    expect(item?.cities).toEqual(["Lisbon"]);
    expect(item?.placesEdited).toBeUndefined();
  });
  it("requires ownership and Pro for changes and search", async () => {
    const { base, t, itemId, data } = await setup(false);
    const other = await signedInUser(base, { pro: true });
    expect(
      await other.t.query(api.placeCorrections.getPlaces, { itemId }),
    ).toBeNull();
    for (const caller of [base, other.t, t]) {
      await expect(
        caller.mutation(api.placeCorrections.savePlaces, {
          itemId,
          version: data.version,
          places: [],
        }),
      ).rejects.toThrow();
      await expect(
        caller.mutation(internal.placeCorrections.claimSearch, { itemId }),
      ).rejects.toThrow();
    }
  });
});
