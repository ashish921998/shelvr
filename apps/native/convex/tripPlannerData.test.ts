// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  newConvexTest,
  setTestConsent,
  signedInUser,
  type TestBackend,
} from "./test.setup";

const LISBON = { lat: 38.7223, lng: -9.1393 };

type Seed = { name: string; day: number; source?: "save" | "suggested" };

/** A two-day Lisbon trip with `stops` stored as given, plus one save with two pins in the city. */
async function setup(stops: Seed[], options: { pro?: boolean } = {}) {
  const base = newConvexTest();
  const user = await signedInUser(base, { pro: options.pro ?? true });
  const seeded = await base.run(async (ctx) => {
    const itemId = await ctx.db.insert("items", {
      userId: user.userId,
      type: "link",
      status: "ready",
      title: "Lisbon food crawl",
      cities: ["Lisbon"],
      places: ["Time Out Market", "Manteigaria"],
      placePins: [
        { name: "Time Out Market", lat: 38.707, lng: -9.146, city: "Lisbon" },
        {
          name: "Manteigaria",
          lat: 38.711,
          lng: -9.143,
          city: "Lisbon",
          appleId: "A-mant",
          category: "Bakery",
        },
      ],
      url: "https://www.tiktok.com/@someone/video/1",
      tags: ["food"],
      searchText: "Lisbon food crawl",
    });
    const tripId = await ctx.db.insert("tripPlans", {
      userId: user.userId,
      city: "Lisbon",
      dayCount: 2,
      pace: "balanced",
      interests: ["food"],
      stopCount: stops.filter((stop) => stop.day !== 0).length,
      savedCount: 0,
    });
    const ids: Record<string, Id<"tripStops">> = {};
    const orders = new Map<number, number>();
    for (const stop of stops) {
      const order = orders.get(stop.day) ?? 0;
      orders.set(stop.day, order + 1);
      ids[stop.name] = await ctx.db.insert("tripStops", {
        tripId,
        userId: user.userId,
        day: stop.day,
        order,
        source: stop.source ?? "suggested",
        name: stop.name,
        lat: LISBON.lat,
        lng: LISBON.lng,
      });
    }
    return { itemId, tripId, ids };
  });
  return { base, ...user, ...seeded };
}

async function layout(
  t: { query: TestBackend["query"] },
  tripId: Id<"tripPlans">,
) {
  const trip = await t.query(api.tripPlannerData.getTripPlan, { tripId });
  if (trip === null) throw new Error("trip missing");
  return {
    days: trip.days.map((day) => day.map((stop) => stop.name)),
    unplanned: trip.unplanned.map((stop) => stop.name),
  };
}

async function counts(base: TestBackend, tripId: Id<"tripPlans">) {
  return await base.run(async (ctx) => {
    const plan = await ctx.db.get(tripId);
    return {
      stopCount: plan?.stopCount,
      savedCount: plan?.savedCount,
    };
  });
}

const TRIP: Seed[] = [
  { name: "A", day: 1 },
  { name: "B", day: 1 },
  { name: "C", day: 1 },
  { name: "D", day: 2 },
  { name: "Extra", day: 0 },
];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("moveTripStop", () => {
  it("reorders within a day and returns where the stop was", async () => {
    const { t, tripId, ids } = await setup(TRIP);
    const before = await t.mutation(api.tripPlannerData.moveTripStop, {
      stopId: ids.C,
      day: 1,
      index: 0,
    });
    expect(before).toEqual({ day: 1, index: 2 });
    expect(await layout(t, tripId)).toEqual({
      days: [["C", "A", "B"], ["D"]],
      unplanned: ["Extra"],
    });
  });

  it("moves between days and from Unplanned, keeping the counts in step", async () => {
    const { base, t, tripId, ids } = await setup(TRIP);
    await t.mutation(api.tripPlannerData.moveTripStop, {
      stopId: ids.A,
      day: 2,
      index: 1,
    });
    await t.mutation(api.tripPlannerData.moveTripStop, {
      stopId: ids.Extra,
      day: 1,
      index: 99,
    });
    expect(await layout(t, tripId)).toEqual({
      days: [
        ["B", "C", "Extra"],
        ["D", "A"],
      ],
      unplanned: [],
    });
    expect(await counts(base, tripId)).toEqual({
      stopCount: 5,
      savedCount: 0,
    });
  });

  it("undoes a move by moving back to the returned place", async () => {
    const { t, tripId, ids } = await setup(TRIP);
    const before = await t.mutation(api.tripPlannerData.moveTripStop, {
      stopId: ids.B,
      day: 2,
      index: 0,
    });
    await t.mutation(api.tripPlannerData.moveTripStop, {
      stopId: ids.B,
      ...before,
    });
    expect(await layout(t, tripId)).toEqual({
      days: [["A", "B", "C"], ["D"]],
      unplanned: ["Extra"],
    });
  });

  it("refuses a day the trip doesn't have", async () => {
    const { t, ids } = await setup(TRIP);
    for (const day of [3, -1, 1.5]) {
      await expect(
        t.mutation(api.tripPlannerData.moveTripStop, {
          stopId: ids.A,
          day,
          index: 0,
        }),
      ).rejects.toThrow("No such day");
    }
  });

  it("refuses someone else's stop and an account without Pro", async () => {
    const { base, ids } = await setup(TRIP);
    const other = await signedInUser(base, { pro: true });
    await expect(
      other.t.mutation(api.tripPlannerData.moveTripStop, {
        stopId: ids.A,
        day: 2,
        index: 0,
      }),
    ).rejects.toThrow("Stop not found");
    const free = await setup(TRIP, { pro: false });
    await expect(
      free.t.mutation(api.tripPlannerData.moveTripStop, {
        stopId: free.ids.A,
        day: 2,
        index: 0,
      }),
    ).rejects.toMatchObject({ data: { code: "pro_required" } });
  });
});

