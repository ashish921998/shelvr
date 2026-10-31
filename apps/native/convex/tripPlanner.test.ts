// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  insertConsentingUser,
  newConvexTest,
  setTestConsent,
  type TestBackend,
} from "./test.setup";

type Save = {
  title: string;
  description?: string;
  places: string[];
  pins?: {
    name: string;
    lat: number;
    lng: number;
    appleId?: string;
    category?: string;
  }[];
  tags?: string[];
  city?: string;
};

const LISBON = { latitude: 38.7223, longitude: -9.1393 };
const FIRST_PAGE = { paginationOpts: { numItems: 50, cursor: null } };

const SAVES: Save[] = [
  {
    title: "Best ramen in town",
    places: ["Ramen Shop"],
    pins: [
      {
        name: "Ramen Shop",
        lat: 38.712,
        lng: -9.14,
        appleId: "A-ramen",
        category: "Restaurant",
      },
    ],
    tags: ["ramen", "food"],
  },
  {
    title: "Hidden speakeasy",
    places: ["Red Frog"],
    pins: [
      {
        name: "Red Frog",
        lat: 38.72,
        lng: -9.145,
        appleId: "A-frog",
        category: "Nightlife",
      },
    ],
    tags: ["speakeasy"],
  },
  { title: "Tiles museum", places: ["Museu do Azulejo"], tags: ["museum"] },
];

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

async function addUser(
  base: TestBackend,
  saves: Save[],
  options: { pro?: boolean } = {},
) {
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
    const itemIds: Id<"items">[] = [];
    for (const save of saves) {
      itemIds.push(
        await ctx.db.insert("items", {
          userId,
          type: "link",
          status: "ready",
          title: save.title,
          ...(save.description !== undefined
            ? { description: save.description }
            : {}),
          cities: [save.city ?? "Lisbon"],
          places: save.places,
          placePins: save.pins?.map((pin) => ({
            ...pin,
            city: save.city ?? "Lisbon",
          })),
          url: "https://www.tiktok.com/@someone/video/1",
          tags: save.tags ?? [],
          searchText: save.title,
        }),
      );
    }
    return { userId, itemIds };
  });
  const t = base.withIdentity({ subject: `${seeded.userId}|session-1` });
  return { t, ...seeded };
}

async function setup(saves: Save[] = SAVES, options: { pro?: boolean } = {}) {
  const base = newConvexTest();
  return { base, ...(await addUser(base, saves, options)) };
}

async function stubMaps() {
  vi.stubEnv("APPLE_MAPS_PRIVATE_KEY", await testKey());
  vi.stubEnv("APPLE_MAPS_KEY_ID", "KEY1");
  vi.stubEnv("APPLE_MAPS_TEAM_ID", "TEAM1");
}

type Poi = {
  name: string;
  id?: string;
  poiCategory?: string;
  latitude: number;
  longitude: number;
};

function reply(pois: Poi[]) {
  return Response.json({
    results: pois.map(({ latitude, longitude, ...rest }) => ({
      ...rest,
      structuredAddress: { locality: "Lisbon", subLocality: "Baixa" },
      coordinate: { latitude, longitude },
    })),
  });
}

/** Apple stand-in: each category searched answers a few venues near the centre, plus a chain and a far namesake. */
function fakeApple() {
  let n = 0;
  return vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.pathname === "/v1/token") {
      return Response.json({ accessToken: "maps", expiresInSeconds: 1800 });
    }
    if (url.pathname === "/v1/geocode") {
      return Response.json({ results: [{ coordinate: LISBON }] });
    }
    const categories = url.searchParams.get("includePoiCategories");
    if (categories === null) {
      // A single-place lookup: a saved place without a pin, or the stay.
      return Response.json({
        results: [{ coordinate: { latitude: 38.715, longitude: -9.13 } }],
      });
    }
    const category = categories.split(",")[0];
    const q = url.searchParams.get("q") ?? "";
    n++;
    return reply([
      {
        name: `${q} spot ${n}`,
        id: `${category}-${n}-a`,
        poiCategory: category,
        latitude: 38.71 + n * 0.001,
        longitude: -9.14,
      },
      {
        name: `${q} corner ${n}`,
        id: `${category}-${n}-b`,
        poiCategory: category,
        latitude: 38.73 - n * 0.001,
        longitude: -9.15,
      },
      {
        name: "Starbucks",
        id: `sb-${n}`,
        poiCategory: category,
        latitude: 38.72,
        longitude: -9.14,
      },
      {
        name: `${q} in Porto`,
        id: `porto-${n}`,
        poiCategory: category,
        latitude: 41.1579,
        longitude: -8.6291,
      },
    ]);
  });
}

