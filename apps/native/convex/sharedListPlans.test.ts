// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { DatePlanResult } from "./model/datePlan";
import {
  joiner,
  listWithOwner,
  near,
  seedSave,
} from "./sharedLists.test.helpers";
import { setTestConsent, signedInUser, type TestBackend } from "./test.setup";

const TRIP_BUCKET_CAPACITY = 5;

const RED_FROG = {
  name: "Red Frog",
  ...near(4),
  category: "Nightlife",
  city: "Lisbon",
};

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
  const fetchMock = vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.pathname === "/v1/token") {
      return Response.json({ accessToken: "maps", expiresInSeconds: 1800 });
    }
    return Response.json({ results: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function stopNames(result: DatePlanResult): string[] {
  return result.stops.map((stop) => stop.name);
}

async function lapse(base: TestBackend, userId: Id<"users">) {
  await base.run(async (ctx) => {
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (sub) await ctx.db.delete(sub._id);
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("makeDatePlan from a shared list", () => {
  it("plans a free member's evening from the list's places, naming no save of someone else", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { base, owner, token, listId } = await listWithOwner();
    const bo = await joiner(base, token);
    await bo.t.mutation(api.sharedLists.addSharedListPlace, {
      listId,
      place: RED_FROG,
    });
    const result = await bo.t.action(api.datePlans.makeDatePlan, {
      city: "Lisbon",
      kind: "classic",
      listId,
    });
    expect(result.status).toBe("ready");
    expect(stopNames(result)).toEqual(
      expect.arrayContaining(["Time Out Market", "Red Frog"]),
    );
    expect(result.stops.every((stop) => stop.source === "save")).toBe(true);
    expect(result.stops.every((stop) => stop.itemId === undefined)).toBe(true);
    const owners = await owner.t.action(api.datePlans.makeDatePlan, {
      city: "Lisbon",
      kind: "classic",
      listId,
    });
    expect(
      owners.stops.find((stop) => stop.name === "Time Out Market")?.itemId,
    ).toBeDefined();
    expect(
      owners.stops.find((stop) => stop.name === "Red Frog")?.itemId,
    ).toBeUndefined();
  });

  it("leaves out places the list marked visited", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { base, owner, token, listId } = await listWithOwner();
    const bo = await joiner(base, token);
    const frog = await bo.t.mutation(api.sharedLists.addSharedListPlace, {
      listId,
      place: RED_FROG,
    });
    await owner.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: frog,
      visited: true,
    });
    const result = await bo.t.action(api.datePlans.makeDatePlan, {
      city: "Lisbon",
      kind: "classic",
      listId,
    });
    expect(stopNames(result)).not.toContain("Red Frog");
  });

  it("makes no Apple call when a former member who added a place had declined AI", async () => {
    const fetchMock = await stubMaps();
    const { base, owner, token, listId } = await listWithOwner();
    const bo = await joiner(base, token);
    await base.run((ctx) => setTestConsent(ctx, bo.userId, "declined"));
    await bo.t.mutation(api.sharedLists.addSharedListPlace, {
      listId,
      place: RED_FROG,
    });
    await bo.t.mutation(api.sharedLists.leaveSharedList, { listId });
    const result = await owner.t.action(api.datePlans.makeDatePlan, {
      city: "Lisbon",
      kind: "classic",
      listId,
    });
    expect(result.status).toBe("ready");
    expect(stopNames(result)).toContain("Red Frog");
    expect(fetchMock).not.toHaveBeenCalled();
    await base.run((ctx) => setTestConsent(ctx, bo.userId, "granted"));
    await owner.t.action(api.datePlans.makeDatePlan, {
      city: "Lisbon",
      kind: "classic",
      listId,
    });
    expect(fetchMock).toHaveBeenCalled();
  });

  it("refuses a free member once the owner lapsed, and anyone not on the list", async () => {
    const { base, owner, token, listId } = await listWithOwner();
    const bo = await joiner(base, token);
    await lapse(base, owner.userId);
    await expect(
      bo.t.action(api.datePlans.makeDatePlan, {
        city: "Lisbon",
        kind: "classic",
        listId,
      }),
    ).rejects.toMatchObject({ data: { code: "pro_required" } });
    const stranger = await signedInUser(base, { pro: true });
    await expect(
      stranger.t.action(api.datePlans.makeDatePlan, {
        city: "Lisbon",
        kind: "classic",
        listId,
      }),
    ).rejects.toThrow(/List not found/);
  });
});

function appleOffering(names: string[]) {
  return vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.pathname === "/v1/token") {
      return Response.json({ accessToken: "maps", expiresInSeconds: 1800 });
    }
    const category = url.searchParams
      .get("includePoiCategories")
      ?.split(",")[0];
    return Response.json({
      results: names.map((name, i) => ({
        name,
        id: `A-${i}`,
        poiCategory: category,
        structuredAddress: { locality: "Lisbon" },
        coordinate: {
          latitude: near(3 + i * 0.1).lat,
          longitude: near(0).lng,
        },
      })),
    });
  });
}

