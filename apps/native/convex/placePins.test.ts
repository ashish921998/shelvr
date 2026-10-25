// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";

import { internal } from "./_generated/api";
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

async function withMaps() {
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
      results: [{ coordinate: { latitude: q.length, longitude: -q.length } }],
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

  it("keeps city context for multi-city saves without imposing one search centre", async () => {
    const { t, itemId } = await setup(["Lisbon", "Porto", "Faro"]);
    await t.run(async (ctx) =>
      ctx.db.patch(itemId, { cities: ["Lisbon", "Porto", "Faro"] }),
    );
    const todo = await t.query(internal.placePins.toLocate, { itemId });
    expect(todo?.city).toBe("Lisbon");
    expect(todo?.singleCity).toBe(false);
    expect(todo?.centre).toBeNull();
    expect(todo?.names).toHaveLength(3);
  });
  it("refreshes an existing pin instead of keeping its old coordinates", async () => {
    await withMaps();
    const { t, itemId, pins } = await setup(["Micho"], { pins: true });
    await t.action(internal.placePins.locateItem, { itemId, refresh: true });
    expect(await pins()).toEqual([{ name: "Micho", lat: 13, lng: -13 }]);
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
    expect(await pins()).toEqual([{ name: "Pink Street", lat: 2, lng: 2 }]);
  });

  it("drops a pin far from the save's other places, a same-named place elsewhere", async () => {
    const names = ["PNY", "Blend", "Bomaye", "Micho"];
    const { t, itemId, pins } = await setup(names);
    await t.mutation(internal.placePins.storePins, {
      itemId,
      found: [
        { name: "PNY", lat: 48.8638, lng: 2.3627 },
        { name: "Blend", lat: 48.8685, lng: 2.3256 },
        { name: "Bomaye", lat: 48.8748, lng: 2.3539 },
        { name: "Micho", lat: 43.7858, lng: -85.5028 },
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
      "Majestic",
      "Faro Marina",
    ]);
    await t.run(async (ctx) => {
      await ctx.db.patch(itemId, { cities: ["Lisbon", "Porto", "Faro"] });
    });
    await t.mutation(internal.placePins.storePins, {
      itemId,
      found: [
        { name: "Time Out", lat: 38.707, lng: -9.1457 },
        { name: "Majestic", lat: 41.1468, lng: -8.6066 },
        { name: "Faro Marina", lat: 37.0144, lng: -7.9351 },
      ],
    });
    expect(await pins()).toHaveLength(3);
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

  it("keeps at most five pins", async () => {
    const names = ["A1", "B2", "C3", "D4", "E5", "F6", "G7"];
    const { t, itemId, pins } = await setup(names);
    await t.mutation(internal.placePins.storePins, {
      itemId,
      found: names.map((name) => ({ name, lat: 1, lng: 1 })),
    });
    expect(await pins()).toHaveLength(5);
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

  it("does not look up places once five are already pinned", async () => {
    const { queries } = await withMaps();
    const names = ["A1", "B2", "C3", "D4", "E5", "F6", "G7"];
    const { t, itemId } = await setup(names);
    await t.run(async (ctx) =>
      ctx.db.patch(itemId, {
        placePins: names.slice(0, 5).map((name) => ({ name, lat: 1, lng: 1 })),
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
});
