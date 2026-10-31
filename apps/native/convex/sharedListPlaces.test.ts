// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { MAX_LIST_PLACES } from "./model/sharedLists";
import { MAX_CITY_CHARS } from "./model/trip";
import {
  joiner,
  listWithOwner,
  near,
  seedSave,
} from "./sharedLists.test.helpers";
import {
  newConvexTest,
  setTestConsent,
  signedInUser,
  type TestBackend,
} from "./test.setup";

async function placeRows(base: TestBackend, listId: Id<"sharedLists">) {
  return await base.run((ctx) =>
    ctx.db
      .query("sharedListPlaces")
      .withIndex("by_list_and_added", (q) => q.eq("listId", listId))
      .collect(),
  );
}

async function placeCount(base: TestBackend, listId: Id<"sharedLists">) {
  return await base.run(async (ctx) => (await ctx.db.get(listId))?.placeCount);
}

function later(ms = 1000) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + ms);
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("addSavePlaces", () => {
  it("leaves out a place the person removed from the save", async () => {
    const { base, owner, listId } = await listWithOwner();
    const itemId = await seedSave(base, owner.userId, {
      title: "Ana's picks",
      pins: [
        { name: "Cervejaria Ramiro", ...near(10) },
        { name: "Taberna da Rua", ...near(14) },
      ],
    });
    await owner.t.mutation(api.placeRemovals.removePlace, {
      itemId,
      name: "Cervejaria Ramiro",
      ...near(10),
    });
    const added = await owner.t.mutation(api.sharedLists.addSavePlaces, {
      listId,
      itemId,
    });
    expect(added).toBe(1);
    const names = (await placeRows(base, listId)).map((row) => row.name);
    expect(names).toContain("Taberna da Rua");
    expect(names).not.toContain("Cervejaria Ramiro");
  });

  it("copies a member's own save into the list, skipping places already on it", async () => {
    const { base, owner, token, listId } = await listWithOwner();
    const bo = await joiner(base, token, { pro: true });
    const itemId = await seedSave(base, bo.userId, {
      title: "Bo's picks",
      pins: [
        { name: "Manteigaria", ...near(2), appleId: "A-mant" },
        { name: "Cervejaria Ramiro", ...near(10), category: "Restaurant" },
      ],
      tags: ["seafood", "date night"],
    });
    later();
    const added = await bo.t.mutation(api.sharedLists.addSavePlaces, {
      listId,
      itemId,
    });
    expect(added).toBe(1);
    expect(await placeCount(base, listId)).toBe(3);
    const rows = await placeRows(base, listId);
    const ramiro = rows.find((row) => row.name === "Cervejaria Ramiro");
    expect(ramiro).toMatchObject({
      addedBy: bo.userId,
      itemId,
      city: "Lisbon",
      tags: ["seafood", "date night"],
    });
    expect(JSON.stringify(rows)).not.toContain("Bo's picks");
    const seenByOwner = await owner.t.query(
      api.sharedLists.listSharedLists,
      {},
    );
    expect(seenByOwner[0]?.newCount).toBe(1);
  });

  it("keeps to the chosen city and refuses another person's save", async () => {
    const { base, owner, token, listId } = await listWithOwner();
    const bo = await joiner(base, token);
    const porto = await seedSave(base, owner.userId, {
      cities: ["Porto", "Lisbon"],
      pins: [
        { name: "Majestic", lat: 41.1467, lng: -8.6075, city: "Porto" },
        { name: "Ramiro", ...near(10), city: "Lisbon" },
      ],
    });
    expect(
      await owner.t.mutation(api.sharedLists.addSavePlaces, {
        listId,
        itemId: porto,
        city: "Lisbon",
      }),
    ).toBe(1);
    expect(
      (await placeRows(base, listId)).map((row) => row.name),
    ).not.toContain("Majestic");
    await expect(
      bo.t.mutation(api.sharedLists.addSavePlaces, { listId, itemId: porto }),
    ).rejects.toThrow(/Save not found/);
    const stranger = await signedInUser(base, { pro: true });
    await expect(
      stranger.t.mutation(api.sharedLists.addSavePlaces, {
        listId,
        itemId: porto,
      }),
    ).rejects.toThrow(/List not found/);
  });

  it("skips a pin with no city of its own on a save that names several", async () => {
    const { base, owner, listId } = await listWithOwner();
    const itemId = await seedSave(base, owner.userId, {
      cities: ["Porto", "Lisbon"],
      pins: [
        { name: "Somewhere", ...near(12) },
        { name: "Ramiro", ...near(10), city: "Lisbon" },
      ],
    });
    expect(
      await owner.t.mutation(api.sharedLists.addSavePlaces, { listId, itemId }),
    ).toBe(1);
    const names = (await placeRows(base, listId)).map((row) => row.name);
    expect(names).toContain("Ramiro");
    expect(names).not.toContain("Somewhere");
  });

  it("removeSavePlaces takes back only the rows the caller added from that save", async () => {
    const { base, owner, itemId, token, listId } = await listWithOwner();
    const bo = await joiner(base, token, { pro: true });
    const boItem = await seedSave(base, bo.userId, {
      pins: [{ name: "Ramiro", ...near(10) }],
    });
    await bo.t.mutation(api.sharedLists.addSavePlaces, {
      listId,
      itemId: boItem,
    });
    expect(
      await bo.t.mutation(api.sharedLists.removeSavePlaces, {
        listId,
        itemId,
      }),
    ).toBe(0);
    expect(
      await owner.t.mutation(api.sharedLists.removeSavePlaces, {
        listId,
        itemId,
      }),
    ).toBe(2);
    expect((await placeRows(base, listId)).map((row) => row.name)).toEqual([
      "Ramiro",
    ]);
    expect(await placeCount(base, listId)).toBe(1);
  });
});