describe("a save's tags on a shared list", () => {
  it("speak for a place only when the save names that one place", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { base, token, listId } = await listWithOwner();
    const bo = await joiner(base, token);
    const guide = await seedSave(base, bo.userId, {
      pins: [
        { name: "Bookshop Bertrand", ...near(5) },
        { name: "Tile Museum", ...near(6) },
      ],
      tags: ["coffee"],
    });
    const solo = await seedSave(base, bo.userId, {
      pins: [{ name: "Solo Roasters", ...near(7) }],
      tags: ["coffee"],
    });
    for (const itemId of [guide, solo]) {
      await bo.t.mutation(api.sharedLists.addSavePlaces, { listId, itemId });
    }
    await bo.t.mutation(api.sharedLists.addSharedListPlace, {
      listId,
      place: { name: "Jardim", ...near(8), category: "Park", city: "Lisbon" },
    });
    const result = await bo.t.action(api.datePlans.makeDatePlan, {
      city: "Lisbon",
      kind: "lowkey",
      listId,
    });
    expect(stopNames(result)).toEqual(
      expect.arrayContaining(["Solo Roasters", "Jardim"]),
    );
    expect(stopNames(result)).not.toContain("Bookshop Bertrand");
    expect(stopNames(result)).not.toContain("Tile Museum");
  });
});

describe("a place the list marked visited", () => {
  it("is not suggested back on a date", async () => {
    await stubMaps();
    vi.stubGlobal("fetch", appleOffering(["Red Frog", "Blue Frog"]));
    const { base, owner, token, listId } = await listWithOwner();
    const bo = await joiner(base, token);
    const frog = await bo.t.mutation(api.sharedLists.addSharedListPlace, {
      listId,
      place: RED_FROG,
    });
    await bo.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: frog,
      visited: true,
    });
    const result = await owner.t.action(api.datePlans.makeDatePlan, {
      city: "Lisbon",
      kind: "classic",
      listId,
    });
    expect(stopNames(result)).toContain("Blue Frog");
    expect(stopNames(result)).not.toContain("Red Frog");
  });

  it("is not suggested back on a trip", async () => {
    await stubMaps();
    vi.stubGlobal("fetch", appleOffering(["Red Frog", "Blue Frog"]));
    const { base, owner, token, listId } = await listWithOwner();
    const bo = await joiner(base, token);
    const frog = await bo.t.mutation(api.sharedLists.addSharedListPlace, {
      listId,
      place: RED_FROG,
    });
    await bo.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: frog,
      visited: true,
    });
    const { tripId } = await owner.t.action(api.tripPlanner.createTripPlan, {
      city: "Lisbon",
      days: 2,
      pace: "easy",
      interests: ["food"],
      listId,
    });
    const trip = await owner.t.query(api.tripPlannerData.getTripPlan, {
      tripId: tripId!,
    });
    const names = [
      ...(trip?.days.flat() ?? []),
      ...(trip?.unplanned ?? []),
    ].map((stop) => stop.name);
    expect(names).toContain("Blue Frog");
    expect(names).not.toContain("Red Frog");
  });

  it("still leaves another branch of that name on the plan", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { base, owner, token, listId } = await listWithOwner();
    const bo = await joiner(base, token);
    const frog = await bo.t.mutation(api.sharedLists.addSharedListPlace, {
      listId,
      place: RED_FROG,
    });
    await bo.t.mutation(api.sharedLists.addSharedListPlace, {
      listId,
      place: { ...RED_FROG, ...near(40) },
    });
    await bo.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
      placeId: frog,
      visited: true,
    });
    const { saves } = await owner.t.action(api.tripPlanner.createTripPlan, {
      city: "Lisbon",
      days: 1,
      pace: "easy",
      interests: [],
      listId,
    });
    expect(saves).toBe(3);
  });
});

describe("planning one city of a list with two", () => {
  it("uses only that city's places", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { base, owner, token, listId } = await listWithOwner();
    const bo = await joiner(base, token);
    await bo.t.mutation(api.sharedLists.addSharedListPlace, {
      listId,
      place: { ...RED_FROG, name: "Porto Frog", city: "Porto" },
    });
    await bo.t.mutation(api.sharedLists.addSharedListPlace, {
      listId,
      place: RED_FROG,
    });
    const result = await owner.t.action(api.datePlans.makeDatePlan, {
      city: "lisbon",
      kind: "classic",
      listId,
    });
    expect(stopNames(result)).toContain("Red Frog");
    expect(stopNames(result)).not.toContain("Porto Frog");
  });
});

