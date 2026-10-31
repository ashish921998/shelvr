// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { cityPins } from "../src/lib/city-pins";
import { api, internal } from "./_generated/api";
import { newConvexTest, signedInUser } from "./test.setup";
import { visibleSave } from "./model/placeRemovals";
import { toPlanSource } from "./tripData";
import { keepSuggestion } from "./model/tripSuggest";
import { keepDateSuggestion } from "./model/dateRank";

async function setup(pro = true) {
  const backend = newConvexTest();
  const { t, userId } = await signedInUser(backend, { pro });
  const pin = {
    name: "Tigre, Alfama",
    city: "Lisbon",
    lat: 38.7,
    lng: -9.1,
    appleId: "alfama",
  };
  const insert = (
    status: "ready" | "processing" = "ready",
    pins = [pin],
    places = [pin.name],
    cities = ["Lisbon"],
  ) =>
    t.run((ctx) =>
      ctx.db.insert("items", {
        userId,
        type: "link",
        status,
        tags: [],
        searchText: "Tigre",
        places,
        placePins: pins,
        cities,
      }),
    );
  const itemId = await insert();
  const remove = () =>
    t.mutation(api.placeRemovals.removePlace, {
      itemId,
      name: pin.name,
      lat: pin.lat,
      lng: pin.lng,
      appleId: pin.appleId,
    });
  const map = () => t.query(api.mapPlaces.listMapPlaces, {});
  const source = (id = itemId) =>
    t.run(async (ctx) => {
      const item = await ctx.db.get(id);
      if (!item) throw new Error("missing fixture");
      return toPlanSource(await visibleSave(ctx, item));
    });
  return { backend, t, userId, itemId, pin, insert, remove, map, source };
}