describe("addSharedListPlace", () => {
  it("stores a tidied search result once, for any member", async () => {
    const { base, token, listId } = await listWithOwner();
    const bo = await joiner(base, token);
    const place = {
      name: "  Pastéis   de Belém ",
      lat: 38.6975,
      lng: -9.2033,
      appleId: "A-belem",
      category: "Bakery",
      area: "Belém",
      city: "Lisbon",
    };
    const first = await bo.t.mutation(api.sharedLists.addSharedListPlace, {
      listId,
      place,
    });
    const again = await bo.t.mutation(api.sharedLists.addSharedListPlace, {
      listId,
      place: { ...place, name: "Pasteis de Belem" },
    });
    expect(again).toBe(first);
    expect(await placeCount(base, listId)).toBe(3);
    const row = await base.run((ctx) => ctx.db.get(first));
    expect(row).toMatchObject({
      name: "Pastéis de Belém",
      appleId: "A-belem",
      category: "Bakery",
      city: "Lisbon",
      addedBy: bo.userId,
    });
    expect(row).not.toHaveProperty("area");
    expect(row).not.toHaveProperty("itemId");
  });

  it("needs a city and caps its length, for a free member too", async () => {
    const { base, token, listId } = await listWithOwner();
    const bo = await joiner(base, token);
    await expect(
      bo.t.mutation(api.sharedLists.addSharedListPlace, {
        listId,
        place: { name: "Nowhere", ...near(30), city: "   " },
      }),
    ).rejects.toThrow(/City required/);
    const id = await bo.t.mutation(api.sharedLists.addSharedListPlace, {
      listId,
      place: { name: "Longtown", ...near(31), city: "x".repeat(500) },
    });
    const row = await base.run((ctx) => ctx.db.get(id));
    expect(row?.city).toBe("x".repeat(MAX_CITY_CHARS));
  });

  it("refuses a bad point, a full list, and a stranger", async () => {
    const { base, owner, listId } = await listWithOwner();
    await expect(
      owner.t.mutation(api.sharedLists.addSharedListPlace, {
        listId,
        place: { name: "Nowhere", lat: 91, lng: 0, city: "Lisbon" },
      }),
    ).rejects.toThrow(/Place required/);
    await base.run(async (ctx) => {
      for (let n = 2; n < MAX_LIST_PLACES; n++) {
        await ctx.db.insert("sharedListPlaces", {
          listId,
          addedBy: owner.userId,
          name: `Spot ${n}`,
          lat: 38 + n * 0.01,
          lng: -9,
          city: "Lisbon",
          addedAt: n,
        });
      }
    });
    await expect(
      owner.t.mutation(api.sharedLists.addSharedListPlace, {
        listId,
        place: { name: "One more", ...near(50), city: "Lisbon" },
      }),
    ).rejects.toThrow(/full/);
    const stranger = await signedInUser(base, { pro: false });
    await expect(
      stranger.t.mutation(api.sharedLists.addSharedListPlace, {
        listId,
        place: { name: "Mine", ...near(60), city: "Lisbon" },
      }),
    ).rejects.toThrow(/List not found/);
  });
});

