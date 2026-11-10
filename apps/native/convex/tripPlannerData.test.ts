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

describe("blank trip setup", () => {
  it("persists countries, dates, cover, and empty days, and accepts a saved stop", async () => {
    const { base, t, itemId } = await setup([]);
    const cover = "/9j/AAAA";
    const tripId = await t.mutation(api.tripPlannerData.createBlankTrip, {
      name: " Iberia ",
      countries: ["PT", "ES", "PT"],
      city: "Lisbon",
      dayCount: 3,
      startDate: "2027-05-01",
      cover,
    });
    expect(
      await t.query(api.tripPlannerData.getTripPlan, { tripId }),
    ).toMatchObject({
      name: "Iberia",
      countries: ["PT", "ES"],
      city: "Lisbon",
      dayCount: 3,
      startDate: "2027-05-01",
      cover,
      days: [[], [], []],
    });
    await t.mutation(api.tripPlannerData.addTripStop, {
      tripId,
      day: 2,
      place: { kind: "save", itemId, name: "Time Out Market" },
    });
    expect(await layout(t, tripId)).toEqual({
      days: [[], ["Time Out Market"], []],
      unplanned: [],
    });
    expect(
      await t.mutation(api.tripPlannerData.fillBlankTripDay, {
        tripId,
        day: 1,
      }),
    ).toBe(1);
    expect(
      await t.mutation(api.tripPlannerData.fillBlankTripDay, {
        tripId,
        day: 1,
      }),
    ).toBe(0);
    expect(await layout(t, tripId)).toEqual({
      days: [["Manteigaria"], ["Time Out Market"], []],
      unplanned: [],
    });
    const other = await signedInUser(base, { pro: true });
    expect(
      await other.t.query(api.tripPlannerData.getTripPlan, { tripId }),
    ).toBeNull();
  });

  it("requires Pro and rejects invalid countries and dates", async () => {
    const args = { name: "Trip", countries: ["PT"], dayCount: 2 };
    const free = await setup([], { pro: false });
    await expect(
      free.t.mutation(api.tripPlannerData.createBlankTrip, args),
    ).rejects.toThrow();
    const { t } = await setup([]);
    await expect(
      t.mutation(api.tripPlannerData.createBlankTrip, {
        ...args,
        countries: ["ZZ"],
      }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.tripPlannerData.createBlankTrip, {
        ...args,
        startDate: "2027-02-29",
      }),
    ).rejects.toThrow();
    const tripId = await t.mutation(api.tripPlannerData.createBlankTrip, args);
    expect(
      await t.query(api.tripPlannerData.getTripPlan, { tripId }),
    ).toMatchObject({
      city: "Portugal",
      days: [[], []],
    });
  });
});