describe("place removals", () => {
  it("hides pinned, unpinned and processing copies without writing any save; Undo restores all", async () => {
    const { t, pin, insert, remove, map, source, itemId } = await setup();
    const unpinned = await insert("ready", [], [pin.name]);
    const processing = await insert("processing");
    const before = await t.run((ctx) => ctx.db.get(itemId));
    const removalId = await remove();
    expect(await map()).toEqual([]);
    expect((await source(unpinned)).places).toEqual([]);
    await t.run((ctx) => ctx.db.patch(unpinned, { placePins: [pin] }));
    expect(await map()).toEqual([]);
    await t.run((ctx) => ctx.db.patch(processing, { status: "ready" }));
    expect(await map()).toEqual([]);
    expect(await t.run((ctx) => ctx.db.get(itemId))).toEqual(before);
    expect(
      (await t.query(api.items.getItem, { id: itemId }))?.placePins,
    ).toEqual([]);
    await t.mutation(api.placeRemovals.undoRemovePlace, { removalId });
    expect(await map()).toHaveLength(1);
    expect((await source(unpinned)).places).toContain(pin.name);
  });

  it("keeps other branches, cities and accounts; removes only the selected label and Maps intent", async () => {
    const { backend, t, itemId, pin, remove, source, map } = await setup();
    const branch = {
      ...pin,
      name: "Tigre, Baixa",
      appleId: "baixa",
      lat: 38.71,
    };
    const porto = {
      ...pin,
      name: "Tigre, Porto",
      city: "Porto",
      appleId: "porto",
      lat: 41.15,
    };
    await t.run((ctx) =>
      ctx.db.patch(itemId, {
        cities: ["Lisbon", "Porto"],
        places: [
          "Tigre, Alfama, Lisbon",
          "Tigre, Baixa, Lisbon",
          "Tigre, Porto",
        ],
        placePins: [pin, branch, porto],
        intents: [
          { kind: "open_maps", label: "Tigre", value: "Tigre, Alfama, Lisbon" },
        ],
      }),
    );
    const other = await signedInUser(backend, { pro: true });
    await other.t.run((ctx) =>
      ctx.db.insert("items", {
        userId: other.userId,
        type: "link",
        status: "ready",
        tags: [],
        searchText: "Tigre",
        cities: ["Lisbon"],
        placePins: [pin],
      }),
    );
    await remove();
    expect((await map()).map((p) => p.name).sort()).toEqual(
      [branch.name, porto.name].sort(),
    );
    expect((await source()).places).not.toContain("Tigre, Alfama, Lisbon");
    expect((await source()).places).toContain("Tigre, Baixa, Lisbon");
    expect(await other.t.query(api.mapPlaces.listMapPlaces, {})).toHaveLength(
      1,
    );
  });

  it("keeps an unpinned other neighborhood while filtering the removed one", async () => {
    const { t, itemId, pin, remove, source } = await setup();
    await t.run((ctx) =>
      ctx.db.patch(itemId, { places: [pin.name, "Tigre, Baixa"] }),
    );
    await remove();
    expect((await source()).places).toEqual(["Tigre, Baixa"]);
  });

  it("keeps a bare name for a remaining pinned branch", async () => {
    const { t, itemId, pin, remove, source } = await setup();
    await t.run((ctx) =>
      ctx.db.patch(itemId, {
        places: ["Tigre"],
        placePins: [
          pin,
          { ...pin, name: "Tigre, Baixa", appleId: "baixa", lat: 38.71 },
        ],
      }),
    );
    await remove();
    expect((await source()).places).toContain("Tigre");
  });

  it("survives changed ids, relocated idless pins and renamed Apple results; Undo keeps fresh extraction", async () => {
    const { t, itemId, pin, remove, map, source } = await setup();
    const removalId = await remove();
    for (const refreshed of [
      { ...pin, appleId: "new" },
      { name: pin.name, city: pin.city, lat: 39, lng: -9.1 },
      { ...pin, name: "Renamed venue" },
    ]) {
      await t.run((ctx) =>
        ctx.db.patch(itemId, {
          placePins: [refreshed],
          places: [refreshed.name],
        }),
      );
      expect(await map()).toEqual([]);
      expect((await source()).places).toEqual([]);
    }
    await t.mutation(api.placeRemovals.undoRemovePlace, { removalId });
    expect((await map())[0].name).toBe("Renamed venue");
  });

  it("hides nearby generic-name aliases and preserves a different nearby named venue", async () => {
    const { t, itemId, pin, remove, map } = await setup();
    await remove();
    await t.run((ctx) =>
      ctx.db.patch(itemId, {
        placePins: [
          { ...pin, name: "Tigre Restaurant, Alfama", appleId: "new" },
          { ...pin, name: "Other", appleId: "other" },
        ],
      }),
    );
    expect((await map()).map((p) => p.name)).toEqual(["Other"]);
  });

  it("removes every copy of the merged map row, including a missing-id generic alias", async () => {
    const { t, userId, itemId, pin, insert, map } = await setup();
    const noId = { name: "Tigre", lat: pin.lat, lng: pin.lng, city: pin.city };
    await t.run((ctx) =>
      ctx.db.patch(itemId, { placePins: [noId], places: ["Tigre"] }),
    );
    await insert("ready", [{ ...pin, name: "Tigre" }], ["Tigre"]);
    await insert(
      "ready",
      [{ ...pin, name: "Tigre Restaurant" }],
      ["Tigre Restaurant"],
    );
    await t.run((ctx) =>
      ctx.db.insert("items", {
        userId,
        type: "link",
        status: "ready",
        tags: [],
        cities: ["Lisbon"],
        searchText: "Tigre",
        placePins: [{ ...noId, name: "Tigre Restaurant" }],
        places: ["Tigre Restaurant"],
      }),
    );
    const items = await t.query(api.items.listCityItems, { city: "Lisbon" });
    const merged = cityPins(items);
    expect(merged).toHaveLength(1);
    const selected = merged[0];
    await t.mutation(api.placeRemovals.removePlace, {
      itemId: selected.itemId as typeof itemId,
      name: selected.name,
      lat: selected.lat,
      lng: selected.lng,
      appleId: selected.appleId,
    });
    expect(await map()).toEqual([]);
  });

  it("rejects a removed saved-place addition but preserves existing stops and deliberate search additions", async () => {
    const { t, itemId, pin, remove } = await setup();
    const tripId = await t.mutation(
      internal.tripPlannerData.saveTripPlanInternal,
      {
        city: "Lisbon",
        dayCount: 1,
        pace: "balanced",
        interests: [],
        days: [
          [
            {
              source: "save",
              itemId,
              name: pin.name,
              lat: pin.lat,
              lng: pin.lng,
              appleId: pin.appleId,
            },
          ],
        ],
        unplanned: [],
      },
    );
    await remove();
    expect(
      (await t.query(api.tripPlannerData.getTripPlan, { tripId }))?.days[0][0]
        .name,
    ).toBe(pin.name);
    await expect(
      t.mutation(api.tripPlannerData.addTripStop, {
        tripId,
        day: 1,
        place: { kind: "save", itemId, name: pin.name },
      }),
    ).rejects.toThrow("Place not found");
    await expect(
      t.mutation(api.tripPlannerData.addTripStop, {
        tripId,
        day: 1,
        place: {
          kind: "search",
          place: {
            name: pin.name,
            lat: pin.lat,
            lng: pin.lng,
            appleId: pin.appleId,
          },
        },
      }),
    ).resolves.toBeDefined();
  });

  it("a deliberate new save is visible, while the old save stays removed", async () => {
    const { t, insert, itemId, remove, map } = await setup();
    const removalId = await remove();
    const newId = await insert();
    expect((await map()).some((pin) => pin.itemId === newId)).toBe(true);
    expect(
      (
        await t.run(async (ctx) => {
          const item = await ctx.db.get(itemId);
          return item ? toPlanSource(await visibleSave(ctx, item)) : null;
        })
      )?.places,
    ).toEqual([]);
    expect(await t.run((ctx) => ctx.db.get(removalId))).not.toBeNull();
  });

  it("Undo is operation-specific, idempotent, and refuses another account's removal", async () => {
    const { backend, t, itemId, pin, remove, map } = await setup();
    await t.run((ctx) =>
      ctx.db.patch(itemId, {
        placePins: [pin, { ...pin, name: "Other", appleId: "other" }],
        places: [pin.name, "Other"],
      }),
    );
    const first = await remove();
    const second = await t.mutation(api.placeRemovals.removePlace, {
      itemId,
      name: "Other",
      lat: pin.lat,
      lng: pin.lng,
      appleId: "other",
    });
    const other = await signedInUser(backend, { pro: true });
    await other.t.mutation(api.placeRemovals.undoRemovePlace, {
      removalId: first,
    });
    expect(await map()).toEqual([]);
    for (let i = 0; i < 2; i++)
      await t.mutation(api.placeRemovals.undoRemovePlace, { removalId: first });
    expect((await map()).map((p) => p.name)).toEqual([pin.name]);
    expect(await t.run((ctx) => ctx.db.get(second))).not.toBeNull();
  });

  it("removes an old save even when more than a thousand newer unrelated saves exist", async () => {
    const { t, userId, remove, source } = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 1002; i++)
        await ctx.db.insert("items", {
          userId,
          type: "link",
          status: "ready",
          tags: [],
          cities: ["Other city"],
          searchText: "Other",
        });
    });
    await remove();
    expect((await source()).places).toEqual([]);
  });

  it("requires Pro with an otherwise valid pin, and rejects foreign ownership", async () => {
    const { backend, t, itemId, pin, remove } = await setup(false);
    await expect(remove()).rejects.toThrow(/pro_required/);
    const other = await signedInUser(backend, { pro: true });
    await expect(
      other.t.mutation(api.placeRemovals.removePlace, {
        itemId,
        name: pin.name,
        lat: pin.lat,
        lng: pin.lng,
      }),
    ).rejects.toThrow("Item not found");
    expect(
      await t.run((ctx) => ctx.db.query("placeRemovals").collect()),
    ).toEqual([]);
  });

  it("does not swap a removed venue back in from a legacy trip wishlist", async () => {
    const { t, userId, itemId, pin, remove } = await setup();
    const tripId = await t.run(async (ctx) => {
      const spaceId = await ctx.db.insert("spaces", { userId, name: "Trip" });
      await ctx.db.insert("spaceItems", {
        userId,
        itemId,
        spaceId,
        status: "saved",
      });
      return await ctx.db.insert("trips", {
        userId,
        spaceId,
        city: "Lisbon",
        pace: "balanced",
        days: [
          {
            areas: [],
            gaps: [],
            stops: [{ itemId, name: "Other", why: "Saved", slot: "morning" }],
          },
        ],
        wishlist: [
          {
            itemId,
            name: pin.name,
            why: "Saved",
            slot: "morning",
            lat: pin.lat,
            lng: pin.lng,
          },
        ],
      });
    });
    await remove();
    await expect(
      t.mutation(api.tripData.swapTripStop, { tripId, itemId, name: "Other" }),
    ).rejects.toThrow(/nothing_to_swap|No other saved place/);
  });

  it("filters joined Maps intents and both planning claim paths", async () => {
    const { t, userId, itemId, pin, remove } = await setup();
    const spaceId = await t.run(async (ctx) => {
      const spaceId = await ctx.db.insert("spaces", {
        userId,
        name: "Trip",
        dynamic: false,
      });
      await ctx.db.insert("spaceItems", {
        userId,
        spaceId,
        itemId,
        status: "saved",
        intents: [{ kind: "open_maps", label: "Tigre", value: pin.name }],
      });
      return spaceId;
    });
    await remove();
    const legacy = await t.mutation(internal.tripData.claimTripInternal, {
      spaceId,
      city: "Lisbon",
    });
    expect(legacy.pins).toEqual([]);
    expect(legacy.sources[0].places).toEqual([]);
    const trip = await t.mutation(
      internal.tripPlannerData.claimTripPlanInternal,
      { city: "Lisbon", days: 2, interests: [] },
    );
    const date = await t.mutation(internal.datePlanData.claimDatePlanInternal, {
      city: "Lisbon",
    });
    expect(trip.pins).toEqual([]);
    expect(date.pins).toEqual([]);
    const found = {
      name: "Tigre",
      area: "Alfama",
      lat: pin.lat,
      lng: pin.lng,
      appleId: "replacement",
      category: "Restaurant",
      interest: "food" as const,
    };
    expect(
      keepSuggestion(found, {
        centre: pin,
        been: new Set(),
        taken: [],
        removed: trip.removed,
      }),
    ).toBe(false);
    expect(
      keepDateSuggestion(found, {
        kind: "classic",
        slot: "first",
        anchor: { ...pin, slot: "second", source: "suggested" },
        been: new Set(),
        taken: [],
        chains: new Set(),
        removed: date.removed,
      }),
    ).toBe(false);
  });
});
