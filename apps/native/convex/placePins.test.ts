// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { newConvexTest } from "./test.setup";

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
  options: { declined?: boolean; pins?: boolean } = {},
) {
  const t = newConvexTest();
  const itemId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {});
    if (options.declined) {
      await ctx.db.insert("aiConsents", {
        userId,
        status: "declined",
        version: 1,
        updatedAt: Date.now(),
      });
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

  it("keeps at most five pins", async () => {
    const names = ["A1", "B2", "C3", "D4", "E5", "F6", "G7"];
    const { t, itemId, pins } = await setup(names);
    await t.mutation(internal.placePins.storePins, {
      itemId,
      found: names.map((name) => ({ name, lat: 1, lng: 1 })),
    });
    expect(await pins()).toHaveLength(5);
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
