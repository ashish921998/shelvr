// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { newConvexTest } from "./test.setup";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const generateObject = vi.hoisted(() => vi.fn());

// Only the provider call is replaced. `ai.ts` builds its language model at
// import, so wrapLanguageModel is stubbed as well.
vi.mock("ai", () => ({
  embedMany: vi.fn(),
  generateObject,
  wrapLanguageModel: vi.fn(() => ({})),
}));

type Save = {
  title: string;
  content?: string;
  cities?: string[];
  author?: string;
};

async function setup(saves: Save[], options: { pro?: boolean } = {}) {
  const base = newConvexTest();
  const seeded = await base.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {});
    if (options.pro !== false) {
      await ctx.db.insert("subscriptions", {
        userId,
        status: "pro",
        expiresAt: Date.now() + 60_000,
        updatedAt: Date.now(),
      });
    }
    const spaceId = await ctx.db.insert("spaces", {
      userId,
      name: "Lisbon trip",
      dynamic: false,
    });
    const itemIds: Id<"items">[] = [];
    for (const save of saves) {
      const itemId = await ctx.db.insert("items", {
        userId,
        type: "link",
        status: "ready",
        title: save.title,
        content: save.content,
        cities: save.cities,
        author: save.author,
        url: "https://www.tiktok.com/@someone/video/1",
        tags: [],
        searchText: save.title,
      });
      await ctx.db.insert("spaceItems", {
        userId,
        spaceId,
        itemId,
        status: "saved",
      });
      itemIds.push(itemId);
    }
    return { userId, spaceId, itemIds };
  });
  const t = base.withIdentity({ subject: `${seeded.userId}|session-1` });
  return { base, t, ...seeded };
}

function promptOf(call = 0): string {
  return (generateObject.mock.calls[call][0] as { prompt: string }).prompt;
}

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

// Saves are numbered newest filed first in the prompt.
const LISBON_SAVES: Save[] = [
  {
    title: "Pastéis de Belém, the original custard tarts",
    cities: ["Lisbon"],
    author: "@lisboaeats",
  },
  { title: "Sunset drinks at Park bar", cities: ["Lisbon"] },
  { title: "Taberna da Rua das Flores for dinner", cities: ["lisbon"] },
];

