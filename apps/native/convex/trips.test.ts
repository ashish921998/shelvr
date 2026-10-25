// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  newConvexTest,
  insertConsentingUser,
  setTestConsent,
} from "./test.setup";
import { api, internal } from "./_generated/api";
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
  places?: string[];
};

async function setup(
  saves: Save[],
  options: { pro?: boolean; consent?: "declined" } = {},
) {
  const base = newConvexTest();
  const seeded = await base.run(async (ctx) => {
    const userId = await insertConsentingUser(ctx);
    if (options.pro !== false) {
      await ctx.db.insert("subscriptions", {
        userId,
        status: "pro",
        expiresAt: Date.now() + 60_000,
        updatedAt: Date.now(),
      });
    }
    if (options.consent) {
      await setTestConsent(ctx, userId, options.consent);
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
        places: save.places,
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
    title: "Original tarts",
    cities: ["Lisbon"],
    places: ["Pastéis de Belém, Belém"],
    author: "@lisboaeats",
  },
  { title: "Sunset drinks", cities: ["Lisbon"], places: ["Park"] },
  {
    title: "Dinner",
    cities: ["lisbon"],
    places: ["Taberna da Rua das Flores"],
  },
];

beforeEach(() => {
  generateObject
    .mockReset()
    .mockRejectedValue(new Error("Planning must not call AI"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("makeTrip without AI", () => {
  it("builds days from saved places and keeps creator attribution", async () => {
    const { t, spaceId } = await setup(LISBON_SAVES);
    await t.action(api.trips.makeTrip, {
      spaceId,
      city: "Lisbon",
      days: 2,
      pace: "easy",
      startDate: "2026-11-03",
    });
    const trip = await t.query(api.tripData.getSpaceTrip, { spaceId });
    expect(trip).toMatchObject({
      city: "Lisbon",
      pace: "easy",
      startDate: "2026-11-03",
    });
    expect(trip?.days).toHaveLength(2);
    const stops = trip!.days.flatMap((day) => day.stops);
    expect(stops.map((s) => s.name).sort()).toEqual([
      "Park",
      "Pastéis de Belém",
      "Taberna da Rua das Flores",
    ]);
    expect(stops.find((s) => s.name === "Pastéis de Belém")?.creator).toBe(
      "@lisboaeats",
    );
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("supports up to 15 days without a model call", async () => {
    const { t, spaceId } = await setup(LISBON_SAVES);
    await t.action(api.trips.makeTrip, { spaceId, days: 50, pace: "easy" });
    expect(
      (await t.query(api.tripData.getSpaceTrip, { spaceId }))?.days,
    ).toHaveLength(15);
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("excludes visits and keeps the old trip when no fresh places remain", async () => {
    const { t, spaceId, itemIds } = await setup([
      { title: "One place", cities: ["Lisbon"], places: ["Taberna"] },
    ]);
    const old = await t.action(api.trips.makeTrip, {
      spaceId,
      days: 1,
      pace: "easy",
    });
    await t.mutation(api.placeVisits.setVisited, {
      itemId: itemIds[0],
      name: "Taberna",
      visited: true,
    });
    expect(
      await t.action(api.trips.makeTrip, { spaceId, days: 1, pace: "easy" }),
    ).toEqual({ tripId: null, considered: 1 });
    expect((await t.query(api.tripData.getSpaceTrip, { spaceId }))?._id).toBe(
      old.tripId,
    );
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("uses only the requested city's saves, including saves outside the supplied space", async () => {
    const { t, base, spaceId, itemIds } = await setup([
      ...LISBON_SAVES,
      { title: "Other city", cities: ["Porto"], places: ["Porto Cafe"] },
      { title: "Unknown city", places: ["Unknown Cafe"] },
    ]);
    await base.run(async (ctx) => {
      const joins = await ctx.db
        .query("spaceItems")
        .withIndex("by_item", (q) => q.eq("itemId", itemIds[0]))
        .collect();
      for (const join of joins) await ctx.db.delete(join._id);
    });
    const result = await t.action(api.trips.makeTrip, {
      spaceId,
      city: "Lisbon",
      days: 1,
      pace: "easy",
    });
    expect(result.considered).toBe(3);
    const stored = await t.query(api.tripData.getSpaceTrip, { spaceId });
    expect(
      stored?.days.flatMap((day) => day.stops.map((s) => s.name)).sort(),
    ).toEqual(["Park", "Pastéis de Belém", "Taberna da Rua das Flores"]);
  });

  it("allows planning from existing saved places with AI disabled", async () => {
    const { t, spaceId } = await setup(LISBON_SAVES, { consent: "declined" });
    expect(
      (await t.action(api.trips.makeTrip, { spaceId, days: 1, pace: "easy" }))
        .tripId,
    ).not.toBeNull();
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("replaces old trips and excludes visited wishlist stops when swapping", async () => {
    const { t, spaceId } = await setup([
      {
        title: "Places",
        cities: ["Lisbon"],
        places: ["Place A", "Place B", "Place C", "Place D"],
      },
    ]);
    const old = await t.action(api.trips.makeTrip, {
      spaceId,
      days: 1,
      pace: "easy",
    });
    const next = await t.action(api.trips.makeTrip, {
      spaceId,
      days: 1,
      pace: "easy",
    });
    expect(next.tripId).not.toBe(old.tripId);
    const trip = (await t.query(api.tripData.getSpaceTrip, { spaceId }))!;
    expect(trip.wishlist).toHaveLength(1);
    const reserve = trip.wishlist[0];
    const stop = trip.days[0].stops[0];
    await t.mutation(api.placeVisits.setVisited, {
      itemId: reserve.itemId,
      name: reserve.name,
      visited: true,
    });
    await expect(
      t.mutation(api.tripData.swapTripStop, {
        tripId: trip._id,
        itemId: stop.itemId,
        name: stop.name,
      }),
    ).rejects.toMatchObject({ data: { code: "nothing_to_swap" } });
    await t.mutation(api.placeVisits.setVisited, {
      itemId: reserve.itemId,
      name: reserve.name,
      visited: false,
    });
    expect(
      (
        await t.mutation(api.tripData.swapTripStop, {
          tripId: trip._id,
          itemId: stop.itemId,
          name: stop.name,
        })
      ).name,
    ).toBe(reserve.name);
  });

  it("still requires Pro and ownership", async () => {
    const { base, t, spaceId } = await setup(LISBON_SAVES, { pro: false });
    await expect(
      t.action(api.trips.makeTrip, { spaceId, days: 1, pace: "easy" }),
    ).rejects.toMatchObject({ data: { code: "pro_required" } });
    const stranger = await base.run((ctx) => insertConsentingUser(ctx));
    const other = base.withIdentity({ subject: `${stranger}|session-1` });
    await expect(
      other.action(api.trips.makeTrip, { spaceId, days: 1, pace: "easy" }),
    ).rejects.toThrow("Space not found");
    expect(
      await other.query(api.tripData.getSpaceTrip, { spaceId }),
    ).toBeNull();
    expect(generateObject).not.toHaveBeenCalled();
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

    await t.action(api.trips.makeTrip, { spaceId, days: 1, pace: "easy" });

    const trip = await t.query(api.tripData.getSpaceTrip, { spaceId });
    const tarts = trip?.days[0].stops.find(
      (s) => s.name === "Pastéis de Belém",
    )!;
    const taberna = trip?.days[0].stops.find(
      (s) => s.name === "Taberna da Rua das Flores",
    )!;
    expect(tarts.lat).toBe(38.6975);
    expect(taberna.lat).toBeUndefined();
    const queries = fetchMock.mock.calls.map(([input]) =>
      new URL(input).searchParams.get("q"),
    );
    expect(queries).toContain("Pastéis de Belém, Belém, Lisbon");
  });

  it("reuses the save's map pins and centres the search on them, not on a namesake city", async () => {
    vi.stubEnv("APPLE_MAPS_PRIVATE_KEY", await testKey());
    vi.stubEnv("APPLE_MAPS_KEY_ID", "KEY1");
    vi.stubEnv("APPLE_MAPS_TEAM_ID", "TEAM1");
    const fetchMock = vi.fn(async (input: string) => {
      const url = new URL(input);
      if (url.pathname === "/v1/token") {
        return Response.json({ accessToken: "maps", expiresInSeconds: 1800 });
      }
      // A bare "Amsterdam" resolves to Amsterdam, New York.
      const coordinate =
        url.pathname === "/v1/geocode"
          ? { latitude: 42.9387, longitude: -74.1882 }
          : { latitude: 52.3752, longitude: 4.8841 };
      return Response.json({ results: [{ coordinate }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { base, t, spaceId, itemIds } = await setup([
      {
        title: "Amsterdam museums",
        cities: ["Amsterdam"],
        places: ["Rijksmuseum", "Anne Frank House"],
      },
    ]);
    await base.run(async (ctx) => {
      await ctx.db.patch(itemIds[0], {
        placePins: [{ name: "Rijksmuseum", lat: 52.36, lng: 4.8854 }],
      });
    });

    await t.action(api.trips.makeTrip, {
      spaceId,
      city: "Amsterdam",
      days: 1,
      pace: "easy",
    });

    const trip = await t.query(api.tripData.getSpaceTrip, { spaceId });
    const museum = trip?.days[0].stops.find((s) => s.name === "Rijksmuseum")!;
    const house = trip?.days[0].stops.find(
      (s) => s.name === "Anne Frank House",
    )!;
    expect([museum.lat, museum.lng]).toEqual([52.36, 4.8854]);
    expect(house.lat).toBe(52.3752);
    const looked = fetchMock.mock.calls
      .map(([input]) => new URL(input))
      .filter((url) => url.pathname !== "/v1/token");
    expect(looked.map((url) => url.pathname)).toEqual(["/v1/search"]);
    expect(looked[0].searchParams.get("q")).toBe("Anne Frank House, Amsterdam");
    expect(looked[0].searchParams.get("searchLocation")).toBe("52.36,4.8854");
  });

  it("keeps a stop's saved pin when another stop needs a search", async () => {
    vi.stubEnv("APPLE_MAPS_PRIVATE_KEY", await testKey());
    vi.stubEnv("APPLE_MAPS_KEY_ID", "KEY1");
    vi.stubEnv("APPLE_MAPS_TEAM_ID", "TEAM1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) =>
        new URL(input).pathname === "/v1/token"
          ? Response.json({ accessToken: "maps", expiresInSeconds: 1800 })
          : Response.json({
              results: [{ coordinate: { latitude: 48.86, longitude: 2.35 } }],
            }),
      ),
    );
    const { base, t, spaceId, itemIds } = await setup([
      {
        title: "Two cities",
        cities: ["Paris"],
        places: ["Here", "There", "New"],
      },
    ]);
    await base.run(async (ctx) => {
      await ctx.db.patch(itemIds[0], {
        placePins: [
          { name: "Here", lat: 48.86, lng: 2.35 },
          { name: "There", lat: 41.9, lng: 12.5 },
        ],
      });
    });

    await t.action(api.trips.makeTrip, {
      spaceId,
      city: "Paris",
      days: 1,
      pace: "easy",
    });

    const trip = await t.query(api.tripData.getSpaceTrip, { spaceId });
    const stops = [...(trip?.days[0].stops ?? []), ...(trip?.wishlist ?? [])];
    expect(stops.find((stop) => stop.name === "There")?.lat).toBe(41.9);
  });

  it("does not reuse an old stray pin far from the trip's other stops", async () => {
    const { base, t, spaceId, itemIds } = await setup([
      {
        title: "Paris eats",
        cities: ["Paris"],
        places: ["PNY", "Blend", "Bomaye", "Micho"],
      },
    ]);
    await base.run(async (ctx) => {
      await ctx.db.patch(itemIds[0], {
        placePins: [
          { name: "PNY", lat: 48.8638, lng: 2.3627 },
          { name: "Blend", lat: 48.8685, lng: 2.3256 },
          { name: "Bomaye", lat: 48.8748, lng: 2.3539 },
          { name: "Micho", lat: 43.7858, lng: -85.5028 },
        ],
      });
    });

    await t.action(api.trips.makeTrip, {
      spaceId,
      city: "Paris",
      days: 1,
      pace: "easy",
    });

    const trip = await t.query(api.tripData.getSpaceTrip, { spaceId });
    const stops = [...(trip?.days[0].stops ?? []), ...(trip?.wishlist ?? [])];
    const micho = stops.find((stop) => stop.name === "Micho");
    expect(micho?.lat).toBeUndefined();
    expect(stops.find((stop) => stop.name === "PNY")?.lat).toBe(48.8638);
  });
});

it("keeps stored city-less stops and wishlist entries when their space membership is saved", async () => {
  const { t, spaceId, itemIds } = await setup([
    { title: "Old stop" },
    { title: "Old reserve" },
  ]);
  const tripId = await t.mutation(internal.tripData.saveTripInternal, {
    spaceId,
    city: "Lisbon",
    pace: "easy",
    days: [
      {
        areas: [],
        gaps: [],
        stops: [
          {
            itemId: itemIds[0],
            name: "Old stop",
            why: "Saved",
            slot: "afternoon",
          },
        ],
      },
    ],
    wishlist: [
      {
        itemId: itemIds[1],
        name: "Old reserve",
        why: "Saved",
        slot: "afternoon",
      },
    ],
  });
  const shown = await t.query(api.tripData.getSpaceTrip, { spaceId });
  expect(shown?.days[0].stops.map((s) => s.name)).toEqual(["Old stop"]);
  expect(shown?.wishlist.map((s) => s.name)).toEqual(["Old reserve"]);
  expect(
    await t.mutation(api.tripData.swapTripStop, {
      tripId,
      itemId: itemIds[0],
      name: "Old stop",
    }),
  ).toEqual({ itemId: itemIds[1], name: "Old reserve" });
});

it("hides dismissed city stops and refuses dismissed wishlist replacements", async () => {
  const { t, spaceId, itemIds } = await setup(LISBON_SAVES);
  const stop = (index: number) => ({
    itemId: itemIds[index],
    name: `Stop ${index}`,
    why: "Saved",
    slot: "afternoon" as const,
  });
  const tripId = await t.mutation(internal.tripData.saveTripInternal, {
    spaceId,
    city: "Lisbon",
    pace: "easy",
    days: [{ areas: [], gaps: [], stops: [stop(0), stop(1)] }],
    wishlist: [stop(2)],
  });
  await t.mutation(api.spaces.removeItemFromSpace, {
    spaceId,
    itemId: itemIds[0],
  });
  await t.mutation(api.spaces.removeItemFromSpace, {
    spaceId,
    itemId: itemIds[2],
  });
  const shown = await t.query(api.tripData.getSpaceTrip, { spaceId });
  expect(shown?.days[0].stops.map((s) => s.itemId)).toEqual([itemIds[1]]);
  expect(shown?.wishlist).toEqual([]);
  await expect(
    t.mutation(api.tripData.swapTripStop, {
      tripId,
      itemId: itemIds[1],
      name: "Stop 1",
    }),
  ).rejects.toMatchObject({ data: { code: "nothing_to_swap" } });
});

it("filters street-only recommendations and folds map-confirmed aliases without changing saved pins", async () => {
  const { base, t, spaceId, itemIds } = await setup([
    {
      title: "Lisbon places",
      cities: ["Lisbon"],
      places: ["80 Spring Street", "Belém Tower", "Torre de Belén"],
    },
  ]);
  const pins = [
    { name: "80 Spring Street", lat: 38.7, lng: -9.2 },
    { name: "Belém Tower", lat: 38.6916, lng: -9.216 },
    { name: "Torre de Belén", lat: 38.6916, lng: -9.216 },
  ];
  await base.run((ctx) => ctx.db.patch(itemIds[0], { placePins: pins }));
  const plan = await t.action(api.plans.makePlan, { spaceId, city: "Lisbon" });
  expect(plan.places).toHaveLength(1);
  await t.action(api.trips.makeTrip, {
    spaceId,
    city: "Lisbon",
    days: 1,
    pace: "packed",
  });
  expect(
    (await t.query(api.tripData.getSpaceTrip, { spaceId }))?.days[0].stops,
  ).toHaveLength(1);
  expect((await base.run((ctx) => ctx.db.get(itemIds[0])))?.placePins).toEqual(
    pins,
  );
  expect(generateObject).not.toHaveBeenCalled();
});
