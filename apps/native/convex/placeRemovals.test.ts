// @vitest-environment edge-runtime
import { describe, expect, it, vi } from "vitest";
import { enrichItems } from "./items";
import { cityPins } from "../src/lib/city-pins";
import { api, internal } from "./_generated/api";
import { newConvexTest, signedInUser } from "./test.setup";
import { visibleSave, type Removal } from "./model/placeRemovals";
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
    pins: Omit<typeof pin, "appleId">[] = [pin],
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

  it("removes a merged row whose newest copy borrowed its Apple id", async () => {
    const { t, pin, insert, map } = await setup();
    const { appleId: _appleId, ...noId } = pin;
    const newest = await insert("ready", [noId]);
    const [selected] = cityPins(
      await t.query(api.items.listCityItems, { city: "Lisbon" }),
    );
    expect(selected.itemId).toBe(newest);
    expect(selected.appleId).toBe(pin.appleId);
    await t.mutation(api.placeRemovals.removePlace, {
      itemId: newest,
      name: selected.name,
      lat: selected.lat,
      lng: selected.lng,
      appleId: selected.appleId,
    });
    expect(await map()).toEqual([]);
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

  it("survives a renamed Apple result; Undo keeps fresh extraction", async () => {
    const { t, itemId, pin, remove, map, source } = await setup();
    const removalId = await remove();
    const refreshed = { ...pin, name: "Renamed venue" };
    await t.run((ctx) =>
      ctx.db.patch(itemId, {
        placePins: [refreshed],
        places: [refreshed.name],
      }),
    );
    expect(await map()).toEqual([]);
    expect((await source()).places).toEqual([]);
    await t.mutation(api.placeRemovals.undoRemovePlace, { removalId });
    expect((await map())[0].name).toBe("Renamed venue");
  });

  it("removes every copy of the merged map row", async () => {
    const { t, itemId, pin, insert, map } = await setup();
    const noId = { name: "Tigre", lat: pin.lat, lng: pin.lng, city: pin.city };
    await t.run((ctx) =>
      ctx.db.patch(itemId, { placePins: [noId], places: ["Tigre"] }),
    );
    await insert(
      "ready",
      [{ ...pin, name: "Tigre Restaurant" }],
      ["Tigre Restaurant"],
    );
    await insert("ready", [{ ...pin, name: "Tigre" }], ["Tigre"]);
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

  it("refuses a pin the save does not have", async () => {
    const { t, itemId, pin } = await setup();
    const { name, lat, lng, appleId } = pin;
    for (const wrong of [
      { name: "Sol" },
      { lat: lat + 1 },
      { lng: lng + 1 },
      { appleId: "another" },
    ]) {
      await expect(
        t.mutation(api.placeRemovals.removePlace, {
          itemId,
          name,
          lat,
          lng,
          appleId,
          ...wrong,
        }),
      ).rejects.toThrow("Place not found");
    }
    expect(
      await t.run((ctx) => ctx.db.query("placeRemovals").collect()),
    ).toEqual([]);
  });

  it("stops removing at the rate limit and stores nothing past it", async () => {
    const { t, itemId, pin } = await setup();
    const pins = Array.from({ length: 21 }, (_, i) => ({
      ...pin,
      name: `Tigre ${i}`,
      appleId: `tigre-${i}`,
      lat: pin.lat + i,
    }));
    await t.run((ctx) => ctx.db.patch(itemId, { placePins: pins }));
    const removeAt = (i: number) =>
      t.mutation(api.placeRemovals.removePlace, {
        itemId,
        name: pins[i].name,
        lat: pins[i].lat,
        lng: pins[i].lng,
      });
    for (let i = 0; i < 20; i++) await removeAt(i);
    await expect(removeAt(20)).rejects.toThrow(/RateLimited/);
    expect(
      await t.run((ctx) => ctx.db.query("placeRemovals").collect()),
    ).toHaveLength(20);
  });

  it("hides a removed place in search, keeps the save findable, and Undo restores it", async () => {
    const { t, itemId, pin, remove } = await setup();
    const places = [pin.name, "Sol, Baixa"];
    await t.run((ctx) => ctx.db.patch(itemId, { places }));
    const search = async () =>
      (await t.query(api.items.searchItems, { query: "Tigre" }))[0];
    expect((await search())?.places).toEqual(places);
    const removalId = await remove();
    const found = await search();
    expect(found?._id).toBe(itemId);
    expect(found?.places).toEqual(["Sol, Baixa"]);
    expect(found?.placePins).toEqual([]);
    await t.mutation(api.placeRemovals.undoRemovePlace, { removalId });
    expect((await search())?.places).toEqual(places);
  });

  it("matches an Apple venue across city labels in Map, city pages and date plans", async () => {
    const { t, pin, insert, remove, map } = await setup();
    await insert(
      "ready",
      [{ ...pin, city: "Lisboa" }],
      ["Tigre, Alfama, Lisboa"],
      ["Lisboa"],
    );
    await insert(
      "ready",
      [{ ...pin, city: "Belem" }],
      ["Tigre, Alfama, Belem"],
      ["Belem"],
    );
    await remove();
    expect(await map()).toEqual([]);
    expect(
      (await t.query(api.items.listCityItems, { city: "Lisboa" }))[0].placePins,
    ).toEqual([]);
    expect(
      (
        await t.mutation(internal.datePlanData.claimDatePlanInternal, {
          city: "Lisboa",
        })
      ).pins,
    ).toEqual([]);
  });

  it("keeps distant idless branches and explicit neighborhoods after a bare-name removal", async () => {
    const { t, itemId, pin, insert, map } = await setup();
    await t.run((ctx) =>
      ctx.db.patch(itemId, {
        places: ["Starbucks"],
        placePins: [
          { name: "Starbucks", lat: pin.lat, lng: pin.lng, city: pin.city },
        ],
      }),
    );
    const { userId } = await t.run(async (ctx) => {
      const item = await ctx.db.get(itemId);
      return { userId: item!.userId };
    });
    for (const lat of [38.74, 38.78])
      await t.run((ctx) =>
        ctx.db.insert("items", {
          userId,
          type: "link",
          status: "ready",
          tags: [],
          cities: ["Lisbon"],
          places: ["Starbucks"],
          placePins: [{ name: "Starbucks", lat, lng: pin.lng }],
          searchText: "Starbucks",
        }),
      );
    await t.mutation(api.placeRemovals.removePlace, {
      itemId,
      name: "Starbucks",
      lat: pin.lat,
      lng: pin.lng,
    });
    expect(await map()).toHaveLength(2);
    const tigreId = await insert(
      "ready",
      [{ ...pin, name: "Tigre" }],
      ["Tigre"],
    );
    const otherId = await insert("ready", [], ["Tigre, Baixa"]);
    await t.mutation(api.placeRemovals.removePlace, {
      itemId: tigreId,
      name: "Tigre",
      lat: pin.lat,
      lng: pin.lng,
      appleId: pin.appleId,
    });
    const other = await t.run(async (ctx) => {
      const row = await ctx.db.get(otherId);
      return row && toPlanSource(await visibleSave(ctx, row));
    });
    expect(other?.places).toEqual(["Tigre, Baixa"]);
  });

  it("allows an idless lookup in another part of town to reappear", async () => {
    const { t, itemId, pin, remove, map } = await setup();
    await remove();
    await t.run((ctx) =>
      ctx.db.patch(itemId, {
        placePins: [{ name: pin.name, city: pin.city, lat: 39, lng: pin.lng }],
      }),
    );
    expect(await map()).toHaveLength(1);
  });

  it("filters a renamed venue from raw membership intents in the no-city space path", async () => {
    const { t, userId, itemId, pin, remove } = await setup();
    const spaceId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("spaces", { userId, name: "Places" });
      await ctx.db.insert("spaceItems", {
        userId,
        spaceId: id,
        itemId,
        status: "saved",
        intents: [
          { kind: "open_maps", label: "Renamed", value: "Renamed venue" },
        ],
      });
      return id;
    });
    await remove();
    await t.run((ctx) =>
      ctx.db.patch(itemId, {
        placePins: [{ ...pin, name: "Renamed venue" }],
        places: ["Renamed venue"],
      }),
    );
    const plan = await t.mutation(internal.spaces.claimPlanInternal, {
      spaceId,
    });
    expect(plan.sources[0].places).toEqual([]);
    expect(plan.sources[0].pins).toEqual([]);
  });

  it("loads all removal decisions once while enriching a batch", async () => {
    const { t, itemId, insert } = await setup();
    const otherId = await insert();
    await t.run(async (ctx) => {
      const items = await Promise.all(
        [itemId, otherId].map((id) => ctx.db.get(id)),
      );
      const query = vi.spyOn(ctx.db, "query");
      try {
        await enrichItems(
          ctx,
          items.filter(
            (item): item is NonNullable<typeof item> => item !== null,
          ),
        );
        expect(
          query.mock.calls.filter(([table]) => table === "placeRemovals"),
        ).toHaveLength(1);
      } finally {
        query.mockRestore();
      }
    });
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
      appleId: pin.appleId,
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

  it("removes every spelling of a row the city page merged", async () => {
    for (const [shown, twin] of [
      ["Jo's Coffee", "Jos Coffee"],
      ["Cafe  de Flore", "CafeDeFlore"],
      ["すし", "ずし"],
    ]) {
      const { t, itemId, pin, map, source } = await setup();
      const at = { lat: pin.lat, lng: pin.lng, city: pin.city };
      const pins = [
        { ...at, name: shown },
        { ...at, name: twin, lat: pin.lat + 0.001 },
      ];
      await t.run((ctx) =>
        ctx.db.patch(itemId, { placePins: pins, places: [shown, twin] }),
      );
      expect(
        cityPins(await t.query(api.items.listCityItems, { city: "Lisbon" })),
      ).toHaveLength(1);
      await t.mutation(api.placeRemovals.removePlace, {
        itemId,
        name: shown,
        lat: pin.lat,
        lng: pin.lng,
      });
      expect(await map()).toEqual([]);
      expect((await source()).places).toEqual([]);
    }
  });

  it("keeps what the city page shows as a separate row", async () => {
    const { t, itemId, pin, map } = await setup();
    const at = { lat: pin.lat, lng: pin.lng, city: pin.city };
    type Row = typeof at & { name: string; appleId?: string };
    const cases: { removed: Row; kept: Row }[] = [
      {
        removed: { ...at, name: "Tigre", appleId: "a" },
        kept: { ...at, name: "Tigre", appleId: "b", lat: pin.lat + 0.001 },
      },
      {
        removed: { ...at, name: "Tigre", appleId: "a" },
        kept: { ...at, name: "Tigre Bakery", appleId: "b" },
      },
      { removed: { ...at, name: "Le Bar" }, kept: { ...at, name: "Le Cafe" } },
      { removed: { ...at, name: "Sol" }, kept: { ...at, name: "Sol Bakery" } },
      {
        removed: { ...at, name: "Tigre" },
        kept: { ...at, name: "Tigre Bakery", appleId: "b" },
      },
      {
        removed: { ...at, name: "Tigre", appleId: "a" },
        kept: { ...at, name: "Casa Tigre" },
      },
      {
        removed: { ...at, name: "Tigre, Rua A" },
        kept: { ...at, name: "Tigre, Rua B" },
      },
      {
        removed: { ...at, name: "Starbucks", appleId: "a" },
        kept: { ...at, name: "Starbucks", appleId: "b" },
      },
      {
        removed: { ...at, name: "Sol" },
        kept: { ...at, name: "Sol", lat: pin.lat + 0.01 },
      },
    ];
    for (const { removed, kept } of cases) {
      await t.run((ctx) =>
        ctx.db.patch(itemId, {
          placePins: [removed, kept],
          places: [removed.name, kept.name],
        }),
      );
      const removalId = await t.mutation(api.placeRemovals.removePlace, {
        itemId,
        name: removed.name,
        lat: removed.lat,
        lng: removed.lng,
        appleId: removed.appleId,
      });
      expect((await map()).map((p) => [p.name, p.lat])).toEqual([
        [kept.name, kept.lat],
      ]);
      await t.mutation(api.placeRemovals.undoRemovePlace, { removalId });
    }
  });

  it("filters an Apple suggestion at the removed spot, with or without an area", async () => {
    const at = { lat: 38.7, lng: -9.1 };
    const removed: Removal[] = [
      { ...at, name: "Tigre", city: "lisbon", _creationTime: 1 },
    ];
    const found = {
      ...at,
      name: "Tigre",
      category: "Restaurant",
      interest: "food" as const,
    };
    const keep = (
      suggestion: typeof found & { area?: string; appleId?: string },
    ) =>
      keepSuggestion(suggestion, {
        centre: at,
        been: new Set(),
        taken: [],
        removed,
      });
    expect(keep({ ...found, area: "Alfama" })).toBe(false);
    expect(keep({ ...found, appleId: "new", area: "Alfama" })).toBe(false);
    expect(keep({ ...found, name: "Sol", area: "Alfama" })).toBe(true);
    removed[0].appleId = "a";
    expect(keep({ ...found, appleId: "b" })).toBe(true);
  });

  it("drops every label of a removed pin, even one the pin does not spell out", async () => {
    const { t, itemId, pin, map, source } = await setup();
    const bare = { ...pin, name: "Tigre" };
    await t.run((ctx) =>
      ctx.db.patch(itemId, {
        placePins: [bare],
        places: ["Tigre", "Tigre, Alfama"],
      }),
    );
    await t.mutation(api.placeRemovals.removePlace, {
      itemId,
      name: bare.name,
      lat: bare.lat,
      lng: bare.lng,
      appleId: bare.appleId,
    });
    expect(await map()).toEqual([]);
    expect((await source()).places).toEqual([]);
  });

  it("keeps a multi-city guide's other city and scopes unpinned labels to the removal's city", async () => {
    const { t, itemId, pin, insert, map, source } = await setup();
    const lisbon = { ...pin, name: "Sol", appleId: "lisbon" };
    const porto = {
      ...pin,
      name: "Sol",
      city: "Porto",
      lat: 41.15,
      appleId: "porto",
    };
    await t.run((ctx) =>
      ctx.db.patch(itemId, {
        cities: ["Lisbon", "Porto"],
        placePins: [lisbon, porto],
        places: ["Sol, Lisbon", "Sol, Porto"],
      }),
    );
    const portoOnly = await insert("ready", [], ["Sol"], ["Porto"]);
    const namedPorto = await insert(
      "ready",
      [],
      ["Sol, Porto"],
      ["Lisbon", "Porto"],
    );
    const lisbonSave = await insert("ready", [], ["Sol"], ["Lisbon"]);
    await t.mutation(api.placeRemovals.removePlace, {
      itemId,
      name: lisbon.name,
      lat: lisbon.lat,
      lng: lisbon.lng,
      appleId: lisbon.appleId,
    });
    expect((await map()).map((p) => p.appleId)).toEqual(["porto"]);
    expect((await source()).places).not.toContain("Sol, Lisbon");
    expect((await source()).places).toContain("Sol, Porto");
    expect((await source(portoOnly)).places).toEqual(["Sol"]);
    expect((await source(namedPorto)).places).toEqual(["Sol, Porto"]);
    expect((await source(lisbonSave)).places).toEqual([]);
  });
});