describe("removeTripStop", () => {
  it("sends a stop to the top of Unplanned and puts it back on undo", async () => {
    const { base, t, tripId, ids } = await setup(TRIP);
    const was = await t.mutation(api.tripPlannerData.removeTripStop, {
      stopId: ids.B,
    });
    expect(was).toEqual({ day: 1, index: 1 });
    expect(await layout(t, tripId)).toEqual({
      days: [["A", "C"], ["D"]],
      unplanned: ["B", "Extra"],
    });
    expect((await counts(base, tripId)).stopCount).toBe(3);
    await t.mutation(api.tripPlannerData.moveTripStop, {
      stopId: ids.B,
      ...was,
    });
    expect(await layout(t, tripId)).toEqual({
      days: [["A", "B", "C"], ["D"]],
      unplanned: ["Extra"],
    });
    expect((await counts(base, tripId)).stopCount).toBe(4);
  });

  it("leaves an unplanned stop where it is", async () => {
    const { t, tripId, ids } = await setup(TRIP);
    expect(
      await t.mutation(api.tripPlannerData.removeTripStop, {
        stopId: ids.Extra,
      }),
    ).toEqual({ day: 0, index: 0 });
    expect((await layout(t, tripId)).unplanned).toEqual(["Extra"]);
  });
});

describe("addTripStop", () => {
  it("adds a searched place as an added stop at the end of the day", async () => {
    const { t, tripId } = await setup(TRIP);
    await t.mutation(api.tripPlannerData.addTripStop, {
      tripId,
      day: 2,
      place: {
        kind: "search",
        place: {
          name: "  Miradouro   da Graça ",
          lat: 38.716,
          lng: -9.131,
          appleId: "A-graca",
          category: "Landmark",
        },
      },
    });
    const trip = await t.query(api.tripPlannerData.getTripPlan, { tripId });
    expect(trip?.days[1].map((stop) => stop.name)).toEqual([
      "D",
      "Miradouro da Graça",
    ]);
    expect(trip?.days[1][1]).toMatchObject({
      source: "added",
      appleId: "A-graca",
      category: "Landmark",
    });
  });

  it("adds a saved place with the save's own pin and counts it as saved", async () => {
    const { base, t, tripId, itemId } = await setup(TRIP);
    await t.mutation(api.tripPlannerData.addTripStop, {
      tripId,
      day: 1,
      index: 0,
      place: { kind: "save", itemId, name: "Manteigaria" },
    });
    const trip = await t.query(api.tripPlannerData.getTripPlan, { tripId });
    expect(trip?.days[0][0]).toMatchObject({
      source: "save",
      itemId,
      name: "Manteigaria",
      lat: 38.711,
      lng: -9.143,
      appleId: "A-mant",
      why: "Lisbon food crawl",
    });
    expect(await counts(base, tripId)).toMatchObject({
      stopCount: 5,
      savedCount: 1,
    });
    expect(
      (await t.query(api.tripPlannerData.tripSavePlaces, { tripId })).map(
        (place) => place.name,
      ),
    ).toEqual(["Time Out Market"]);
  });

  it("moves a place already on the trip instead of adding it twice", async () => {
    const { t, tripId } = await setup(TRIP);
    const place = {
      kind: "search" as const,
      place: { name: "Graça", lat: 38.716, lng: -9.131, appleId: "A-graca" },
    };
    const first = await t.mutation(api.tripPlannerData.addTripStop, {
      tripId,
      day: 1,
      place,
    });
    const second = await t.mutation(api.tripPlannerData.addTripStop, {
      tripId,
      day: 0,
      place,
    });
    expect(second).toBe(first);
    expect(await layout(t, tripId)).toEqual({
      days: [["A", "B", "C"], ["D"]],
      unplanned: ["Extra", "Graça"],
    });
  });

  it("refuses a pin the save doesn't have, another account's save, and a bad point", async () => {
    const { base, t, tripId, itemId } = await setup(TRIP);
    await expect(
      t.mutation(api.tripPlannerData.addTripStop, {
        tripId,
        day: 1,
        place: { kind: "save", itemId, name: "Somewhere made up" },
      }),
    ).rejects.toThrow("Place not found");
    const other = await signedInUser(base, { pro: true });
    const theirTrip = await base.run((ctx) =>
      ctx.db.insert("tripPlans", {
        userId: other.userId,
        city: "Lisbon",
        dayCount: 1,
        pace: "easy",
        interests: [],
        stopCount: 0,
        savedCount: 0,
      }),
    );
    await expect(
      other.t.mutation(api.tripPlannerData.addTripStop, {
        tripId: theirTrip,
        day: 1,
        place: { kind: "save", itemId, name: "Manteigaria" },
      }),
    ).rejects.toThrow("Save not found");
    await expect(
      t.mutation(api.tripPlannerData.addTripStop, {
        tripId,
        day: 1,
        place: { kind: "search", place: { name: "Nowhere", lat: 200, lng: 0 } },
      }),
    ).rejects.toThrow("Place required");
    const stranger = await signedInUser(base, { pro: true });
    await expect(
      stranger.t.mutation(api.tripPlannerData.addTripStop, {
        tripId,
        day: 1,
        place: {
          kind: "search",
          place: { name: "Graça", lat: 38.7, lng: -9.1 },
        },
      }),
    ).rejects.toThrow("Trip not found");
  });
});