describe("a place on the list", () => {
  it("can be marked visited and removed by any member, and by no one else", async () => {
    const { base, owner, token, listId } = await listWithOwner();
    const bo = await joiner(base, token);
    const list = await owner.t.query(api.sharedLists.getSharedList, { listId });
    const [place] = list?.places ?? [];
    await bo.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: place._id,
      visited: true,
    });
    const seen = await owner.t.query(api.sharedLists.getSharedList, { listId });
    expect(seen?.places.find((p) => p._id === place._id)?.visitedAt).toEqual(
      expect.any(Number),
    );
    await bo.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: place._id,
      visited: false,
    });
    expect(
      (await base.run((ctx) => ctx.db.get(place._id)))?.visitedAt,
    ).toBeUndefined();
    const stranger = await signedInUser(base, { pro: true });
    await expect(
      stranger.t.mutation(api.sharedLists.removeSharedListPlace, {
        placeId: place._id,
      }),
    ).rejects.toThrow(/List not found/);
    await bo.t.mutation(api.sharedLists.removeSharedListPlace, {
      placeId: place._id,
    });
    expect(await placeCount(base, listId)).toBe(1);
    expect(await base.run((ctx) => ctx.db.get(place._id))).toBeNull();
  });

  it("stops being new once the member has looked", async () => {
    const { base, owner, token, listId } = await listWithOwner();
    const bo = await joiner(base, token);
    await bo.t.mutation(api.sharedLists.markSharedListSeen, { listId });
    const lists = await bo.t.query(api.sharedLists.listSharedLists, {});
    expect(lists[0]?.newCount).toBe(0);
    const list = await bo.t.query(api.sharedLists.getSharedList, { listId });
    expect(list?.places.every((place) => !place.isNew)).toBe(true);
    later();
    await owner.t.mutation(api.sharedLists.addSharedListPlace, {
      listId,
      place: { name: "Ramiro", ...near(10), city: "Lisbon" },
    });
    const after = await bo.t.query(api.sharedLists.listSharedLists, {});
    expect(after[0]?.newCount).toBe(1);
    const owners = await owner.t.query(api.sharedLists.listSharedLists, {});
    expect(owners[0]?.newCount).toBe(0);
  });
});

async function testKey(): Promise<string> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const der = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", pair.privateKey),
  );
  return btoa(String.fromCharCode(...der));
}

async function stubMaps() {
  vi.stubEnv("APPLE_MAPS_PRIVATE_KEY", await testKey());
  vi.stubEnv("APPLE_MAPS_KEY_ID", "KEY1");
  vi.stubEnv("APPLE_MAPS_TEAM_ID", "TEAM1");
}

const PORTO = { latitude: 41.1579, longitude: -8.6291 };
const LISBON_CENTRE = { latitude: 38.7, longitude: -9.1 };
const FARAWAY = { lat: 37.1234, lng: -7.6543 };