describe("planning a city the list does not hold", () => {
  it("gives a date plan no Apple call and no stops", async () => {
    const fetchMock = await stubMaps();
    const { owner, listId } = await listWithOwner();
    const result = await owner.t.action(api.datePlans.makeDatePlan, {
      city: "Porto",
      kind: "classic",
      listId,
    });
    expect(result).toMatchObject({ status: "no_anchor", stops: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a trip before the rate limit or any Apple call", async () => {
    const fetchMock = await stubMaps();
    const { base, token, listId } = await listWithOwner();
    const bo = await joiner(base, token);
    const trip = (city: string) =>
      bo.t.action(api.tripPlanner.createTripPlan, {
        city,
        days: 1,
        pace: "easy",
        interests: ["food"],
        listId,
      });
    for (let n = 0; n < TRIP_BUCKET_CAPACITY + 1; n++) {
      await expect(trip("Porto")).rejects.toThrow(/No places in this city/);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await trip("Lisbon")).tripId).not.toBeNull();
  });

  it("refuses a trip when every place in the city has been visited", async () => {
    const fetchMock = await stubMaps();
    const { base, token, listId } = await listWithOwner();
    const bo = await joiner(base, token);
    const list = await bo.t.query(api.sharedLists.getSharedList, { listId });
    for (const place of list?.places ?? []) {
      await bo.t.mutation(api.sharedLists.setSharedListPlaceVisited, {
        placeId: place._id,
        visited: true,
      });
    }
    await expect(
      bo.t.action(api.tripPlanner.createTripPlan, {
        city: "Lisbon",
        days: 1,
        pace: "easy",
        interests: ["food"],
        listId,
      }),
    ).rejects.toThrow(/No places in this city/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("createTripPlan from a shared list", () => {
  it("plans a free member's trip from the list and remembers the list on it", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { base, owner, token, listId } = await listWithOwner();
    const bo = await joiner(base, token);
    const result = await bo.t.action(api.tripPlanner.createTripPlan, {
      city: "Lisbon",
      days: 1,
      pace: "easy",
      interests: ["food"],
      listId,
    });
    expect(result).toMatchObject({ saves: 2, suggested: 0 });
    const trip = await bo.t.query(api.tripPlannerData.getTripPlan, {
      tripId: result.tripId!,
    });
    expect(trip?.listId).toBe(listId);
    const stops = [...(trip?.days.flat() ?? []), ...(trip?.unplanned ?? [])];
    expect(stops.map((stop) => stop.name).sort()).toEqual([
      "Manteigaria",
      "Time Out Market",
    ]);
    expect(stops.every((stop) => stop.itemId === undefined)).toBe(true);
    const list = await bo.t.query(api.sharedLists.getSharedList, { listId });
    expect(list?.trips.map((plan) => plan._id)).toEqual([result.tripId]);
    expect(
      await owner.t.query(api.tripPlannerData.getTripPlan, {
        tripId: result.tripId!,
      }),
    ).toBeNull();
  });

  it("is refused for a free member once the owner lapsed", async () => {
    const { base, owner, token, listId } = await listWithOwner();
    const bo = await joiner(base, token);
    await lapse(base, owner.userId);
    await expect(
      bo.t.action(api.tripPlanner.createTripPlan, {
        city: "Lisbon",
        days: 1,
        pace: "easy",
        interests: [],
        listId,
      }),
    ).rejects.toMatchObject({ data: { code: "pro_required" } });
  });
});

describe("editing a trip without Pro", () => {
  it("is refused on a personal trip and allowed on a covered list trip", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { base, owner, token, listId } = await listWithOwner();
    const bo = await joiner(base, token);
    const personal = await base.run((ctx) =>
      ctx.db.insert("tripPlans", {
        userId: bo.userId,
        city: "Lisbon",
        dayCount: 1,
        pace: "easy",
        interests: [],
        stopCount: 0,
        savedCount: 0,
      }),
    );
    await expect(
      bo.t.mutation(api.tripPlannerData.renameTripPlan, {
        tripId: personal,
        name: "Mine",
      }),
    ).rejects.toMatchObject({ data: { code: "pro_required" } });
    const { tripId } = await bo.t.action(api.tripPlanner.createTripPlan, {
      city: "Lisbon",
      days: 1,
      pace: "easy",
      interests: [],
      listId,
    });
    await bo.t.mutation(api.tripPlannerData.renameTripPlan, {
      tripId: tripId!,
      name: "Our weekend",
    });
    expect(
      (await bo.t.query(api.tripPlannerData.getTripPlan, { tripId: tripId! }))
        ?.name,
    ).toBe("Our weekend");
    await lapse(base, owner.userId);
    await expect(
      bo.t.mutation(api.tripPlannerData.renameTripPlan, {
        tripId: tripId!,
        name: "Still ours",
      }),
    ).rejects.toMatchObject({ data: { code: "pro_required" } });
  });
});