describe("renameTripPlan", () => {
  it("names the trip in My trips and on the trip, and clears it back", async () => {
    const { t, tripId } = await setup(TRIP);
    await t.mutation(api.tripPlannerData.renameTripPlan, {
      tripId,
      name: "  Anniversary   weekend ",
    });
    expect(
      (await t.query(api.tripPlannerData.getTripPlan, { tripId }))?.name,
    ).toBe("Anniversary weekend");
    const list = await t.query(api.tripPlannerData.listTripPlans, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(list.page[0].name).toBe("Anniversary weekend");
    await t.mutation(api.tripPlannerData.renameTripPlan, { tripId, name: " " });
    expect(
      (await t.query(api.tripPlannerData.getTripPlan, { tripId }))?.name,
    ).toBeUndefined();
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

function fakeApple() {
  return vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.pathname === "/v1/token") {
      return Response.json({ accessToken: "maps", expiresInSeconds: 1800 });
    }
    if (url.pathname === "/v1/geocode") {
      return Response.json({
        results: [{ coordinate: { latitude: 38.72, longitude: -9.14 } }],
      });
    }
    const q = url.searchParams.get("q") ?? "";
    return Response.json({
      results: [
        {
          name: `${q} Lisbon`,
          id: "A-near",
          poiCategory: "Cafe",
          structuredAddress: { locality: "Lisbon", subLocality: "Chiado" },
          coordinate: { latitude: 38.71, longitude: -9.142 },
        },
        {
          name: `${q} Porto`,
          id: "A-far",
          poiCategory: "Cafe",
          coordinate: { latitude: 41.1579, longitude: -8.6291 },
        },
      ],
    });
  });
}

describe("searchTripPlaces", () => {
  it("searches Apple near the trip and drops far results", async () => {
    await stubMaps();
    const fetchMock = fakeApple();
    vi.stubGlobal("fetch", fetchMock);
    const { t, tripId } = await setup(TRIP);
    const result = await t.action(api.tripPlanner.searchTripPlaces, {
      tripId,
      query: "pastel de nata",
    });
    expect(result).toEqual({
      available: true,
      places: [
        {
          name: "pastel de nata Lisbon",
          lat: 38.71,
          lng: -9.142,
          appleId: "A-near",
          category: "Cafe",
          area: "Chiado",
        },
      ],
    });
    const search = fetchMock.mock.calls
      .map(([input]) => new URL(input))
      .find((url) => url.pathname === "/v1/search");
    expect(search?.searchParams.get("searchLocation")).toBe(
      `${LISBON.lat},${LISBON.lng}`,
    );
  });

  it("sends Apple nothing for a short query or a declined account", async () => {
    await stubMaps();
    const fetchMock = fakeApple();
    vi.stubGlobal("fetch", fetchMock);
    const { base, t, tripId, userId } = await setup(TRIP);
    expect(
      await t.action(api.tripPlanner.searchTripPlaces, {
        tripId,
        query: " a ",
      }),
    ).toEqual({ available: true, places: [] });
    await base.run((ctx) => setTestConsent(ctx, userId, "declined"));
    expect(
      await t.action(api.tripPlanner.searchTripPlaces, {
        tripId,
        query: "coffee",
      }),
    ).toEqual({ available: false, places: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers unavailable without the Maps key", async () => {
    const { t, tripId } = await setup(TRIP);
    expect(
      await t.action(api.tripPlanner.searchTripPlaces, {
        tripId,
        query: "coffee",
      }),
    ).toEqual({ available: false, places: [] });
  });

  it("refuses an account without Pro", async () => {
    const { t, tripId } = await setup(TRIP, { pro: false });
    await expect(
      t.action(api.tripPlanner.searchTripPlaces, { tripId, query: "coffee" }),
    ).rejects.toMatchObject({ data: { code: "pro_required" } });
  });
});