function fakeApple() {
  return vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.pathname === "/v1/token") {
      return Response.json({ accessToken: "maps", expiresInSeconds: 1800 });
    }
    const q = url.searchParams.get("q") ?? "";
    if (url.pathname === "/v1/geocode") {
      const coordinate = /porto/i.test(q) ? PORTO : LISBON_CENTRE;
      return Response.json({ results: [{ name: q, coordinate }] });
    }
    return Response.json({
      results: [
        {
          name: `${q} house`,
          id: "A-house",
          poiCategory: "Restaurant",
          structuredAddress: { locality: "Lisbon" },
          coordinate: { latitude: 38.72, longitude: -9.14 },
        },
        {
          name: `${q} in Porto`,
          id: "A-porto",
          poiCategory: "Restaurant",
          structuredAddress: { locality: "Porto" },
          coordinate: { latitude: 41.1579, longitude: -8.6291 },
        },
      ],
    });
  });
}

function appleUrls(fetchMock: ReturnType<typeof fakeApple>): URL[] {
  return fetchMock.mock.calls.map(([input]) => new URL(String(input)));
}

function searchLocation(fetchMock: ReturnType<typeof fakeApple>) {
  return appleUrls(fetchMock)
    .find((url) => url.pathname === "/v1/search")
    ?.searchParams.get("searchLocation");
}

function geocodes(fetchMock: ReturnType<typeof fakeApple>) {
  return appleUrls(fetchMock)
    .filter((url) => url.pathname === "/v1/geocode")
    .map((url) => url.searchParams.get("q"));
}

