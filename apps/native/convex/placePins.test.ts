// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { deleteMembership } from "./model/memberships";
import {
  newConvexTest,
  insertConsentingUser,
  setTestConsent,
} from "./test.setup";

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

async function withMaps(ids = false) {
  vi.stubEnv("APPLE_MAPS_PRIVATE_KEY", await testKey());
  vi.stubEnv("APPLE_MAPS_KEY_ID", "KEY1");
  vi.stubEnv("APPLE_MAPS_TEAM_ID", "TEAM1");
  const fetchMock = vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.pathname === "/v1/token") {
      return Response.json({ accessToken: "maps", expiresInSeconds: 1800 });
    }
    const q = url.searchParams.get("q") ?? "";
    return Response.json({
      results: [
        {
          ...(ids ? { id: `ID${q.length}`, poiCategory: "Cafe" } : {}),
          coordinate: { latitude: q.length, longitude: -q.length },
        },
      ],
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  const queries = () =>
    fetchMock.mock.calls
      .map(([input]) => new URL(input))
      .filter((url) => url.pathname === "/v1/search")
      .map((url) => url.searchParams.get("q"));
  return { queries };
}

const maps = (value: string) => ({
  kind: "open_maps" as const,
  label: "Map",
  value,
});

async function setup(
  places: string[],
  options: { declined?: boolean; pins?: boolean; read?: string[] } = {},
) {
  const t = newConvexTest();
  const itemId = await t.run(async (ctx) => {
    const userId = await insertConsentingUser(ctx);
    if (options.declined) {
      await setTestConsent(ctx, userId, "declined");
    }
    return await ctx.db.insert("items", {
      userId,
      type: "link",
      status: "ready",
      title: "Lisbon eats",
      tags: [],
      searchText: "Lisbon eats",
      cities: ["Lisbon"],
      intents: places.map(maps),
      places: options.read,
      placePins: options.pins
        ? [{ name: places[0], lat: 1, lng: 2 }]
        : undefined,
    });
  });
  const pins = async () =>
    (await t.run(async (ctx) => ctx.db.get(itemId)))?.placePins;
  return { t, itemId, pins };
}

describe("placePins", () => {
  it("finds a kept place on an edited save by its branch and leaves the owner's pin alone", async () => {
    const { queries } = await withMaps();
    const { t, itemId, pins } = await setup([], { read: ["Chosen", "Bakery"] });
    const chosen = { name: "Chosen", city: "Lisbon", lat: 7, lng: 8 };
    await t.run((ctx) =>
      ctx.db.patch(itemId, {
        placesEdited: true,
        placePins: [chosen],
        placeLocations: [{ name: "Bakery", location: "Bairro Alto" }],
      }),
    );
    await t.action(internal.placePins.locateItem, { itemId, refresh: true });
    expect(queries()).toEqual(["Bakery, Bairro Alto, Lisbon"]);
    const q = "Bakery, Bairro Alto, Lisbon".length;
    expect(await pins()).toEqual([
      chosen,
      { name: "Bakery", city: "Lisbon", lat: q, lng: -q },
    ]);
  });
  it("looks up the source's branch while keeping its display name and public contract", async () => {
    await withMaps();
    const { t, itemId, pins } = await setup(["Carette"], { read: ["Carette"] });
    await t.run((ctx) =>
      ctx.db.patch(itemId, {
        cities: ["Paris"],
        placeLocations: [{ name: "Carette", location: "Place du Trocadéro" }],
      }),
    );
    const queries: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        const url = new URL(input);
        if (url.pathname === "/v1/token")
          return Response.json({ accessToken: "maps", expiresInSeconds: 1800 });
        const q = url.searchParams.get("q") ?? "";
        queries.push(q);
        const trocadero = q.includes("Trocadéro");
        return Response.json({
          results: [
            {
              name: "Carette",
              id: trocadero ? "trocadero" : "vosges",
              coordinate: {
                latitude: 48.862,
                longitude: trocadero ? 2.287 : 2.365,
              },
            },
          ],
        });
      }),
    );
    await t.action(internal.placePins.locateItem, { itemId });
    expect(queries).toEqual(["Carette, Place du Trocadéro, Paris"]);
    expect(await pins()).toEqual([
      {
        name: "Carette",
        city: "Paris",
        lat: 48.862,
        lng: 2.287,
        appleId: "trocadero",
      },
    ]);
    const item = await t.run((ctx) => ctx.db.get(itemId));
    if (!item) throw new Error("Missing test save");
    const client = t.withIdentity({ subject: item.userId });
    expect(
      await client.query(api.items.getItem, { id: itemId }),
    ).not.toHaveProperty("placeLocations");
  });

  it.each([
    ["after", true],
    ["before", false],
  ])(
    "drops a pin an older lookup found once a reread names another branch (new lookup lands %s it)",
    async (_order, newFirst) => {
      vi.stubEnv("APPLE_MAPS_PRIVATE_KEY", await testKey());
      vi.stubEnv("APPLE_MAPS_KEY_ID", "KEY1");
      vi.stubEnv("APPLE_MAPS_TEAM_ID", "TEAM1");
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string) => {
          const url = new URL(input);
          if (url.pathname === "/v1/token")
            return Response.json({
              accessToken: "maps",
              expiresInSeconds: 1800,
            });
          const trocadero = (url.searchParams.get("q") ?? "").includes(
            "Trocadéro",
          );
          return Response.json({
            results: [
              {
                name: "Carette",
                id: trocadero ? "trocadero" : "vosges",
                coordinate: {
                  latitude: 48.862,
                  longitude: trocadero ? 2.287 : 2.365,
                },
              },
            ],
          });
        }),
      );
      const { t, itemId, pins } = await setup([], { read: ["Carette"] });
      await t.run((ctx) => ctx.db.patch(itemId, { cities: ["Paris"] }));
      const old = await t.query(internal.placePins.toLocate, { itemId });
      if (old === null) throw new Error("Expected a lookup");
      expect(old.locations).toEqual([]);
      await t.run((ctx) => ctx.db.patch(itemId, { status: "processing" }));
      expect(
        await t.mutation(internal.items.finalizeItem, {
          itemId,
          reading: {},
          classification: {
            title: "Lisbon eats",
            description: "",
            tags: [],
            cities: ["Paris"],
            places: ["Carette"],
            placeLocations: [
              { name: "Carette", location: "Place du Trocadéro" },
            ],
          },
        }),
      ).toBe("applied");
      const oldStores = () =>
        t.mutation(internal.placePins.storePins, {
          itemId,
          found: [
            { name: "Carette", lat: 48.862, lng: 2.365, appleId: "vosges" },
          ],
          cluesSearched: old.locations,
        });
      if (!newFirst) await oldStores();
      await t.action(internal.placePins.locateItem, { itemId });
      if (newFirst) await oldStores();
      expect((await pins())?.map((pin) => pin.appleId)).toEqual(["trocadero"]);
    },
  );

  it("pins the new branch when a reread respells the place and changes its branch", async () => {
    vi.stubEnv("APPLE_MAPS_PRIVATE_KEY", await testKey());
    vi.stubEnv("APPLE_MAPS_KEY_ID", "KEY1");
    vi.stubEnv("APPLE_MAPS_TEAM_ID", "TEAM1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        const url = new URL(input);
        if (url.pathname === "/v1/token")
          return Response.json({ accessToken: "maps", expiresInSeconds: 1800 });
        const neuve = (url.searchParams.get("q") ?? "").includes("Rue Neuve");
        return Response.json({
          results: [
            {
              name: "Cafe Joe",
              id: neuve ? "neuve" : "vieille",
              coordinate: { latitude: 48.86, longitude: neuve ? 2.29 : 2.36 },
            },
          ],
        });
      }),
    );
    const { t, itemId, pins } = await setup([], { read: ["Cafe Joe"] });
    await t.run((ctx) =>
      ctx.db.patch(itemId, {
        status: "processing",
        cities: ["Paris"],
        placeLocations: [{ name: "Cafe Joe", location: "Rue Vieille" }],
        placePins: [{ name: "Cafe Joe", lat: 48.86, lng: 2.36, city: "Paris" }],
      }),
    );
    await t.mutation(internal.items.finalizeItem, {
      itemId,
      reading: {},
      classification: {
        title: "Lisbon eats",
        description: "",
        tags: [],
        cities: ["Paris"],
        places: ["Café Joe", "Cafe Joe"],
        placeLocations: [
          { name: "Café Joe", location: "Rue Neuve" },
          { name: "Cafe Joe", location: "Rue Vieille" },
        ],
      },
    });
    expect(await pins()).toEqual([]);
    await t.action(internal.placePins.locateItem, { itemId });
    expect((await pins())?.map((pin) => pin.appleId)).toEqual(["neuve"]);
  });

  it("repairs suffixed places and pins without a new lookup, including legacy Maps intents", async () => {
    const { t, itemId, pins } = await setup(["Guest House, Austin"], {
      read: ["Guest House, Austin", "Guest House", "Eberly, Austin"],
    });
    const existing = [
      {
        name: "Guest House, Austin",
        lat: 30.265,
        lng: -97.749,
        city: "Austin",
      },
      { name: "Guest House", lat: 30.265, lng: -97.749, city: "Austin" },
      { name: "Eberly, Austin", lat: 30.258, lng: -97.759, city: "Austin" },
    ];
    await t.run((ctx) =>
      ctx.db.patch(itemId, { cities: ["Austin"], placePins: existing }),
    );
    await t.mutation(internal.placePins.storePins, { itemId, found: [] });
    expect((await t.run((ctx) => ctx.db.get(itemId)))?.places).toEqual([
      "Guest House",
      "Eberly",
    ]);
    expect(await pins()).toEqual([
      { ...existing[0], name: "Guest House" },
      { ...existing[2], name: "Eberly" },
    ]);
    expect(
      await t.query(internal.placePins.toLocate, { itemId }),
    ).toMatchObject({ names: [] });
    await t.mutation(internal.placePins.storePins, { itemId, found: [] });
    expect(await pins()).toHaveLength(2);
  });

  it("does not use distant pins as a synthetic search centre", async () => {
    const { t, itemId } = await setup(["Paris", "Michigan", "Next"]);
    await t.run(async (ctx) =>
      ctx.db.patch(itemId, {
        placePins: [
          { name: "Paris", lat: 48.86, lng: 2.36 },
          { name: "Michigan", lat: 43.79, lng: -85.5 },
        ],
      }),
    );
    expect(
      (await t.query(internal.placePins.toLocate, { itemId }))?.centre,
    ).toBeNull();
  });

  it("does not bias multi-city saves toward the first city", async () => {
    const { t, itemId } = await setup(["Lisbon", "Porto", "Faro"]);
    await t.run(async (ctx) =>
      ctx.db.patch(itemId, { cities: ["Lisbon", "Porto", "Faro"] }),
    );
    const todo = await t.query(internal.placePins.toLocate, { itemId });
    expect(todo?.city).toBeUndefined();
    expect(todo?.singleCity).toBe(false);
    expect(todo?.centre).toBeNull();
    expect(todo?.names).toHaveLength(3);
  });
  it("resolves places independently into their source-declared cities", async () => {
    await withMaps();
    const { t, itemId, pins } = await setup(["Cafe, Lisbon", "Tower, Porto"]);
    await t.run(async (ctx) =>
      ctx.db.patch(itemId, { cities: ["Lisbon", "Porto"] }),
    );
    const queries: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        const url = new URL(input);
        if (url.pathname === "/v1/token")
          return Response.json({ accessToken: "maps" });
        const q = url.searchParams.get("q") ?? "";
        queries.push(q);
        const porto = q === "Tower, Porto";
        return Response.json({
          results: [
            {
              structuredAddress: { locality: porto ? "Porto" : "Lisbon" },
              coordinate: { latitude: porto ? 41.15 : 38.72, longitude: -9.1 },
            },
          ],
        });
      }),
    );
    await t.action(internal.placePins.locateItem, { itemId });
    expect(queries).toEqual(["Cafe, Lisbon", "Tower, Porto"]);
    expect((await pins())?.map((pin) => pin.city)).toEqual(["Lisbon", "Porto"]);
  });

  it("keeps a suburb on its source city's page and rejects a later distant namesake", async () => {
    await withMaps();
    const { t, itemId, pins } = await setup(["Pier"]);
    await t.run(async (ctx) =>
      ctx.db.patch(itemId, { cities: ["Los Angeles"] }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        const url = new URL(input);
        if (url.pathname === "/v1/token")
          return Response.json({ accessToken: "maps" });
        const q = url.searchParams.get("q") ?? "";
        const pier = q.startsWith("Pier");
        const wrong = q.startsWith("Wrong");
        return Response.json({
          results: [
            {
              structuredAddress: {
                locality: wrong
                  ? "Michigan"
                  : pier
                    ? "Santa Monica"
                    : "Los Angeles",
                thoroughfare: "Street",
              },
              coordinate: {
                latitude: wrong ? 43.7858 : pier ? 34.01 : 34.05,
                longitude: wrong ? -85.5028 : pier ? -118.49 : -118.25,
              },
            },
          ],
        });
      }),
    );
    await t.action(internal.placePins.locateItem, { itemId });
    const item = await t.run(async (ctx) => ctx.db.get(itemId));
    expect(item?.cities).toEqual(["Los Angeles"]);
    expect((await pins())?.[0].city).toBe("Los Angeles");
    const owner = t.withIdentity({ subject: `${item?.userId}|session-1` });
    expect(
      (await owner.query(api.items.listCities, {})).map((city) => city.city),
    ).toEqual(["Los Angeles"]);
    expect(
      (await owner.query(api.items.listCityItems, { city: "Los Angeles" }))[0]
        .placePins,
    ).toHaveLength(1);
    await t.run(async (ctx) =>
      ctx.db.patch(itemId, {
        intents: ["Pier", "Cafe", "Bakery", "Wrong"].map(maps),
      }),
    );
    expect(
      (await t.query(internal.placePins.toLocate, { itemId }))?.singleCity,
    ).toBe(true);
    await t.action(internal.placePins.locateItem, { itemId });
    expect((await pins())?.map((pin) => pin.name)).toEqual([
      "Pier",
      "Cafe",
      "Bakery",
    ]);
    expect((await t.run(async (ctx) => ctx.db.get(itemId)))?.cities).toEqual([
      "Los Angeles",
    ]);
  });

  it("uses only source-declared cities for multi-city pins", async () => {
    const { t, itemId, pins } = await setup(["Cafe", "Tower", "Other"]);
    await t.run(async (ctx) =>
      ctx.db.patch(itemId, { cities: ["Lisbon", "Porto"] }),
    );
    await t.mutation(internal.placePins.storePins, {
      itemId,
      found: [
        { name: "Cafe", city: " lisbon ", lat: 38.72, lng: -9.1 },
        { name: "Tower", city: "PORTO", lat: 41.15, lng: -8.6 },
        { name: "Other", city: "Santa Monica", lat: 34.01, lng: -118.49 },
      ],
    });
    expect((await pins())?.map((pin) => pin.city)).toEqual([
      "Lisbon",
      "Porto",
      undefined,
    ]);
    expect((await t.run(async (ctx) => ctx.db.get(itemId)))?.cities).toEqual([
      "Lisbon",
      "Porto",
    ]);
  });

  it("keeps city context when a comma belongs to the venue name", async () => {
    const { queries } = await withMaps();
    const { t, itemId } = await setup(["Cafe, Downtown"]);
    const todo = await t.query(internal.placePins.toLocate, { itemId });
    expect(todo?.city).toBe("Lisbon");
    expect(todo?.singleCity).toBe(true);
    await t.action(internal.placePins.locateItem, { itemId });
    expect(queries()).toEqual(["Cafe, Downtown, Lisbon"]);
  });

  it("adds a city that contains a comma to the lookup only once", async () => {
    const { queries } = await withMaps();
    const { t, itemId } = await setup(["Founding Farmers, Washington, D.C."]);
    await t.run(async (ctx) =>
      ctx.db.patch(itemId, { cities: ["Washington, D.C"] }),
    );
    await t.action(internal.placePins.locateItem, { itemId });
    expect(queries()).toEqual(["Founding Farmers, Washington, D.C"]);
  });

  it("keeps retained and new single-city pins assigned to their source city", async () => {
    const { t, itemId, pins } = await setup(["Cafe", "Tower"]);
    await t.run(async (ctx) =>
      ctx.db.patch(itemId, {
        placePins: [{ name: "Cafe", lat: 38.72, lng: -9.1 }],
      }),
    );
    await t.mutation(internal.placePins.storePins, {
      itemId,
      found: [{ name: "Tower", city: "Porto", lat: 41.15, lng: -8.6 }],
    });
    expect((await pins())?.map((pin) => [pin.name, pin.city])).toEqual([
      ["Cafe", "Lisbon"],
      ["Tower", "Lisbon"],
    ]);
    expect((await t.run(async (ctx) => ctx.db.get(itemId)))?.cities).toEqual([
      "Lisbon",
    ]);
  });

  it("refreshes an existing pin instead of keeping its old coordinates", async () => {
    await withMaps();
    const { t, itemId, pins } = await setup(["Micho"], { pins: true });
    await t.action(internal.placePins.locateItem, { itemId, refresh: true });
    expect(await pins()).toEqual([
      { name: "Micho", lat: 13, lng: -13, city: "Lisbon" },
    ]);
  });
  it("resolves an unpinned namesake near the save's established city", async () => {
    await withMaps();
    const fetchMock = vi.fn(async (input: string) => {
      const url = new URL(input);
      if (url.pathname === "/v1/token")
        return Response.json({ accessToken: "maps" });
      expect(url.searchParams.get("searchLocation")).toBe("48.87,2.36");
      return Response.json({
        results: [
          { coordinate: { latitude: 43.7858, longitude: -85.5028 } },
          { coordinate: { latitude: 48.866, longitude: 2.338 } },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { t, itemId, pins } = await setup(["PNY", "Blend", "Micho"]);
    await t.run(async (ctx) =>
      ctx.db.patch(itemId, {
        cities: ["Paris"],
        placePins: [
          { name: "PNY", lat: 48.86, lng: 2.36 },
          { name: "Blend", lat: 48.87, lng: 2.32 },
        ],
      }),
    );
    await t.action(internal.placePins.locateItem, { itemId });
    expect((await pins())?.find((pin) => pin.name === "Micho")).toEqual({
      name: "Micho",
      city: "Paris",
      lat: 48.866,
      lng: 2.338,
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("pins every place a save names, searched near its city", async () => {
    const { queries } = await withMaps();
    const { t, itemId, pins } = await setup(["Time Out Market", "Pink Street"]);
    await t.action(internal.placePins.locateItem, { itemId });
    expect((await pins())?.map((p) => p.name)).toEqual([
      "Time Out Market",
      "Pink Street",
    ]);
    expect(queries()).toContain("Time Out Market, Lisbon");
  });

  it("stores Apple's place id and category on a looked-up pin and adds them to an existing pin on refresh", async () => {
    await withMaps(true);
    const { t, itemId, pins } = await setup(["Micho"]);
    await t.action(internal.placePins.locateItem, { itemId });
    expect(await pins()).toEqual([
      {
        name: "Micho",
        lat: 13,
        lng: -13,
        city: "Lisbon",
        appleId: "ID13",
        category: "Cafe",
      },
    ]);

    await t.run(async (ctx) =>
      ctx.db.patch(itemId, {
        placePins: [{ name: "Micho", lat: 5, lng: -5, city: "Lisbon" }],
      }),
    );
    await t.action(internal.placePins.locateItem, { itemId, refresh: true });
    expect((await pins())?.[0]).toMatchObject({
      appleId: "ID13",
      category: "Cafe",
    });
  });

  it("keeps a stored category when a refresh finds the same pin without one", async () => {
    const { t, itemId, pins } = await setup([]);
    const pin = { name: "Cafe", lat: 38.7, lng: -9.1, city: "Lisbon" };
    await t.run(async (ctx) =>
      ctx.db.patch(itemId, {
        places: ["Cafe"],
        placePins: [{ ...pin, category: "Cafe" }],
      }),
    );
    await t.mutation(internal.placePins.storePins, { itemId, found: [pin] });
    expect(await pins()).toEqual([{ ...pin, category: "Cafe" }]);
  });

  it("keeps a stored id when a refresh finds the same pin without one, but not when the pin moves", async () => {
    const { t, itemId, pins } = await setup([]);
    await t.run(async (ctx) =>
      ctx.db.patch(itemId, {
        places: ["Cafe", "Bar"],
        placePins: [
          { name: "Cafe", lat: 38.7, lng: -9.1, city: "Lisbon", appleId: "C1" },
          {
            name: "Bar",
            lat: 38.71,
            lng: -9.14,
            city: "Lisbon",
            appleId: "B1",
          },
        ],
      }),
    );
    await t.mutation(internal.placePins.storePins, {
      itemId,
      found: [
        { name: "Cafe", lat: 38.7, lng: -9.1, city: "Lisbon" },
        { name: "Bar", lat: 38.72, lng: -9.13, city: "Lisbon" },
      ],
    });
    expect(await pins()).toEqual([
      { name: "Cafe", lat: 38.7, lng: -9.1, city: "Lisbon", appleId: "C1" },
      { name: "Bar", lat: 38.72, lng: -9.13, city: "Lisbon" },
    ]);
  });

  it("keeps an id through the source-city rewrite of a multi-city pin", async () => {
    const { t, itemId, pins } = await setup([]);
    await t.run(async (ctx) =>
      ctx.db.patch(itemId, {
        cities: ["Lisbon", "Porto"],
        places: ["Cafe"],
      }),
    );
    await t.mutation(internal.placePins.storePins, {
      itemId,
      found: [
        { name: "Cafe", city: "Porto", lat: 41.15, lng: -8.6, appleId: "X1" },
      ],
    });
    expect(await pins()).toEqual([
      { name: "Cafe", city: "Porto", lat: 41.15, lng: -8.6, appleId: "X1" },
    ]);
  });

  it("pins the places read off the save, with its Maps links after", async () => {
    await withMaps();
    const { t, itemId, pins } = await setup(["Pink Street"], {
      read: ["Manteigaria", "pink street"],
    });
    await t.action(internal.placePins.locateItem, { itemId });
    expect((await pins())?.map((p) => p.name)).toEqual([
      "Manteigaria",
      "pink street",
    ]);
  });

  it("clears a pin once the save no longer names its place, without a Maps key", async () => {
    const { t, itemId, pins } = await setup(["Time Out Market"], {
      pins: true,
    });
    await t.run(async (ctx) => ctx.db.patch(itemId, { intents: [] }));
    await t.action(internal.placePins.locateItem, { itemId });
    expect(await pins()).toEqual([]);
  });

  it("drops a removed place's pin even when another place cannot be looked up", async () => {
    const { t, itemId, pins } = await setup(
      ["Time Out Market", "Pink Street"],
      {
        pins: true,
      },
    );
    await t.run(async (ctx) =>
      ctx.db.patch(itemId, {
        intents: [maps("Pink Street")],
      }),
    );
    await t.action(internal.placePins.locateItem, { itemId });
    expect(await pins()).toEqual([]);
  });

  it("does not look up a name that is already pinned", async () => {
    const { queries } = await withMaps();
    const { t, itemId, pins } = await setup(
      ["Time Out Market", "Pink Street"],
      {
        pins: true,
      },
    );
    await t.action(internal.placePins.locateItem, { itemId });
    expect(queries()).toEqual(["Pink Street, Lisbon"]);
    expect(await pins()).toHaveLength(2);
  });

  it("pins nothing when the owner declined AI", async () => {
    const { queries } = await withMaps();
    const { t, itemId, pins } = await setup(["Pink Street"], {
      declined: true,
    });
    await t.action(internal.placePins.locateItem, { itemId });
    expect(queries()).toEqual([]);
    expect(await pins()).toBeUndefined();
  });

  it("writes nothing without an Apple Maps key", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { t, itemId, pins } = await setup(["Pink Street"]);
    await t.action(internal.placePins.locateItem, { itemId });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await pins()).toBeUndefined();
  });

  it("drops a pin whose place was removed before the write landed", async () => {
    const { t, itemId, pins } = await setup(["Time Out Market", "Pink Street"]);
    await t.run(async (ctx) => {
      await ctx.db.patch(itemId, { intents: [maps("Pink Street")] });
    });
    await t.mutation(internal.placePins.storePins, {
      itemId,
      found: [
        { name: "Time Out Market", lat: 1, lng: 1 },
        { name: "Pink Street", lat: 2, lng: 2 },
      ],
    });
    expect(await pins()).toEqual([
      { name: "Pink Street", lat: 2, lng: 2, city: "Lisbon" },
    ]);
  });

  it("rejects a distant namesake during incremental lookup before creating another city", async () => {
    await withMaps();
    const { t, itemId, pins } = await setup([
      "PNY",
      "Blend",
      "Bomaye",
      "Micho",
    ]);
    await t.run(async (ctx) =>
      ctx.db.patch(itemId, {
        cities: ["Paris"],
        placePins: [{ name: "PNY", lat: 48.8638, lng: 2.3627, city: "Paris" }],
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        const url = new URL(input);
        if (url.pathname === "/v1/token")
          return Response.json({ accessToken: "maps" });
        const wrong = (url.searchParams.get("q") ?? "").startsWith("Micho");
        return Response.json({
          results: [
            {
              structuredAddress: {
                locality: wrong ? "Michigan" : "Paris",
                thoroughfare: "Street",
              },
              coordinate: {
                latitude: wrong ? 43.7858 : 48.8685,
                longitude: wrong ? -85.5028 : 2.3256,
              },
            },
          ],
        });
      }),
    );
    await t.action(internal.placePins.locateItem, { itemId });
    expect((await pins())?.map((pin) => pin.name)).toEqual([
      "PNY",
      "Blend",
      "Bomaye",
    ]);
    expect((await t.run(async (ctx) => ctx.db.get(itemId)))?.cities).toEqual([
      "Paris",
    ]);
  });

  it("drops a pin far from the save's other places, a same-named place elsewhere", async () => {
    const names = ["PNY", "Blend", "Bomaye", "Micho"];
    const { t, itemId, pins } = await setup(names);
    await t.mutation(internal.placePins.storePins, {
      itemId,
      found: [
        { city: "Paris", name: "PNY", lat: 48.8638, lng: 2.3627 },
        { city: "Paris", name: "Blend", lat: 48.8685, lng: 2.3256 },
        { city: "Paris", name: "Bomaye", lat: 48.8748, lng: 2.3539 },
        { city: "Michigan", name: "Micho", lat: 43.7858, lng: -85.5028 },
      ],
    });
    expect((await pins())?.map((p) => p.name)).toEqual([
      "PNY",
      "Blend",
      "Bomaye",
    ]);
  });

  it("keeps far-apart pins on a save that names several cities", async () => {
    const { t, itemId, pins } = await setup([
      "Time Out",
      "Local Cafe",
      "Local Bakery",
      "Majestic",
    ]);
    await t.run(async (ctx) => {
      await ctx.db.patch(itemId, { cities: ["Lisbon", "Porto"] });
    });
    await t.mutation(internal.placePins.storePins, {
      itemId,
      found: [
        { name: "Time Out", lat: 38.707, lng: -9.1457 },
        { name: "Majestic", lat: 41.1468, lng: -8.6066 },
        { name: "Local Cafe", city: "Lisbon", lat: 38.71, lng: -9.14 },
        { name: "Local Bakery", city: "Lisbon", lat: 38.72, lng: -9.14 },
      ],
    });
    expect(await pins()).toHaveLength(4);
  });

  it("keeps every pin when no majority agrees where the save is", async () => {
    const { t, itemId, pins } = await setup(["P1", "P2", "R1", "R2"]);
    await t.mutation(internal.placePins.storePins, {
      itemId,
      found: [
        { name: "P1", lat: 48.86, lng: 2.35 },
        { name: "P2", lat: 48.87, lng: 2.33 },
        { name: "R1", lat: 41.9, lng: 12.5 },
        { name: "R2", lat: 41.89, lng: 12.48 },
      ],
    });
    expect(await pins()).toHaveLength(4);
  });

  it("keeps two far-apart pins, with nothing to say which is wrong", async () => {
    const { t, itemId, pins } = await setup(["Here", "There"]);
    await t.mutation(internal.placePins.storePins, {
      itemId,
      found: [
        { name: "Here", lat: 48.86, lng: 2.36 },
        { name: "There", lat: 43.79, lng: -85.5 },
      ],
    });
    expect(await pins()).toHaveLength(2);
  });

  it("keeps at most thirty pins", async () => {
    const names = Array.from({ length: 32 }, (_, i) => `Place ${i}`);
    const { t, itemId, pins } = await setup(names);
    await t.mutation(internal.placePins.storePins, {
      itemId,
      found: names.map((name) => ({ name, lat: 1, lng: 1 })),
    });
    expect(await pins()).toHaveLength(30);
  });

  it("looks past the last free slot, so a dropped stray does not block the next place", async () => {
    const { queries } = await withMaps();
    const names = ["A1", "B2", "C3", "D4", "E5", "F6", "G7"];
    const { t, itemId } = await setup(names);
    await t.run(async (ctx) =>
      ctx.db.patch(itemId, {
        placePins: names.slice(0, 4).map((name) => ({ name, lat: 1, lng: 1 })),
      }),
    );
    await t.action(internal.placePins.locateItem, { itemId });
    expect([...new Set(queries())]).toEqual([
      "E5, Lisbon",
      "F6, Lisbon",
      "G7, Lisbon",
    ]);
  });

  it("does not look up places once thirty are already pinned", async () => {
    const { queries } = await withMaps();
    const names = Array.from({ length: 32 }, (_, i) => `Place ${i}`);
    const { t, itemId } = await setup(names);
    await t.run(async (ctx) =>
      ctx.db.patch(itemId, {
        placePins: names.slice(0, 30).map((name) => ({ name, lat: 1, lng: 1 })),
      }),
    );
    await t.action(internal.placePins.locateItem, { itemId });
    expect(queries()).toEqual([]);
  });

  it("reads places from a space's steered intents too", async () => {
    const { queries } = await withMaps();
    const { t, itemId, pins } = await setup([]);
    await t.run(async (ctx) => {
      const item = (await ctx.db.get(itemId))!;
      const spaceId = await ctx.db.insert("spaces", {
        userId: item.userId,
        name: "Trip",
        dynamic: false,
      });
      await ctx.db.insert("spaceItems", {
        userId: item.userId,
        spaceId,
        itemId,
        status: "saved",
        intents: [maps("Pink Street")],
      });
    });
    await t.action(internal.placePins.locateItem, { itemId });
    expect(queries()).toEqual(["Pink Street, Lisbon"]);
    expect(await pins()).toHaveLength(1);
  });

  it("a steered space intent schedules the lookup", async () => {
    await withMaps();
    const { t, itemId, pins } = await setup([]);
    const spaceId = await t.run(async (ctx) => {
      const item = (await ctx.db.get(itemId))!;
      const spaceId = await ctx.db.insert("spaces", {
        userId: item.userId,
        name: "Trip",
        dynamic: false,
      });
      await ctx.db.insert("spaceItems", {
        userId: item.userId,
        spaceId,
        itemId,
        status: "saved",
      });
      return spaceId;
    });
    vi.useFakeTimers();
    try {
      await t.mutation(internal.spaces.setMembershipIntentsInternal, {
        itemId,
        spaceId,
        intents: [maps("Pink Street")],
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }
    expect(await pins()).toHaveLength(1);
  });

  it("drops a pin whose place came only from a space the save left", async () => {
    const { t, itemId, pins } = await setup([]);
    await t.run(async (ctx) => {
      const item = (await ctx.db.get(itemId))!;
      const spaceId = await ctx.db.insert("spaces", {
        userId: item.userId,
        name: "Trip",
        dynamic: false,
      });
      await ctx.db.insert("spaceItems", {
        userId: item.userId,
        spaceId,
        itemId,
        status: "saved",
        intents: [maps("Pink Street")],
      });
      await ctx.db.patch(itemId, {
        placePins: [{ name: "Pink Street", lat: 1, lng: 1 }],
      });
    });
    vi.useFakeTimers();
    try {
      await t.run(async (ctx) => {
        const row = await ctx.db
          .query("spaceItems")
          .withIndex("by_item", (q) => q.eq("itemId", itemId))
          .unique();
        await deleteMembership(ctx, row!);
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }
    expect(await pins()).toEqual([]);
  });

  it("adds a restored save's missing pin and keeps a pin it no longer names", async () => {
    const { queries } = await withMaps();
    const { t, itemId, pins } = await setup([], { read: ["Luna Tacos"] });
    const stray = { name: "Time Out Market", lat: 17, lng: -17 };
    await t.run((ctx) =>
      ctx.db.patch(itemId, {
        status: "processing",
        enrichment: "partial",
        processingRunId: "run-1",
        placePins: [stray],
      }),
    );
    vi.useFakeTimers();
    try {
      await t.mutation(internal.items.failItem, {
        itemId,
        reason: "error",
        runId: "run-1",
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }
    expect(queries()).toEqual(["Luna Tacos, Lisbon"]);
    expect((await pins())?.map((pin) => pin.name)).toEqual([
      "Time Out Market",
      "Luna Tacos",
    ]);
  });

  it("makes no Apple call for a restored save with nothing to look up", async () => {
    const { queries } = await withMaps();
    const { t, itemId, pins } = await setup([]);
    const stray = { name: "Time Out Market", lat: 17, lng: -17 };
    await t.run((ctx) =>
      ctx.db.patch(itemId, {
        status: "processing",
        enrichment: "partial",
        processingRunId: "run-1",
        placePins: [stray],
      }),
    );
    vi.useFakeTimers();
    try {
      await t.mutation(internal.items.failItem, {
        itemId,
        reason: "not_found",
        runId: "run-1",
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }
    expect(queries()).toEqual([]);
    expect(await pins()).toEqual([stray]);
  });

  it("backfill queues only ready saves that name a place and have no pins", async () => {
    await withMaps();
    const { t, itemId } = await setup(["Pink Street"]);
    const other: Id<"items"> = await t.run(async (ctx) => {
      const item = (await ctx.db.get(itemId))!;
      return await ctx.db.insert("items", {
        userId: item.userId,
        type: "note",
        status: "ready",
        tags: [],
        searchText: "",
      });
    });
    vi.useFakeTimers();
    try {
      await t.mutation(internal.placePins.backfillPage, { cursor: null });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }
    const rows = await t.run(async (ctx) => [
      (await ctx.db.get(itemId))?.placePins ?? null,
      (await ctx.db.get(other))?.placePins ?? null,
    ]);
    expect(rows[0]).toHaveLength(1);
    expect(rows[1]).toBeNull();
  });

  it("backfill refreshes a located pin that has no category yet", async () => {
    await withMaps(true);
    const { t, itemId, pins } = await setup(["Micho"]);
    await t.run(async (ctx) =>
      ctx.db.patch(itemId, {
        placePins: [{ name: "Micho", lat: 13, lng: -13, city: "Lisbon" }],
      }),
    );
    vi.useFakeTimers();
    try {
      await t.mutation(internal.placePins.backfillPage, { cursor: null });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }
    expect((await pins())?.[0].category).toBe("Cafe");
  });
});

describe("identifyPins", () => {
  async function appleAnswers(at: Record<string, [number, number]>) {
    vi.stubEnv("APPLE_MAPS_PRIVATE_KEY", await testKey());
    vi.stubEnv("APPLE_MAPS_KEY_ID", "KEY1");
    vi.stubEnv("APPLE_MAPS_TEAM_ID", "TEAM1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        const url = new URL(input);
        if (url.pathname === "/v1/token") {
          return Response.json({ accessToken: "maps", expiresInSeconds: 1800 });
        }
        const q = url.searchParams.get("q") ?? "";
        const point = at[q];
        return Response.json({
          results: point
            ? [
                {
                  id: `ID-${q}`,
                  poiCategory: "Restaurant",
                  coordinate: { latitude: point[0], longitude: point[1] },
                },
              ]
            : [],
        });
      }),
    );
  }

  it("names a list pin from a match at its spot without moving it, and ignores a namesake elsewhere", async () => {
    await appleAnswers({
      Savoy: [35.65492, 139.73661],
      "Marcy Land": [35.6745, 139.7307],
    });
    const { t, itemId, pins } = await setup([], {
      read: ["Savoy", "Marcy Land"],
    });
    const listed = [
      { name: "Savoy", lat: 35.6548, lng: 139.7364, city: "Lisbon" },
      { name: "Marcy Land", lat: 35.6655, lng: 139.7088, city: "Lisbon" },
    ];
    await t.run((ctx) => ctx.db.patch(itemId, { placePins: listed }));
    await t.action(internal.placePins.identifyPins, { itemId });
    expect(await pins()).toEqual([
      {
        ...listed[0],
        appleId: "ID-Savoy",
        category: "Restaurant",
      },
      listed[1],
    ]);
  });
});
