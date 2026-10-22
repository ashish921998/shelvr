// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { newConvexTest } from "./test.setup";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const generateObject = vi.hoisted(() => vi.fn());

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

async function setup(
  saves: Save[],
  options: { pro?: boolean; consent?: "declined" } = {},
) {
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
    if (options.consent) {
      await ctx.db.insert("aiConsents", {
        userId,
        status: options.consent,
        version: 1,
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
  return (generateObject.mock.calls[call]![0] as { prompt: string }).prompt;
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
      wishlist: [],
    });
    expect(trip?.days).toHaveLength(1);
    expect(trip?.days[0]!.gaps).toEqual(["lunch"]);
    expect(trip?.days[0]!.stops).toEqual([
      {
        itemId: itemIds[0]!,
        name: "Pastéis de Belém",
        area: "Belém",
        why: "The custard tarts",
        slot: "morning",
        creator: "@lisboaeats",
      },
      {
        itemId: itemIds[2],
        name: "Taberna da Rua das Flores",
        why: "Petiscos",
        slot: "dinner",
      },
    ]);
  });

  it("plans up to 15 days, and holds a longer ask to 15", async () => {
    const { t, spaceId } = await setup(LISBON_SAVES);
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
        ],
      },
    });

    await t.action(api.trips.makeTrip, { spaceId, days: 12, pace: "easy" });
    expect(promptOf(0)).toContain("12 days in Lisbon");
    await t.action(api.trips.makeTrip, { spaceId, days: 40, pace: "easy" });
    expect(promptOf(1)).toContain("15 days in Lisbon");
    const trip = await t.query(api.tripData.getSpaceTrip, { spaceId });
    expect(trip?.days).toHaveLength(15);
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
          : { latitude: 41.1579, longitude: -8.6291 };
      return Response.json({
        results: [{ coordinate }],
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
    const [tarts, taberna] = trip?.days[0]!.stops ?? [];
    expect(tarts!.lat).toBe(38.6975);
    expect(taberna!.lat).toBeUndefined();
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
    expect(trips[0]!.pace).toBe("packed");
  });

  it('shows a stop\'s current "We went" mark, not the one it was made with', async () => {
    const { t, spaceId, itemIds } = await setup(LISBON_SAVES);
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
    const stopOf = async () =>
      (await t.query(api.tripData.getSpaceTrip, { spaceId }))?.days[0]!
        .stops[0];
    expect((await stopOf())?.been).toBeUndefined();

    const mark = (visited: boolean) =>
      t.mutation(api.placeVisits.setVisited, {
        itemId: itemIds[1]!,
        name: "Park",
        visited,
      });
    await mark(true);
    expect((await stopOf())?.been).toBe(true);
    await mark(false);
    expect((await stopOf())?.been).toBeUndefined();
  });

  it("drops a stop whose save was removed or deleted, and shows a link's image", async () => {
    const { t, base, spaceId, itemIds } = await setup(LISBON_SAVES);
    await base.run((ctx) =>
      ctx.db.patch(itemIds[0]!, { heroImageUrl: "https://example.com/a.jpg" }),
    );
    const pick = (
      saveNumber: number,
      name: string,
      area: string,
      slot: string,
    ) => ({
      saveNumber,
      name,
      area,
      why: "Go",
      slot,
    });
    generateObject.mockResolvedValue({
      object: {
        places: [
          pick(3, "Pastéis de Belém", "Belém", "lunch"),
          pick(2, "Park", "Chiado", "dinner"),
          pick(1, "Taberna da Rua das Flores", "Chiado", "afternoon"),
        ],
      },
    });
    await t.action(api.trips.makeTrip, { spaceId, days: 1, pace: "easy" });
    const before = await t.query(api.tripData.getSpaceTrip, { spaceId });
    const first = before?.days[0]!.stops.find((s) => s.itemId === itemIds[0]);
    expect(first?.cover).toBe("https://example.com/a.jpg");
    expect(before?.days[0]).toMatchObject({
      areas: ["Belém"],
      gaps: [],
    });

    await t.mutation(api.spaces.removeItemFromSpace, {
      itemId: itemIds[0]!,
      spaceId,
    });

    const after = await t.query(api.tripData.getSpaceTrip, { spaceId });
    expect(after?.days[0]!.stops.map((s) => s.itemId)).not.toContain(
      itemIds[0],
    );
    expect(after?.days[0]!.stops).toHaveLength(2);
    expect(after?.days[0]).toMatchObject({ areas: [], gaps: ["lunch"] });

    await base.run((ctx) => ctx.db.delete(itemIds[1]!));
    const deleted = await t.query(api.tripData.getSpaceTrip, { spaceId });
    expect(deleted?.days[0]!.stops.map((s) => s.name)).toEqual([
      "Taberna da Rua das Flores",
    ]);
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
    const seeded = await setup([
      ...LISBON_SAVES,
      { title: "Lost In esplanada for the view" },
    ]);
    const { t, spaceId } = seeded;
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
    const { tripId } = await t.action(api.trips.makeTrip, {
      spaceId,
      days: 1,
      pace: "easy",
    });
    if (tripId === null) throw new Error("no trip");

    const park = (await t.query(api.tripData.getSpaceTrip, { spaceId }))
      ?.days[0]!.stops[2];
    if (!park) throw new Error("no stop");
    const replacement = await t.mutation(api.tripData.swapTripStop, {
      tripId,
      itemId: park.itemId,
      name: park.name,
    });

    const trip = await t.query(api.tripData.getSpaceTrip, { spaceId });
    expect(replacement).toMatchObject({ name: "Lost In" });
    expect(trip?.days[0]!.stops.map((s) => s.name)).toEqual([
      "Pastéis de Belém",
      "Taberna da Rua das Flores",
      "Lost In",
    ]);
    expect(trip?.wishlist.map((s) => s.name)).toEqual(["Park"]);
    await expect(
      t.mutation(api.tripData.swapTripStop, {
        tripId,
        itemId: park.itemId,
        name: "Not on the trip",
      }),
    ).rejects.toMatchObject({ data: { code: "nothing_to_swap" } });
    const { base } = seeded;
    const lostIn = trip?.days[0]!.stops[2];
    if (!lostIn) throw new Error("no stop");
    await base.run((ctx) => ctx.db.delete(park.itemId));
    await expect(
      t.mutation(api.tripData.swapTripStop, {
        tripId,
        itemId: lostIn.itemId,
        name: lostIn.name,
      }),
    ).rejects.toMatchObject({ data: { code: "nothing_to_swap" } });
  });

  it("requires Pro", async () => {
    const { t, spaceId } = await setup(LISBON_SAVES, { pro: false });

    await expect(
      t.action(api.trips.makeTrip, { spaceId, days: 2, pace: "easy" }),
    ).rejects.toMatchObject({ data: { code: "pro_required" } });
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("sends nothing after the user declined AI processing", async () => {
    const { t, spaceId } = await setup(LISBON_SAVES, { consent: "declined" });

    await expect(
      t.action(api.trips.makeTrip, { spaceId, days: 2, pace: "easy" }),
    ).rejects.toMatchObject({ data: { code: "ai_consent_required" } });
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
