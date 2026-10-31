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
  it("pins a kept place from a later lookup without touching the owner's pins", async () => {
    const { base, t, itemId, data } = await setup();
    const chosen = { name: "Chosen", city: "Lisbon", lat: 38.71, lng: -9.14 };
    await t.mutation(api.placeCorrections.savePlaces, {
      itemId,
      version: data.version,
      places: [chosen, { name: "Bakery", city: "Lisbon" }],
    });
    await base.mutation(internal.placePins.storePins, {
      itemId,
      found: [
        { name: "Bakery", city: "Lisbon", lat: 38.72, lng: -9.15 },
        { name: "Chosen", city: "Lisbon", lat: 38.8, lng: -9.2 },
        original,
      ],
    });
    const item = await base.run((ctx) => ctx.db.get(itemId));
    expect(item?.placePins).toEqual([
      chosen,
      { name: "Bakery", city: "Lisbon", lat: 38.72, lng: -9.15 },
    ]);
    expect(item?.places).toEqual(["Chosen", "Bakery"]);
    expect(item?.searchText).toContain("bakery");
  });
  it("keeps an owner's far-away pin when a lookup lands beside others", async () => {
    const { base, t, itemId, data } = await setup();
    const far = { name: "Far", city: "Lisbon", lat: 41.1, lng: -8.6 };
    const near = [
      { name: "One", city: "Lisbon", lat: 38.71, lng: -9.14 },
      { name: "Two", city: "Lisbon", lat: 38.72, lng: -9.15 },
      { name: "Three", city: "Lisbon", lat: 38.73, lng: -9.16 },
    ];
    await t.mutation(api.placeCorrections.savePlaces, {
      itemId,
      version: data.version,
      places: [far, near[0], near[1], { name: "Three", city: "Lisbon" }],
    });
    await base.mutation(internal.placePins.storePins, {
      itemId,
      found: [near[2]],
    });
    const item = await base.run((ctx) => ctx.db.get(itemId));
    expect(item?.placePins).toEqual([far, near[0], near[1], near[2]]);
  });
  it("drops a lookup's stray match for a kept place", async () => {
    const { base, t, itemId, data } = await setup();
    const near = [
      { name: "One", city: "Lisbon", lat: 38.71, lng: -9.14 },
      { name: "Two", city: "Lisbon", lat: 38.72, lng: -9.15 },
      { name: "Three", city: "Lisbon", lat: 38.73, lng: -9.16 },
    ];
    await t.mutation(api.placeCorrections.savePlaces, {
      itemId,
      version: data.version,
      places: [...near, { name: "Namesake", city: "Lisbon" }],
    });
    await base.mutation(internal.placePins.storePins, {
      itemId,
      found: [{ name: "Namesake", city: "Lisbon", lat: 41.1, lng: -8.6 }],
    });
    const item = await base.run((ctx) => ctx.db.get(itemId));
    expect(item?.placePins).toEqual(near);
  });
  it("looks up only a kept unpinned place, with its branch, right after saving", async () => {
    const { base, t, userId, itemId, data } = await setup();
    await base.run(async (ctx) => {
      await ctx.db.patch(itemId, {
        places: [original.name, "Bakery"],
        placeLocations: [
          { name: "Bakery", location: "Bairro Alto" },
          { name: original.name, location: "Chiado" },
        ],
      });
      const spaceId = await ctx.db.insert("spaces", {
        userId,
        name: "Lisbon",
      });
      await ctx.db.insert("spaceItems", {
        userId,
        spaceId,
        itemId,
        status: "saved",
        intents: [{ kind: "open_maps", label: "Removed", value: "Removed" }],
      });
    });
    const version = (await t.query(api.placeCorrections.getPlaces, { itemId }))
      ?.version;
    if (!version) throw new Error(`Missing version after ${data.version}`);
    const chosen = { name: "Chosen", city: "Lisbon", lat: 38.71, lng: -9.14 };
    await t.mutation(api.placeCorrections.savePlaces, {
      itemId,
      version,
      places: [chosen, { name: "Bakery", city: "Lisbon" }],
    });
    const jobs = await base.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(jobs.map((job) => job.name)).toContain("placePins:locateItem");
    for (const refresh of [undefined, true]) {
      await expect(
        base.query(internal.placePins.toLocate, { itemId, refresh }),
      ).resolves.toMatchObject({
        names: ["Bakery"],
        locations: [{ name: "Bakery", location: "Bairro Alto" }],
      });
    }
  });
  it("schedules no lookup when every chosen place has a pin", async () => {
    const { base, t, itemId, data } = await setup();
    await t.mutation(api.placeCorrections.savePlaces, {
      itemId,
      version: data.version,
      places: [{ name: "Chosen", city: "Lisbon", lat: 38.71, lng: -9.14 }],
    });
    const jobs = await base.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(jobs.map((job) => job.name)).not.toContain("placePins:locateItem");
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
