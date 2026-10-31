// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import type { FunctionReference } from "convex/server";
import { describe, expect, expectTypeOf, it } from "vitest";

import { newConvexTest, signedInUser } from "./test.setup";
import { api } from "./_generated/api";
import { toPlanSource } from "./tripData";
import type { Id } from "./_generated/dataModel";

async function setup(options: { pro?: boolean } = {}) {
  const backend = newConvexTest();
  const { t, userId } = await signedInUser(backend, {
    pro: options.pro ?? true,
  });
  const itemId = await t.run(async (ctx) =>
    ctx.db.insert("items", {
      userId,
      type: "link",
      status: "ready",
      title: "Tigre",
      tags: [],
      searchText: "Tigre",
    }),
  );
  const visits = () =>
    t.run(async (ctx) =>
      ctx.db
        .query("placeVisits")
        .withIndex("by_user_and_visited", (q) => q.eq("userId", userId))
        .collect(),
    );
  return { backend, t, userId, itemId, visits };
}

describe("place removal", () => {
  async function places() {
    const fixture = await setup();
    const { t, itemId, userId } = fixture;
    const pin = {
      name: "Tigre",
      lat: 38.7,
      lng: -9.1,
      city: "Lisbon",
      appleId: "tigre",
    };
    const copyId = await t.run(async (ctx) => {
      await ctx.db.patch(itemId, {
        cities: ["Lisbon"],
        places: ["Tigre, Lisbon", "Other"],
        placePins: [
          pin,
          { ...pin, name: "Other", appleId: "other", lat: 38.8 },
        ],
        intents: [
          { kind: "open_maps", label: "Tigre", value: "Tigre, Lisbon" },
        ],
      });
      return ctx.db.insert("items", {
        userId,
        type: "link",
        status: "ready",
        tags: [],
        cities: ["Lisbon"],
        places: ["Tigre"],
        placePins: [pin],
        searchText: "Tigre",
      });
    });
    return { ...fixture, pin, copyId };
  }

  it("removes duplicate venues from city, map and future plans, keeping saves and other places; Undo restores them", async () => {
    const { t, itemId, copyId } = await places();
    const itemIds = await t.mutation(api.placeVisits.removePlace, {
      itemId,
      name: "Tigre",
      operationId: "remove-1",
      lat: 38.7,
      lng: -9.1,
    });
    expect(new Set(itemIds)).toEqual(new Set([itemId, copyId]));
    expect(
      (await t.query(api.items.listCityItems, { city: "Lisbon" }))
        .flatMap((item) => item.placePins ?? [])
        .map((pin) => pin.name),
    ).toEqual(["Other"]);
    expect(
      (await t.query(api.mapPlaces.listMapPlaces, {})).map((pin) => pin.name),
    ).toEqual(["Other"]);
    const item = await t.run((ctx) => ctx.db.get(itemId));
    expect(item?.places).toEqual(["Tigre, Lisbon", "Other"]);
    expect(item && toPlanSource(item).places).toEqual(["Other", "Other"]);
    expect(await t.query(api.items.getItem, { id: itemId })).not.toBeNull();
    await t.mutation(api.placeVisits.undoRemovePlace, {
      itemIds,
      operationId: "remove-1",
    });
    expect(
      (await t.query(api.mapPlaces.listMapPlaces, {}))
        .map((pin) => pin.name)
        .sort(),
    ).toEqual(["Other", "Tigre"]);
  });

  it("survives fresh extraction and Undo keeps those fresh results", async () => {
    const { t, itemId, pin } = await places();
    const itemIds = await t.mutation(api.placeVisits.removePlace, {
      itemId,
      name: "Tigre",
      operationId: "remove-1",
      lat: 38.7,
      lng: -9.1,
    });
    await t.run((ctx) =>
      ctx.db.patch(itemId, {
        placePins: [{ ...pin, lat: 38.71 }],
        places: ["Tigre"],
      }),
    );
    expect(await t.query(api.mapPlaces.listMapPlaces, {})).toEqual([]);
    await t.mutation(api.placeVisits.undoRemovePlace, {
      itemIds,
      operationId: "remove-1",
    });
    expect(
      (await t.query(api.items.listCityItems, { city: "Lisbon" })).find(
        (item) => item._id === itemId,
      )?.placePins?.[0].lat,
    ).toBe(38.71);
  });

  it("keeps other branches and accounts and refuses unowned or nonexistent places", async () => {
    const { backend, t, userId, itemId, pin } = await places();
    const branchId = await t.run((ctx) =>
      ctx.db.insert("items", {
        userId,
        type: "link",
        status: "ready",
        tags: [],
        cities: ["Lisbon"],
        places: ["Tigre"],
        placePins: [{ ...pin, appleId: "other-branch" }],
        searchText: "Tigre",
      }),
    );
    const other = await signedInUser(backend, { pro: true });
    await expect(
      other.t.mutation(api.placeVisits.removePlace, {
        itemId,
        name: "Tigre",
        operationId: "x",
        lat: 38.7,
        lng: -9.1,
      }),
    ).rejects.toThrow("Item not found");
    await expect(
      t.mutation(api.placeVisits.removePlace, {
        itemId,
        name: "Missing",
        operationId: "x",
        lat: 38.7,
        lng: -9.1,
      }),
    ).rejects.toThrow("Place not found");
    await t.mutation(api.placeVisits.removePlace, {
      itemId,
      name: "Tigre",
      operationId: "x",
      lat: 38.7,
      lng: -9.1,
    });
    expect(
      (await t.query(api.mapPlaces.listMapPlaces, {})).some(
        (pin) => pin.itemId === branchId,
      ),
    ).toBe(true);
    await other.t.mutation(api.placeVisits.undoRemovePlace, {
      itemIds: [itemId],
      operationId: "x",
    });
    expect(
      (await t.run((ctx) => ctx.db.get(itemId)))?.removedPlaces,
    ).toHaveLength(1);
  });

  it("Undo affects only its own operation, tolerates deleted saves, and is repeatable", async () => {
    const { t, itemId, copyId } = await places();
    await t.mutation(api.placeVisits.removePlace, {
      itemId,
      name: "Tigre",
      operationId: "first",
      lat: 38.7,
      lng: -9.1,
    });
    await t.mutation(api.placeVisits.removePlace, {
      itemId,
      name: "Other",
      operationId: "second",
      lat: 38.8,
      lng: -9.1,
    });
    await t.run((ctx) => ctx.db.delete(copyId));
    for (let i = 0; i < 2; i++)
      await t.mutation(api.placeVisits.undoRemovePlace, {
        itemIds: [itemId, copyId],
        operationId: "first",
      });
    expect(
      (await t.query(api.mapPlaces.listMapPlaces, {})).map((pin) => pin.name),
    ).toEqual(["Tigre"]);
  });

  it("requires Pro", async () => {
    const { t, itemId } = await setup({ pro: false });
    await expect(
      t.mutation(api.placeVisits.removePlace, {
        itemId,
        name: "Tigre",
        operationId: "x",
        lat: 38.7,
        lng: -9.1,
      }),
    ).rejects.toThrow();
  });

  it("keeps a different branch in the same save, and hides a renamed lookup of the removed venue", async () => {
    const { t, itemId, pin } = await places();
    await t.run((ctx) =>
      ctx.db.patch(itemId, {
        placePins: [pin, { ...pin, appleId: "other-branch" }],
      }),
    );
    await t.mutation(api.placeVisits.removePlace, {
      itemId,
      name: "Tigre",
      operationId: "first",
      lat: 38.7,
      lng: -9.1,
    });
    expect(
      (await t.query(api.items.listCityItems, { city: "Lisbon" })).find(
        (item) => item._id === itemId,
      )?.placePins,
    ).toEqual([{ ...pin, appleId: "other-branch" }]);
    await t.run((ctx) =>
      ctx.db.patch(itemId, {
        placePins: [{ ...pin, name: "Tigre Restaurant" }],
        places: ["Tigre Restaurant"],
      }),
    );
    expect(
      (await t.query(api.items.listCityItems, { city: "Lisbon" })).find(
        (item) => item._id === itemId,
      )?.placePins,
    ).toEqual([]);
    const item = await t.run((ctx) => ctx.db.get(itemId));
    expect(item && toPlanSource(item).places).toEqual([]);
  });
});