describe("applying day suggestions", () => {
  it("requires personal access to fill a day from saves on a covered shared trip", async () => {
    const { base, t, tripId, itemId } = await setup([], { pro: false });
    const owner = await signedInUser(base, { pro: true });
    const { listId, inviteToken } = await owner.t.mutation(
      api.sharedLists.createSharedList,
      {
        name: "Lisbon plans",
        cities: ["Lisbon"],
      },
    );
    await t.mutation(api.sharedLists.joinSharedList, { token: inviteToken });
    await base.run((ctx) => ctx.db.patch(tripId, { listId }));
    await expect(
      t.mutation(api.tripPlannerData.applyTripDaySuggestions, {
        tripId,
        day: 1,
        places: [{ itemId, name: "Time Out Market" }],
      }),
    ).rejects.toMatchObject({ data: { code: "pro_required" } });
    expect(await layout(t, tripId)).toEqual({ days: [[], []], unplanned: [] });
  });

  it("adds only kept places in review order and leaves an edited day alone", async () => {
    const { t, tripId, itemId } = await setup([]);
    const apply = api.tripPlannerData.applyTripDaySuggestions;
    const market = { itemId, name: "Time Out Market" };
    const bakery = { itemId, name: "Manteigaria" };
    expect(
      await t.mutation(apply, { tripId, day: 1, places: [bakery, market] }),
    ).toBe(true);
    expect(await t.mutation(apply, { tripId, day: 1, places: [market] })).toBe(
      false,
    );
    expect(await layout(t, tripId)).toEqual({
      days: [["Manteigaria", "Time Out Market"], []],
      unplanned: [],
    });
  });

  it("refuses duplicate and stale suggestions without applying any of the picks", async () => {
    const { base, t, tripId, itemId } = await setup([]);
    const apply = api.tripPlannerData.applyTripDaySuggestions;
    const market = { itemId, name: "Time Out Market" };
    const bakery = { itemId, name: "Manteigaria" };
    const other = await signedInUser(base, { pro: true });
    await expect(
      other.t.mutation(apply, { tripId, day: 1, places: [market] }),
    ).rejects.toThrow();
    await expect(
      t.mutation(apply, {
        tripId,
        day: 1,
        places: [market, { itemId, name: "Unavailable place" }],
      }),
    ).rejects.toThrow();
    expect(
      await t.mutation(apply, { tripId, day: 1, places: [market, market] }),
    ).toBe(false);
    expect(await layout(t, tripId)).toEqual({ days: [[], []], unplanned: [] });
    expect(await t.mutation(apply, { tripId, day: 2, places: [market] })).toBe(
      true,
    );
    expect(
      await t.mutation(apply, { tripId, day: 1, places: [bakery, market] }),
    ).toBe(false);
    expect(await layout(t, tripId)).toEqual({
      days: [[], ["Time Out Market"]],
      unplanned: [],
    });
  });
});

describe("stop details", () => {
  it("persists optional time and note through a move and allows clearing both", async () => {
    const { base, t, tripId, ids } = await setup(TRIP);
    const update = api.tripPlannerData.updateTripStopDetails;
    const fields = { stopId: ids.A, time: "18:30", note: " Window seat " };
    const other = await signedInUser(base, { pro: true });
    await expect(other.t.mutation(update, fields)).rejects.toThrow();
    await expect(
      t.mutation(update, { ...fields, time: "24:00" }),
    ).rejects.toThrow();
    await t.mutation(update, fields);
    await t.mutation(api.tripPlannerData.moveTripStop, {
      stopId: ids.A,
      day: 2,
      index: 0,
    });
    const get = () => t.query(api.tripPlannerData.getTripPlan, { tripId });
    expect((await get())?.days[1][0]).toMatchObject({
      name: "A",
      time: "18:30",
      note: "Window seat",
    });
    await t.mutation(update, { stopId: ids.A, time: null, note: null });
    const stop = (await get())?.days[1][0];
    expect(stop).not.toHaveProperty("time");
    expect(stop).not.toHaveProperty("note");
  });
});