describe("searchListPlaces", () => {
  it("searches near the chosen city for a covered free member", async () => {
    await stubMaps();
    const fetchMock = fakeApple();
    vi.stubGlobal("fetch", fetchMock);
    const { base, token, listId } = await listWithOwner();
    const bo = await joiner(base, token);
    const result = await bo.t.action(api.tripPlanner.searchListPlaces, {
      listId,
      city: " Lisbon ",
      query: "  ramen ",
    });
    expect(result.available).toBe(true);
    expect(result.places.map((place) => place.name)).toEqual(["ramen house"]);
    expect(geocodes(fetchMock)).toEqual(["Lisbon"]);
    const searched = appleUrls(fetchMock).find(
      (url) => url.pathname === "/v1/search",
    );
    expect(searched?.searchParams.get("q")).toBe("ramen");
    expect(searchLocation(fetchMock)).toMatch(/^38\.7,/);
  });

  it("works on a list with no places yet", async () => {
    await stubMaps();
    const fetchMock = fakeApple();
    vi.stubGlobal("fetch", fetchMock);
    const base = newConvexTest();
    const owner = await signedInUser(base, { pro: true });
    const listId = await owner.t.mutation(api.sharedLists.createSharedList, {
      name: "Ours",
      cities: ["Lisbon"],
    });
    const result = await owner.t.action(api.tripPlanner.searchListPlaces, {
      listId,
      city: "Lisbon",
      query: "ramen",
    });
    expect(result.places.map((place) => place.name)).toEqual(["ramen house"]);
  });

  it("searches the city asked for, not the middle of a two-city list", async () => {
    await stubMaps();
    const fetchMock = fakeApple();
    vi.stubGlobal("fetch", fetchMock);
    const { owner, listId } = await listWithOwner();
    await owner.t.mutation(api.sharedLists.addSharedListPlace, {
      listId,
      place: {
        name: "Majestic",
        lat: PORTO.latitude,
        lng: PORTO.longitude,
        city: "Porto",
      },
    });
    const result = await owner.t.action(api.tripPlanner.searchListPlaces, {
      listId,
      city: "Porto",
      query: "ramen",
    });
    expect(geocodes(fetchMock)).toEqual(["Porto"]);
    expect(searchLocation(fetchMock)).toMatch(/^41\.1579,/);
    expect(result.places.map((place) => place.name)).toEqual([
      "ramen in Porto",
    ]);
  });

  it("answers nothing for a short query and refuses a stranger", async () => {
    const { base, owner, listId } = await listWithOwner();
    expect(
      await owner.t.action(api.tripPlanner.searchListPlaces, {
        listId,
        city: "Lisbon",
        query: "r",
      }),
    ).toEqual({ available: true, places: [] });
    const stranger = await signedInUser(base, { pro: true });
    await expect(
      stranger.t.action(api.tripPlanner.searchListPlaces, {
        listId,
        city: "Lisbon",
        query: "ramen",
      }),
    ).rejects.toThrow(/List not found/);
    await expect(
      owner.t.action(api.tripPlanner.searchListPlaces, {
        listId,
        city: "   ",
        query: "ramen",
      }),
    ).rejects.toThrow(/City required/);
  });

  it("is refused once neither the owner nor the caller has Pro", async () => {
    const { base, owner, token, listId } = await listWithOwner();
    const bo = await joiner(base, token);
    await base.run(async (ctx) => {
      const sub = await ctx.db
        .query("subscriptions")
        .withIndex("by_user", (q) => q.eq("userId", owner.userId))
        .unique();
      if (sub) await ctx.db.delete(sub._id);
    });
    await expect(
      bo.t.action(api.tripPlanner.searchListPlaces, {
        listId,
        city: "Lisbon",
        query: "ramen",
      }),
    ).rejects.toThrow(/Pro required/);
  });

  it("never sends Apple a declined contributor's point", async () => {
    await stubMaps();
    const fetchMock = fakeApple();
    vi.stubGlobal("fetch", fetchMock);
    const { base, owner, token, listId } = await listWithOwner();
    const bo = await joiner(base, token);
    await base.run((ctx) => setTestConsent(ctx, bo.userId, "declined"));
    await bo.t.mutation(api.sharedLists.addSharedListPlace, {
      listId,
      place: { name: "Hidden", ...FARAWAY, city: "Lisbon" },
    });
    const result = await owner.t.action(api.tripPlanner.searchListPlaces, {
      listId,
      city: "Lisbon",
      query: "ramen",
    });
    expect(result.available).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
    const sent = appleUrls(fetchMock).map(String).join(" ");
    expect(sent).not.toContain(String(FARAWAY.lat));
    expect(sent).not.toContain(String(FARAWAY.lng));
    expect(sent).not.toContain("Hidden");
  });

  it("makes no Apple call when the caller has declined AI", async () => {
    await stubMaps();
    const fetchMock = fakeApple();
    vi.stubGlobal("fetch", fetchMock);
    const { base, token, listId } = await listWithOwner();
    const bo = await joiner(base, token);
    await base.run((ctx) => setTestConsent(ctx, bo.userId, "declined"));
    const result = await bo.t.action(api.tripPlanner.searchListPlaces, {
      listId,
      city: "Lisbon",
      query: "ramen",
    });
    expect(result).toEqual({ available: false, places: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("searchTripPlaces on a trip made from a list", () => {
  it("sends Apple only the city and the query, never the trip's stops", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { owner, listId } = await listWithOwner();
    const { tripId } = await owner.t.action(api.tripPlanner.createTripPlan, {
      city: "Lisbon",
      days: 1,
      pace: "easy",
      interests: [],
      listId,
    });
    await stubMaps();
    const fetchMock = fakeApple();
    vi.stubGlobal("fetch", fetchMock);
    expect(tripId).not.toBeNull();
    await owner.t.action(api.tripPlanner.searchTripPlaces, {
      tripId: tripId!,
      query: "ramen",
    });
    expect(geocodes(fetchMock)).toEqual(["Lisbon"]);
    expect(searchLocation(fetchMock)).toMatch(/^38\.7,/);
  });
});