beforeEach(() => {
  generateObject.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("makeTrip", () => {
  it("lays the places the saves name out as days, and stores the trip", async () => {
    const { t, spaceId, itemIds } = await setup(LISBON_SAVES);
    generateObject.mockResolvedValue({
      object: {
        places: [
          {
            saveNumber: 3,
            name: "Pastéis de Belém",
            area: "Belém",
            why: "The custard tarts",
            slot: "morning",
          },
          {
            saveNumber: 1,
            name: "Taberna da Rua das Flores",
            area: "Chiado",
            why: "Petiscos",
            slot: "dinner",
          },
          // Invented: no save names it.
          {
            saveNumber: 2,
            name: "Time Out Market",
            area: "",
            why: "Food hall",
            slot: "lunch",
          },
        ],
      },
    });

    const result = await t.action(api.trips.makeTrip, {
      spaceId,
      days: 1,
      pace: "balanced",
      startDate: "2026-11-03",
    });

    expect(result.considered).toBe(3);
    expect(result.tripId).not.toBeNull();
    expect(promptOf()).toContain("1 day in Lisbon");
    const trip = await t.query(api.tripData.getSpaceTrip, { spaceId });
    expect(trip).toMatchObject({
      city: "Lisbon",
      pace: "balanced",
      startDate: "2026-11-03",
      considered: 3,
      wishlist: [],
    });
    expect(trip?.locatedAt).toBeUndefined();
    expect(trip?.days).toHaveLength(1);
    expect(trip?.days[0].gaps).toEqual(["lunch"]);
    expect(trip?.days[0].stops).toEqual([
      {
        itemId: itemIds[0],
        name: "Pastéis de Belém",
        area: "Belém",
        why: "The custard tarts",
        slot: "morning",
        creator: "@lisboaeats",
        url: "https://www.tiktok.com/@someone/video/1",
      },
      {
        itemId: itemIds[2],
        // An area the save never says is dropped, as in a plan.
        name: "Taberna da Rua das Flores",
        why: "Petiscos",
        slot: "dinner",
        url: "https://www.tiktok.com/@someone/video/1",
      },
    ]);
  });

  it("pins stops with Apple Maps when the key is set", async () => {
    vi.stubEnv("APPLE_MAPS_PRIVATE_KEY", await testKey());
    vi.stubEnv("APPLE_MAPS_KEY_ID", "KEY1");
    vi.stubEnv("APPLE_MAPS_TEAM_ID", "TEAM1");
    const fetchMock = vi.fn(async (input: string) => {
      const url = new URL(input);
      if (url.pathname === "/v1/token") {
        return Response.json({ accessToken: "maps", expiresInSeconds: 1800 });
      }
      const q = url.searchParams.get("q") ?? "";
      const coordinate = q.startsWith("Pastéis")
        ? { latitude: 38.6975, longitude: -9.2032 }
        : q === "Lisbon"
          ? { latitude: 38.7223, longitude: -9.1393 }
          : // The same name in Porto: dropped as another city.
            { latitude: 41.1579, longitude: -8.6291 };
      return Response.json({
        results: [{ coordinate, formattedAddressLines: ["Somewhere"] }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { t, spaceId } = await setup(LISBON_SAVES);
    generateObject.mockResolvedValue({
      object: {
        places: [
          {
            saveNumber: 3,
            name: "Pastéis de Belém",
            area: "Belém",
            why: "Tarts",
            slot: "morning",
          },
          {
            saveNumber: 1,
            name: "Taberna da Rua das Flores",
            area: "",
            why: "Petiscos",
            slot: "dinner",
          },
        ],
      },
    });

    await t.action(api.trips.makeTrip, { spaceId, days: 1, pace: "easy" });

    const trip = await t.query(api.tripData.getSpaceTrip, { spaceId });
    expect(trip?.locatedAt).toEqual(expect.any(Number));
    const [tarts, taberna] = trip?.days[0].stops ?? [];
    expect(tarts).toMatchObject({ lat: 38.6975, address: "Somewhere" });
    expect(taberna.lat).toBeUndefined();
    const queries = fetchMock.mock.calls.map(([input]) =>
      new URL(input).searchParams.get("q"),
    );
    expect(queries).toContain("Pastéis de Belém, Belém, Lisbon");
  });

  it("reads only the chosen city's saves, and saves that name no city", async () => {
    const { t, spaceId } = await setup([
      { title: "Porto francesinha spot", cities: ["Porto"] },
      { title: "A rooftop with no city named" },
      ...LISBON_SAVES,
    ]);
    generateObject.mockResolvedValue({ object: { places: [] } });

    expect(await t.query(api.tripData.tripCities, { spaceId })).toEqual([
      { city: "Lisbon", count: 3 },
      { city: "Porto", count: 1 },
    ]);
    const result = await t.action(api.trips.makeTrip, {
      spaceId,
      city: "lisbon",
      days: 2,
      pace: "easy",
    });

    expect(result).toEqual({ tripId: null, considered: 4 });
    expect(promptOf()).toContain("A rooftop with no city named");
    expect(promptOf()).not.toContain("Porto francesinha");
  });

  it("replaces the space's last trip", async () => {
    const { t, base, spaceId } = await setup(LISBON_SAVES);
    generateObject.mockResolvedValue({
      object: {
        places: [
          {
            saveNumber: 2,
            name: "Park",
            area: "",
            why: "Sunset",
            slot: "evening",
          },
        ],
      },
    });

    await t.action(api.trips.makeTrip, { spaceId, days: 1, pace: "easy" });
    const { tripId } = await t.action(api.trips.makeTrip, {
      spaceId,
      days: 2,
      pace: "packed",
    });

    const trips = await base.run((ctx) =>
      ctx.db
        .query("trips")
        .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
        .collect(),
    );
    expect(trips.map((trip) => trip._id)).toEqual([tripId]);
    expect(trips[0].pace).toBe("packed");
  });

  it("drops a stop whose save was deleted", async () => {
    const { t, base, spaceId, itemIds } = await setup(LISBON_SAVES);
    generateObject.mockResolvedValue({
      object: {
        places: [
          {
            saveNumber: 2,
            name: "Park",
            area: "",
            why: "Sunset",
            slot: "evening",
          },
        ],
      },
    });
    await t.action(api.trips.makeTrip, { spaceId, days: 1, pace: "easy" });
    await base.run((ctx) => ctx.db.delete(itemIds[1]));

    const trip = await t.query(api.tripData.getSpaceTrip, { spaceId });
    expect(trip?.days[0].stops).toEqual([]);
  });

  it("is removed with its space", async () => {
    const { t, base, spaceId } = await setup(LISBON_SAVES);
    generateObject.mockResolvedValue({
      object: {
        places: [
          {
            saveNumber: 2,
            name: "Park",
            area: "",
            why: "Sunset",
            slot: "evening",
          },
        ],
      },
    });
    await t.action(api.trips.makeTrip, { spaceId, days: 1, pace: "easy" });

    await t.mutation(api.spaces.deleteSpace, { id: spaceId });

    expect(await base.run((ctx) => ctx.db.query("trips").collect())).toEqual(
      [],
    );
  });

  it("swaps a stop for a wishlist place, and says when none is left", async () => {
    const { t, spaceId } = await setup([
      ...LISBON_SAVES,
      { title: "Lost In esplanada for the view" },
    ]);
    // Newest filed first: Lost In 1, Taberna 2, Park 3, Pastéis 4.
    const pick = (saveNumber: number, name: string, slot: string) => ({
      saveNumber,
      name,
      area: "",
      why: "Go",
      slot,
    });
    generateObject.mockResolvedValue({
      object: {
        places: [
          pick(4, "Pastéis de Belém", "morning"),
          pick(2, "Taberna da Rua das Flores", "dinner"),
          pick(3, "Park", "evening"),
          pick(1, "Lost In", "evening"),
        ],
      },
    });
    // An easy day holds three stops, so Lost In waits on the wishlist.
    const { tripId } = await t.action(api.trips.makeTrip, {
      spaceId,
      days: 1,
      pace: "easy",
    });
    if (tripId === null) throw new Error("no trip");

    await t.mutation(api.tripData.swapTripStop, { tripId, day: 0, stop: 2 });

    const trip = await t.query(api.tripData.getSpaceTrip, { spaceId });
    expect(trip?.days[0].stops.map((s) => s.name)).toEqual([
      "Pastéis de Belém",
      "Taberna da Rua das Flores",
      "Lost In",
    ]);
    expect(trip?.wishlist.map((s) => s.name)).toEqual(["Park"]);
    await expect(
      t.mutation(api.tripData.swapTripStop, { tripId, day: 0, stop: 9 }),
    ).rejects.toMatchObject({ data: { code: "nothing_to_swap" } });
  });

  it("requires Pro", async () => {
    const { t, spaceId } = await setup(LISBON_SAVES, { pro: false });

    await expect(
      t.action(api.trips.makeTrip, { spaceId, days: 2, pace: "easy" }),
    ).rejects.toMatchObject({ data: { code: "pro_required" } });
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("does not show another user's trip", async () => {
    const { base, spaceId } = await setup(LISBON_SAVES);
    const strangerId = await base.run((ctx) => ctx.db.insert("users", {}));
    const stranger = base.withIdentity({ subject: `${strangerId}|s` });

    expect(
      await stranger.query(api.tripData.getSpaceTrip, { spaceId }),
    ).toBeNull();
    expect(await stranger.query(api.tripData.tripCities, { spaceId })).toEqual(
      [],
    );
  });
});