describe("trip share link", () => {
  it("lets an owner find and revoke active links after Pro lapses", async () => {
    const { base, t, tripId, userId } = await setup(TRIP);
    const paginationOpts = { cursor: null, numItems: 10 };
    const token = await t.mutation(api.tripShares.createShare, { tripId });
    await base.run(async (ctx) => {
      const sub = await ctx.db
        .query("subscriptions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique();
      if (!sub) throw new Error("Expected seeded subscription");
      await ctx.db.patch(sub._id, {
        status: "lapsed",
        expiresAt: Date.now() - 1,
      });
    });
    const other = await signedInUser(base);
    expect(
      (await other.t.query(api.tripShares.listSharedTrips, { paginationOpts }))
        .page,
    ).toEqual([]);
    expect(
      (await t.query(api.tripShares.listSharedTrips, { paginationOpts })).page,
    ).toEqual([{ _id: tripId, city: "Lisbon" }]);
    await t.mutation(api.tripShares.revokeShare, { tripId, token });
    expect(
      (await t.query(api.tripShares.listSharedTrips, { paginationOpts })).page,
    ).toEqual([]);
  });

  it("reads the live scheduled itinerary without authentication and invalidates revoked links", async () => {
    const { base, t, tripId, ids, userId } = await setup(TRIP);
    const { createShare, revokeShare } = api.tripShares;
    const other = await signedInUser(base, { pro: true });
    await expect(other.t.mutation(createShare, { tripId })).rejects.toThrow();
    const token = await t.mutation(createShare, { tripId });
    await expect(
      other.t.mutation(revokeShare, { tripId, token }),
    ).rejects.toThrow();
    const path = `/trip/shared/${token}`;
    await t.mutation(api.tripPlannerData.updateTripStopDetails, {
      stopId: ids.A,
      time: "18:30",
      note: "<script>example</script>",
    });
    const response = await base.fetch(path);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const page = await response.text();
    expect(page).toContain("18:30");
    expect(page).toContain("&lt;script&gt;example&lt;/script&gt;");
    expect(page).not.toContain("<script>");
    expect(page).not.toContain("Extra");
    await t.mutation(revokeShare, { tripId, token });
    expect((await base.fetch(path)).status).toBe(404);
    const next = await t.mutation(createShare, { tripId });
    expect(next).not.toBe(token);
    await t.mutation(revokeShare, { tripId, token });
    expect((await base.fetch(`/trip/shared/${next}`)).status).toBe(200);
    await base.run((ctx) => ctx.db.patch(userId, { deleting: true }));
    expect((await base.fetch(`/trip/shared/${next}`)).status).toBe(404);
  });
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

  it("adds another branch with its own Apple id instead of moving the first", async () => {
    const { t, tripId } = await setup(TRIP);
    const branch = (appleId: string, lat: number) => ({
      kind: "search" as const,
      place: { name: "Starbucks", lat, lng: -9.131, appleId },
    });
    const first = await t.mutation(api.tripPlannerData.addTripStop, {
      tripId,
      day: 1,
      place: branch("A-sb1", 38.716),
    });
    const second = await t.mutation(api.tripPlannerData.addTripStop, {
      tripId,
      day: 2,
      place: branch("A-sb2", 38.76),
    });
    expect(second).not.toBe(first);
    expect(await layout(t, tripId)).toEqual({
      days: [
        ["A", "B", "C", "Starbucks"],
        ["D", "Starbucks"],
      ],
      unplanned: ["Extra"],
    });
  });

  it("hides a saved place added from search, and adding it again keeps one stop", async () => {
    const { t, tripId, itemId } = await setup(TRIP);
    const searched = await t.mutation(api.tripPlannerData.addTripStop, {
      tripId,
      day: 2,
      place: {
        kind: "search",
        place: { name: "Manteigaria", lat: 38.711, lng: -9.143 },
      },
    });
    expect(
      (await t.query(api.tripPlannerData.tripSavePlaces, { tripId })).map(
        (place) => place.name,
      ),
    ).toEqual(["Time Out Market"]);
    const saved = await t.mutation(api.tripPlannerData.addTripStop, {
      tripId,
      day: 2,
      place: { kind: "save", itemId, name: "Manteigaria" },
    });
    expect(saved).toBe(searched);
    expect(await layout(t, tripId)).toEqual({
      days: [
        ["A", "B", "C"],
        ["D", "Manteigaria"],
      ],
      unplanned: ["Extra"],
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

const PARIS_STAY = { name: "Hotel du Louvre", lat: 48.8625, lng: 2.3355 };

async function countryTrip(stay?: typeof PARIS_STAY) {
  const base = newConvexTest();
  const user = await signedInUser(base, { pro: true });
  const itemId = await base.run((ctx) =>
    ctx.db.insert("items", {
      userId: user.userId,
      type: "link",
      status: "ready",
      title: "France food",
      cities: ["Paris", "Lyon"],
      places: ["Du Pain et des Idées", "Paul Bocuse"],
      placePins: [
        {
          name: "Du Pain et des Idées",
          lat: 48.8717,
          lng: 2.3632,
          city: "Paris",
        },
        { name: "Paul Bocuse", lat: 45.8164, lng: 4.8495, city: "Lyon" },
      ],
      url: "https://www.tiktok.com/@someone/video/9",
      tags: ["food"],
      searchText: "France food",
    }),
  );
  const tripId = await user.t.mutation(api.tripPlannerData.createBlankTrip, {
    name: "France",
    countries: ["FR"],
    city: "",
    dayCount: 2,
    ...(stay ? { stay } : {}),
  });
  return { base, ...user, itemId, tripId };
}

describe("a trip with no base city", () => {
  it("finds saves near the stay for Fill my day, From your saves and adding a stop", async () => {
    const { t, itemId, tripId } = await countryTrip(PARIS_STAY);
    expect(
      (await t.query(api.tripPlannerData.tripSavePlaces, { tripId })).map(
        (place) => place.name,
      ),
    ).toEqual(["Du Pain et des Idées"]);
    expect(
      await t.mutation(api.tripPlannerData.fillBlankTripDay, {
        tripId,
        day: 1,
      }),
    ).toBe(1);
    await expect(
      t.mutation(api.tripPlannerData.addTripStop, {
        tripId,
        day: 2,
        place: { kind: "save", itemId, name: "Paul Bocuse" },
      }),
    ).rejects.toThrow("Place not found");
    expect(await layout(t, tripId)).toEqual({
      days: [["Du Pain et des Idées"], []],
      unplanned: [],
    });
  });

  it("accepts a nearby saved place picked before any fill", async () => {
    const { t, itemId, tripId } = await countryTrip(PARIS_STAY);
    expect(
      await t.mutation(api.tripPlannerData.applyTripDaySuggestions, {
        tripId,
        day: 2,
        places: [{ itemId, name: "Du Pain et des Idées" }],
      }),
    ).toBe(true);
    expect(await layout(t, tripId)).toEqual({
      days: [[], ["Du Pain et des Idées"]],
      unplanned: [],
    });
  });

  it("offers no saves while the trip has no stay or stops to anchor it", async () => {
    const { t, tripId } = await countryTrip();
    expect(
      await t.query(api.tripPlannerData.tripSavePlaces, { tripId }),
    ).toEqual([]);
    expect(
      await t.mutation(api.tripPlannerData.fillBlankTripDay, {
        tripId,
        day: 1,
      }),
    ).toBe(0);
  });
});

describe("searching a new blank trip", () => {
  function searched(fetchMock: ReturnType<typeof fakeApple>) {
    const urls = fetchMock.mock.calls.map(([input]) => new URL(input));
    const search = urls.find((url) => url.pathname === "/v1/search");
    return {
      geocoded: urls.some((url) => url.pathname === "/v1/geocode"),
      near: search?.searchParams.get("searchLocation") ?? null,
      countries: search?.searchParams.get("limitToCountries") ?? null,
    };
  }

  it("searches near the stay before the first stop", async () => {
    await stubMaps();
    const fetchMock = fakeApple();
    vi.stubGlobal("fetch", fetchMock);
    const { t, tripId } = await countryTrip(PARIS_STAY);
    await t.action(api.tripPlanner.searchTripPlaces, {
      tripId,
      query: "croissant",
    });
    expect(searched(fetchMock)).toEqual({
      geocoded: false,
      near: `${PARIS_STAY.lat},${PARIS_STAY.lng}`,
      countries: "FR",
    });
  });

  it("searches near the base city when there is no stay yet", async () => {
    await stubMaps();
    const fetchMock = fakeApple();
    vi.stubGlobal("fetch", fetchMock);
    const { t } = await setup([]);
    const tripId = await t.mutation(api.tripPlannerData.createBlankTrip, {
      name: "Portugal",
      countries: ["PT"],
      city: "Lisbon",
      dayCount: 2,
    });
    await t.action(api.tripPlanner.searchTripPlaces, {
      tripId,
      query: "pastel de nata",
    });
    expect(searched(fetchMock)).toEqual({
      geocoded: true,
      near: "38.72,-9.14",
      countries: "PT",
    });
  });

  it("searches the whole country when no city or stay was chosen", async () => {
    await stubMaps();
    const fetchMock = fakeApple();
    vi.stubGlobal("fetch", fetchMock);
    const { t, tripId } = await countryTrip();
    await t.action(api.tripPlanner.searchTripPlaces, {
      tripId,
      query: "croissant",
    });
    expect(searched(fetchMock)).toEqual({
      geocoded: false,
      near: null,
      countries: "FR",
    });
  });
});