describe("setVisited", () => {
  it("keeps the api reference installed apps compiled against", () => {
    expectTypeOf(api.placeVisits.setVisited).toEqualTypeOf<
      FunctionReference<
        "mutation",
        "public",
        { itemId: Id<"items">; name: string; visited: boolean },
        null
      >
    >();
  });

  it("marks a place once and takes the mark back", async () => {
    const { t, itemId, visits } = await setup();

    await t.mutation(api.placeVisits.setVisited, {
      itemId,
      name: "Caffé  Dante",
      visited: true,
    });
    await t.mutation(api.placeVisits.setVisited, {
      itemId,
      name: "caffe dante",
      visited: true,
    });
    expect(await visits()).toMatchObject([
      { key: "caffedante", name: "caffe dante", itemId },
    ]);

    await t.mutation(api.placeVisits.setVisited, {
      itemId,
      name: "Caffé Dante",
      visited: false,
    });
    expect(await visits()).toHaveLength(0);
  });

  it("requires Pro", async () => {
    const { t, itemId, visits } = await setup({ pro: false });
    await expect(
      t.mutation(api.placeVisits.setVisited, {
        itemId,
        name: "Tigre",
        visited: true,
      }),
    ).rejects.toThrow();
    expect(await visits()).toHaveLength(0);
  });

  it("refuses another user's save and a name with no letters", async () => {
    const { backend, t, itemId } = await setup();
    const other = await signedInUser(backend, { pro: true });

    await expect(
      other.t.mutation(api.placeVisits.setVisited, {
        itemId,
        name: "Tigre",
        visited: true,
      }),
    ).rejects.toThrow("Item not found");
    await expect(
      t.mutation(api.placeVisits.setVisited, {
        itemId,
        name: " !! ",
        visited: true,
      }),
    ).rejects.toThrow("Place name is empty");
  });
});