function searches(fetchMock: ReturnType<typeof fakeApple>) {
  return fetchMock.mock.calls
    .map(([input]) => new URL(input))
    .filter((url) => url.searchParams.has("includePoiCategories"))
    .map((url) => ({
      q: url.searchParams.get("q"),
      categories: url.searchParams.get("includePoiCategories"),
    }));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("claimTripPlanInternal", () => {
  it("refuses an account without Pro", async () => {
    const { t } = await setup(SAVES, { pro: false });
    await expect(
      t.action(api.tripPlanner.createTripPlan, {
        city: "Lisbon",
        days: 2,
        pace: "easy",
        interests: ["food"],
      }),
    ).rejects.toMatchObject({ data: { code: "pro_required" } });
    await expect(
      t.mutation(internal.tripPlannerData.claimTripPlanInternal, {
        city: "Lisbon",
        days: 2,
        interests: [],
      }),
    ).rejects.toMatchObject({ data: { code: "pro_required" } });
  });

  it("refuses a signed-out caller", async () => {
    const { base } = await setup();
    await expect(
      base.action(api.tripPlanner.createTripPlan, {
        city: "Lisbon",
        days: 2,
        pace: "easy",
        interests: [],
      }),
    ).rejects.toThrow("Not authenticated");
  });

  it("spends the createTripPlan rate limit", async () => {
    const { t } = await setup();
    const claim = () =>
      t.mutation(internal.tripPlannerData.claimTripPlanInternal, {
        city: "Lisbon",
        days: 2,
        interests: [],
      });
    for (let i = 0; i < 5; i++) await claim();
    await expect(claim()).rejects.toThrow();
  });

  it("keeps only a start date that is a real calendar day", async () => {
    const { t } = await setup();
    const startDate = async (date: string) =>
      (
        await t.mutation(internal.tripPlannerData.claimTripPlanInternal, {
          city: "Lisbon",
          days: 2,
          interests: [],
          startDate: date,
        })
      ).startDate;
    expect(await startDate("2026-02-30")).toBeUndefined();
    expect(await startDate("2026-13-01")).toBeUndefined();
    expect(await startDate(" 2028-02-29 ")).toBe("2028-02-29");
  });

  it("tidies the request and reads the city's saves, pins, visits and taste", async () => {
    const { base, t, userId, itemIds } = await setup();
    await base.run(async (ctx) => {
      await ctx.db.insert("placeVisits", {
        userId,
        key: "elsewhere",
        name: "Elsewhere",
        itemId: itemIds[0],
        visitedAt: Date.now(),
      });
    });
    const claim = await t.mutation(
      internal.tripPlannerData.claimTripPlanInternal,
      {
        city: "  Lisbon ",
        days: 40.4,
        interests: ["food", "food", "drinks"],
        startDate: "not a date",
        stay: "  Hotel   Avenida  ",
      },
    );
    expect(claim).toMatchObject({
      city: "Lisbon",
      days: 15,
      interests: ["food", "drinks"],
      stay: "Hotel Avenida",
      been: ["Elsewhere"],
      aiAllowed: true,
    });
    if (claim.from !== "saves") throw new Error("expected a saves claim");
    expect(claim.startDate).toBeUndefined();
    expect(claim.sources).toHaveLength(3);
    expect(claim.pins.map((pin) => pin.appleId).sort()).toEqual([
      "A-frog",
      "A-ramen",
    ]);
    expect(claim.tastes).toContainEqual({
      tags: ["ramen", "food"],
      categories: ["Restaurant"],
    });
    await expect(
      t.mutation(internal.tripPlannerData.claimTripPlanInternal, {
        city: "   ",
        days: 1,
        interests: [],
      }),
    ).rejects.toThrow("City required");
  });

  it("sends no taste to Apple for an account that declined AI", async () => {
    const { base, t, userId } = await setup();
    await base.run((ctx) => setTestConsent(ctx, userId, "declined"));
    const claim = await t.mutation(
      internal.tripPlannerData.claimTripPlanInternal,
      { city: "Lisbon", days: 1, interests: ["food"] },
    );
    expect(claim.aiAllowed).toBe(false);
    expect(claim.tastes).toEqual([]);
  });
});

describe("createTripPlan without Apple Maps", () => {
  it("plans the pinned saves only and stores a new trip every time", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { t, itemIds } = await setup();

    const result = await t.action(api.tripPlanner.createTripPlan, {
      city: "Lisbon",
      days: 2,
      pace: "easy",
      interests: ["food"],
      startDate: "2026-11-02",
      stay: "Hotel Avenida",
    });
    expect(result).toMatchObject({ saves: 2, suggested: 0 });
    expect(fetchMock).not.toHaveBeenCalled();

    const trip = await t.query(api.tripPlannerData.getTripPlan, {
      tripId: result.tripId!,
    });
    expect(trip).not.toHaveProperty("name");
    expect(trip).toMatchObject({
      city: "Lisbon",
      startDate: "2026-11-02",
      dayCount: 2,
      pace: "easy",
      interests: ["food"],
      stay: { name: "Hotel Avenida" },
      unplanned: [],
    });
    expect(trip!.days).toHaveLength(2);
    const stops = trip!.days.flat();
    expect(stops.map((stop) => stop.name).sort()).toEqual([
      "Ramen Shop",
      "Red Frog",
    ]);
    const ramen = stops.find((stop) => stop.name === "Ramen Shop")!;
    expect(ramen).toMatchObject({
      source: "save",
      itemId: itemIds[0],
      appleId: "A-ramen",
      category: "Restaurant",
      slot: "lunch",
      why: "Best ramen in town",
      lat: 38.712,
    });
    expect(Object.keys(ramen)).not.toContain("userId");
    expect(Object.keys(ramen)).not.toContain("order");

    const again = await t.action(api.tripPlanner.createTripPlan, {
      city: "lisbon",
      days: 1,
      pace: "packed",
      interests: [],
    });
    const list = (await t.query(api.tripPlannerData.listTripPlans, FIRST_PAGE))
      .page;
    expect(list.map((plan) => plan._id)).toEqual([again.tripId, result.tripId]);
    expect(list[1]).toMatchObject({
      dayCount: 2,
      stopCount: 2,
      savedCount: 2,
      startDate: "2026-11-02",
    });
  });

  it("gives a guide's places its title, and a single-place save its description", async () => {
    const description = "A curated list of top-rated Lisbon eateries";
    const { t } = await setup([
      {
        title: "The best restaurants in Lisbon",
        description,
        places: ["Santa Joana", "Prado"],
        pins: [
          { name: "Santa Joana", lat: 38.72, lng: -9.145 },
          { name: "Prado", lat: 38.709, lng: -9.134 },
        ],
      },
      {
        title: "Ramen night",
        description: "Rich tonkotsu and a long queue",
        places: ["Ramen Shop"],
        pins: [{ name: "Ramen Shop", lat: 38.712, lng: -9.14 }],
      },
    ]);
    const result = await t.action(api.tripPlanner.createTripPlan, {
      city: "Lisbon",
      days: 1,
      pace: "easy",
      interests: [],
    });
    const trip = await t.query(api.tripPlannerData.getTripPlan, {
      tripId: result.tripId!,
    });
    const why = Object.fromEntries(
      trip!.days.flat().map((stop) => [stop.name, stop.why]),
    );
    expect(why).toEqual({
      "Santa Joana": "The best restaurants in Lisbon",
      Prado: "The best restaurants in Lisbon",
      "Ramen Shop": "Rich tonkotsu and a long queue",
    });
  });

  it("returns no trip and stores nothing when there is nothing to plan", async () => {
    const { t, base } = await setup([]);
    expect(
      await t.action(api.tripPlanner.createTripPlan, {
        city: "Lisbon",
        days: 3,
        pace: "balanced",
        interests: ["food"],
      }),
    ).toEqual({ tripId: null, saves: 0, suggested: 0 });
    expect(
      await base.run((ctx) => ctx.db.query("tripPlans").collect()),
    ).toEqual([]);
  });

  it("leaves out places marked visited", async () => {
    const { base, t, userId, itemIds } = await setup();
    await base.run(async (ctx) => {
      await ctx.db.insert("placeVisits", {
        userId,
        key: "redfrog",
        name: "Red Frog",
        itemId: itemIds[1],
        visitedAt: Date.now(),
      });
    });
    const result = await t.action(api.tripPlanner.createTripPlan, {
      city: "Lisbon",
      days: 1,
      pace: "easy",
      interests: [],
    });
    const trip = await t.query(api.tripPlannerData.getTripPlan, {
      tripId: result.tripId!,
    });
    expect(trip!.days.flat().map((stop) => stop.name)).toEqual(["Ramen Shop"]);
  });
});

describe("createTripPlan with Apple Maps", () => {
  it("keeps a removed place out when Apple finds it again from a surviving label", async () => {
    await stubMaps();
    vi.stubGlobal("fetch", fakeApple());
    const pin = { name: "Tigre", lat: 38.715, lng: -9.13 };
    const { t, itemIds } = await setup([
      { title: "Tigre", places: ["Tigre"], pins: [pin] },
      { title: "Same place, another label", places: ["Tigre, Alfama"] },
      {
        title: "Another place",
        places: ["Sol"],
        pins: [{ ...pin, name: "Sol" }],
      },
    ]);
    await t.mutation(api.placeRemovals.removePlace, {
      itemId: itemIds[0],
      ...pin,
    });
    const { tripId } = await t.action(api.tripPlanner.createTripPlan, {
      city: "Lisbon",
      days: 1,
      pace: "balanced",
      interests: [],
      locale: "en-GB",
    });
    const trip = await t.query(api.tripPlannerData.getTripPlan, {
      tripId: tripId!,
    });
    expect(
      [...trip!.days.flat(), ...trip!.unplanned].map((s) => s.name),
    ).toEqual(["Sol"]);
  });

  it("keeps a place the user saved again after removing it, when only Apple can pin it", async () => {
    await stubMaps();
    vi.stubGlobal("fetch", fakeApple());
    const pin = { name: "Tigre", lat: 38.715, lng: -9.13 };
    const { base, t, userId, itemIds } = await setup([
      { title: "Tigre", places: ["Tigre"], pins: [pin] },
      {
        title: "Another place",
        places: ["Sol"],
        pins: [{ ...pin, name: "Sol" }],
      },
    ]);
    await t.mutation(api.placeRemovals.removePlace, {
      itemId: itemIds[0],
      ...pin,
    });
    await base.run(async (ctx) => {
      await ctx.db.insert("items", {
        userId,
        type: "link",
        status: "ready",
        title: "Tigre again",
        cities: ["Lisbon"],
        places: ["Tigre"],
        url: "https://www.tiktok.com/@someone/video/2",
        tags: [],
        searchText: "Tigre again",
      });
    });
    const { tripId } = await t.action(api.tripPlanner.createTripPlan, {
      city: "Lisbon",
      days: 1,
      pace: "balanced",
      interests: [],
      locale: "en-GB",
    });
    const trip = await t.query(api.tripPlannerData.getTripPlan, {
      tripId: tripId!,
    });
    expect(
      [...trip!.days.flat(), ...trip!.unplanned].map((s) => s.name).sort(),
    ).toEqual(["Sol", "Tigre"]);
  });

  it("adds suggestions from the saves' taste, balanced across interests, without chains or far results", async () => {
    await stubMaps();
    const fetchMock = fakeApple();
    vi.stubGlobal("fetch", fetchMock);
    const { t } = await setup();

    const result = await t.action(api.tripPlanner.createTripPlan, {
      city: "Lisbon",
      days: 2,
      pace: "balanced",
      interests: ["food", "drinks", "culture"],
      stay: "Hotel Avenida",
      locale: "en-GB",
    });
    // 2 days × 5 stops: three saves (one looked up), seven suggestions, five spare.
    expect(result).toMatchObject({ saves: 3, suggested: 12 });
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(24);

    const asked = searches(fetchMock);
    expect(asked[0]).toEqual({ q: "ramen", categories: "Restaurant,Bakery" });
    expect(asked[1]).toEqual({
      q: "speakeasy",
      categories: "Nightlife,Brewery,Winery,Distillery",
    });
    expect(asked[2]).toEqual({
      q: "museums",
      categories: "Museum,Theater,MusicVenue,Planetarium",
    });

    const trip = await t.query(api.tripPlannerData.getTripPlan, {
      tripId: result.tripId!,
    });
    const stops = [...trip!.days.flat(), ...trip!.unplanned];
    expect(stops).toHaveLength(15);
    expect(trip!.days.flat()).toHaveLength(10);
    expect(trip!.unplanned).toHaveLength(5);
    expect(stops.filter((stop) => stop.source === "save")).toHaveLength(3);
    expect(stops.map((stop) => stop.name)).not.toContain("Starbucks");
    expect(stops.some((stop) => stop.name.includes("Porto"))).toBe(false);
    const suggested = stops.filter((stop) => stop.source === "suggested");
    expect(suggested.every((stop) => stop.itemId === undefined)).toBe(true);
    expect(suggested[0]).toMatchObject({ area: "Baixa" });
    const kinds = suggested.map((stop) => stop.category);
    for (const kind of ["Restaurant", "Nightlife", "Museum"]) {
      expect(kinds.filter((k) => k === kind).length).toBeGreaterThanOrEqual(3);
    }
    expect(trip!.stay).toEqual({
      name: "Hotel Avenida",
      lat: 38.715,
      lng: -9.13,
    });
    const azulejo = stops.find((stop) => stop.name === "Museu do Azulejo");
    expect(azulejo).toMatchObject({ source: "save", lat: 38.715 });

    // My Trips counts what the days hold, not the unplanned extras.
    const [summary] = (
      await t.query(api.tripPlannerData.listTripPlans, FIRST_PAGE)
    ).page;
    expect(summary).toMatchObject({ stopCount: 10, savedCount: 3 });
  });

  it("stores the interests sent and suggests nothing when none are", async () => {
    await stubMaps();
    const fetchMock = fakeApple();
    vi.stubGlobal("fetch", fetchMock);
    const { t } = await setup();

    const result = await t.action(api.tripPlanner.createTripPlan, {
      city: "Lisbon",
      days: 2,
      pace: "balanced",
      interests: [],
      locale: "en-GB",
    });
    expect(result).toMatchObject({ suggested: 0 });
    expect(searches(fetchMock)).toEqual([]);
    const [summary] = (
      await t.query(api.tripPlannerData.listTripPlans, FIRST_PAGE)
    ).page;
    expect(summary.interests).toEqual([]);
  });

  it("suggests no lodging and not a saved place's namesake next door", async () => {
    await stubMaps();
    const fetchMock = vi.fn(async (input: string) => {
      const url = new URL(input);
      if (url.pathname === "/v1/token") {
        return Response.json({ accessToken: "maps", expiresInSeconds: 1800 });
      }
      return reply([
        {
          name: "Locke de Santa Joana",
          id: "locke",
          poiCategory: "Restaurant",
          latitude: 38.7201,
          longitude: -9.1451,
        },
        {
          name: "Pousada de Lisboa",
          id: "pousada",
          poiCategory: "Hotel",
          latitude: 38.71,
          longitude: -9.14,
        },
        {
          name: "Taberna Sal Grosso",
          id: "taberna",
          poiCategory: "Restaurant",
          latitude: 38.712,
          longitude: -9.13,
        },
      ]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { t } = await setup([
      {
        title: "Santa Joana",
        places: ["Santa Joana"],
        pins: [
          {
            name: "Santa Joana",
            lat: 38.72,
            lng: -9.145,
            category: "Restaurant",
          },
        ],
      },
    ]);
    const result = await t.action(api.tripPlanner.createTripPlan, {
      city: "Lisbon",
      days: 1,
      pace: "easy",
      interests: ["food"],
    });
    const trip = await t.query(api.tripPlannerData.getTripPlan, {
      tripId: result.tripId!,
    });
    const names = [...trip!.days.flat(), ...trip!.unplanned].map(
      (stop) => stop.name,
    );
    expect(names.sort()).toEqual(["Santa Joana", "Taberna Sal Grosso"]);
  });

  it("makes no Apple call for an account that declined AI and plans from stored pins", async () => {
    await stubMaps();
    const fetchMock = fakeApple();
    vi.stubGlobal("fetch", fetchMock);
    const { base, t, userId } = await setup();
    await base.run((ctx) => setTestConsent(ctx, userId, "declined"));

    const result = await t.action(api.tripPlanner.createTripPlan, {
      city: "Lisbon",
      days: 1,
      pace: "easy",
      interests: ["food"],
      stay: "Hotel Avenida",
    });
    expect(result).toMatchObject({ saves: 2, suggested: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    const trip = await t.query(api.tripPlannerData.getTripPlan, {
      tripId: result.tripId!,
    });
    expect(trip?.stay).toEqual({ name: "Hotel Avenida" });
  });

  it("keeps pinned saves within the cap when many saves have no pin and Maps is off", async () => {
    const unpinned: Save[] = Array.from({ length: 40 }, (_, i) => ({
      title: `Guide ${i}`,
      places: [`Unpinned Place ${i}`],
    }));
    const pinned: Save = {
      title: "One pinned",
      places: ["Pinned Place"],
      pins: [{ name: "Pinned Place", lat: 38.71, lng: -9.14 }],
    };
    const { t } = await setup([...unpinned, pinned]);
    for (let run = 0; run < 3; run++) {
      const result = await t.action(api.tripPlanner.createTripPlan, {
        city: "Lisbon",
        days: 1,
        pace: "easy",
        interests: ["food"],
      });
      expect(result.saves).toBe(1);
    }
  });

  it("charges both attempts of a saved-place lookup to the call budget", async () => {
    await stubMaps();
    // Every search finds nothing, so each lookup also makes its second attempt.
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = new URL(input);
      if (url.pathname === "/v1/token")
        return Response.json({ accessToken: "maps", expiresInSeconds: 1800 });
      if (url.pathname === "/v1/geocode")
        return Response.json({ results: [{ coordinate: LISBON }] });
      return reply([]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const unpinned: Save[] = Array.from({ length: 12 }, (_, i) => ({
      title: `Guide ${i}`,
      places: [`Unpinned Place ${i}`],
    }));
    const { t } = await setup(unpinned);
    await t.action(api.tripPlanner.createTripPlan, {
      city: "Lisbon",
      days: 3,
      pace: "packed",
      interests: ["food", "coffee", "drinks", "culture"],
      stay: "Hotel Avenida",
    });
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(24);
  });

  it("geocodes the city when no save has a pin, and keeps within the call budget", async () => {
    await stubMaps();
    const fetchMock = fakeApple();
    vi.stubGlobal("fetch", fetchMock);
    const { t } = await setup([]);

    const result = await t.action(api.tripPlanner.createTripPlan, {
      city: "Lisbon",
      days: 15,
      pace: "packed",
      interests: [
        "food",
        "coffee",
        "drinks",
        "culture",
        "sights",
        "outdoors",
        "shopping",
      ],
    });
    expect(result.saves).toBe(0);
    expect(result.suggested).toBeGreaterThan(0);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(24);
    const geocodes = fetchMock.mock.calls.filter(
      ([input]) => new URL(input).pathname === "/v1/geocode",
    );
    expect(geocodes).toHaveLength(1);
  });
});

describe("trip ownership", () => {
  it("hides and protects one account's trip from another", async () => {
    const { base, t } = await setup();
    const { tripId } = await t.action(api.tripPlanner.createTripPlan, {
      city: "Lisbon",
      days: 1,
      pace: "easy",
      interests: [],
    });
    const other = await addUser(base, []);
    expect(
      await other.t.query(api.tripPlannerData.getTripPlan, {
        tripId: tripId!,
      }),
    ).toBeNull();
    expect(
      (await other.t.query(api.tripPlannerData.listTripPlans, FIRST_PAGE)).page,
    ).toEqual([]);
    await expect(
      other.t.mutation(api.tripPlannerData.deleteTripPlan, { tripId: tripId! }),
    ).rejects.toThrow("Trip not found");

    await t.mutation(api.tripPlannerData.deleteTripPlan, { tripId: tripId! });
    expect(
      await t.query(api.tripPlannerData.getTripPlan, { tripId: tripId! }),
    ).toBeNull();
    expect(
      await base.run((ctx) => ctx.db.query("tripStops").collect()),
    ).toEqual([]);
    await expect(
      t.mutation(api.tripPlannerData.deleteTripPlan, { tripId: tripId! }),
    ).rejects.toThrow("Trip not found");
  });

  it("pages My trips newest first, so no trip falls off the end", async () => {
    const { t } = await setup();
    const saved: Id<"tripPlans">[] = [];
    for (let i = 0; i < 3; i++) {
      saved.push(
        await t.mutation(internal.tripPlannerData.saveTripPlanInternal, {
          city: "Lisbon",
          dayCount: 1,
          pace: "easy",
          interests: [],
          days: [
            [{ source: "suggested", name: `Stop ${i}`, lat: 38.7, lng: -9.1 }],
          ],
          unplanned: [],
        }),
      );
    }
    const first = await t.query(api.tripPlannerData.listTripPlans, {
      paginationOpts: { numItems: 2, cursor: null },
    });
    expect(first.page.map((plan) => plan._id)).toEqual([saved[2], saved[1]]);
    expect(first.isDone).toBe(false);
    const rest = await t.query(api.tripPlannerData.listTripPlans, {
      paginationOpts: { numItems: 2, cursor: first.continueCursor },
    });
    expect(rest.page.map((plan) => plan._id)).toEqual([saved[0]]);
    expect(rest.isDone).toBe(true);
  });

  it("keeps a stop when its save is deleted, without pointing at it", async () => {
    const { t, itemIds } = await setup();
    const { tripId } = await t.action(api.tripPlanner.createTripPlan, {
      city: "Lisbon",
      days: 1,
      pace: "easy",
      interests: [],
    });
    await t.mutation(api.items.deleteItem, { id: itemIds[0] });
    const trip = await t.query(api.tripPlannerData.getTripPlan, {
      tripId: tripId!,
    });
    const ramen = trip!.days[0].find((stop) => stop.name === "Ramen Shop");
    expect(ramen).toMatchObject({ source: "save", lat: 38.712 });
    expect(ramen?.itemId).toBeUndefined();
    const frog = trip!.days[0].find((stop) => stop.name === "Red Frog");
    expect(frog?.itemId).toBe(itemIds[1]);
  });

  it("never opens someone else's save from a trip", async () => {
    const { base, t } = await setup();
    const other = await addUser(base, [SAVES[0]]);
    const tripId = await t.mutation(
      internal.tripPlannerData.saveTripPlanInternal,
      {
        city: "Lisbon",
        dayCount: 1,
        pace: "easy",
        interests: [],
        days: [
          [
            {
              source: "save",
              itemId: other.itemIds[0],
              name: "Ramen Shop",
              lat: 38.712,
              lng: -9.14,
            },
            { source: "suggested", name: "Somewhere", lat: 38.7, lng: -9.1 },
          ],
        ],
        unplanned: [],
      },
    );
    const trip = await t.query(api.tripPlannerData.getTripPlan, { tripId });
    expect(trip!.days[0].map((stop) => stop.name)).toEqual([
      "Ramen Shop",
      "Somewhere",
    ]);
    expect(trip!.days[0][0].itemId).toBeUndefined();
  });
});

describe("a personal trip", () => {
  it("ignores the caller's shared lists when no list is named", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { base, t, userId } = await setup();
    await base.run(async (ctx) => {
      const listId = await ctx.db.insert("sharedLists", {
        ownerId: userId,
        name: "Ours",
        inviteToken: "t",
        placeCount: 1,
        createdAt: 1,
      });
      await ctx.db.insert("sharedListMembers", {
        listId,
        userId,
        joinedAt: 1,
        seenAt: 1,
      });
      await ctx.db.insert("sharedListPlaces", {
        listId,
        addedBy: userId,
        name: "List Only Spot",
        lat: 38.715,
        lng: -9.14,
        city: "Lisbon",
        addedAt: 1,
      });
    });
    const result = await t.action(api.tripPlanner.createTripPlan, {
      city: "Lisbon",
      days: 1,
      pace: "easy",
      interests: [],
    });
    const trip = await t.query(api.tripPlannerData.getTripPlan, {
      tripId: result.tripId!,
    });
    const names = [
      ...(trip?.days.flat() ?? []),
      ...(trip?.unplanned ?? []),
    ].map((stop) => stop.name);
    expect(names).not.toContain("List Only Spot");
    expect(trip?.listId).toBeUndefined();
  });
});
