// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import type { FunctionArgs, FunctionReference } from "convex/server";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";

import { MAX_PLACE_NAME_CHARS, placeKey } from "./model/plan";
import { newConvexTest, setTestConsent, signedInUser } from "./test.setup";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { visitMatcher } from "./model/placeVisits";
import { rateLimiter } from "./model/rateLimiter";

const PARIS = { lat: 48.8566, lng: 2.3522 };
const NEXT_DOOR = { lat: 48.8576, lng: 2.3522 };
const LONDON = { lat: 51.5074, lng: -0.1278 };

async function setup(options: { pro?: boolean } = {}) {
  const backend = newConvexTest();
  const { t, userId } = await signedInUser(backend, {
    pro: options.pro ?? true,
  });
  const itemId = await t.run(async (ctx) =>
    ctx.db.insert("items", {
      userId,
      type: "link",
      status: "ready",
      title: "Tigre",
      tags: [],
      searchText: "Tigre",
    }),
  );
  const visits = () =>
    t.run(async (ctx) =>
      ctx.db
        .query("placeVisits")
        .withIndex("by_user_and_visited", (q) => q.eq("userId", userId))
        .collect(),
    );
  const mark = (
    name: string,
    visited: boolean,
    spot?: { lat: number; lng: number; appleId?: string },
  ) =>
    t.mutation(api.placeVisits.setVisited, {
      itemId,
      name,
      visited,
      ...(spot ? { spot } : {}),
    });
  return { backend, t, userId, itemId, visits, mark };
}

describe("setVisited", () => {
  it("still takes what installed apps send, and an optional spot", () => {
    expectTypeOf<{
      itemId: Id<"items">;
      name: string;
      visited: boolean;
    }>().toExtend<FunctionArgs<typeof api.placeVisits.setVisited>>();
    expectTypeOf(api.placeVisits.setVisited).toEqualTypeOf<
      FunctionReference<
        "mutation",
        "public",
        {
          itemId: Id<"items">;
          name: string;
          visited: boolean;
          spot?: { lat: number; lng: number; appleId?: string };
        },
        null
      >
    >();
  });

  it("marks a place once and takes the mark back", async () => {
    const { t, itemId, visits } = await setup();

    await t.mutation(api.placeVisits.setVisited, {
      itemId,
      name: "Caffé  Dante",
      visited: true,
    });
    await t.mutation(api.placeVisits.setVisited, {
      itemId,
      name: "caffe dante",
      visited: true,
    });
    expect(await visits()).toMatchObject([
      { key: "caffedante", name: "caffe dante", itemId },
    ]);

    await t.mutation(api.placeVisits.setVisited, {
      itemId,
      name: "Caffé Dante",
      visited: false,
    });
    expect(await visits()).toHaveLength(0);
  });

  it("requires Pro", async () => {
    const { t, itemId, visits } = await setup({ pro: false });
    await expect(
      t.mutation(api.placeVisits.setVisited, {
        itemId,
        name: "Tigre",
        visited: true,
      }),
    ).rejects.toMatchObject({ data: { code: "pro_required" } });
    expect(await visits()).toHaveLength(0);
  });

  it("lets someone whose Pro ended take a mark back, but not make one", async () => {
    const { t, userId, visits, mark } = await setup();
    await mark("Tigre", true, PARIS);
    await mark("Blend", true);
    await t.run(async (ctx) => {
      const subscription = await ctx.db
        .query("subscriptions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique();
      await ctx.db.delete(subscription!._id);
    });

    await mark("Tigre", false, PARIS);
    await mark("Blend", false);
    expect(await visits()).toEqual([]);
    await expect(mark("Tigre", true, PARIS)).rejects.toMatchObject({
      data: { code: "pro_required" },
    });
  });

  it("lets a person mark 25 places of one city in one sitting", async () => {
    const { visits, mark } = await setup();
    for (let index = 0; index < 25; index += 1) {
      await mark(`Place ${index}`, true, {
        lat: 30.26 + index / 1000,
        lng: -97.74,
      });
    }
    expect(await visits()).toHaveLength(25);
  });

  it("takes a mark back once the hour's marks are spent", async () => {
    const { t, userId, visits, mark } = await setup();
    await mark("Tigre", true, PARIS);
    await t.run((ctx) =>
      rateLimiter.limit(ctx, "placeVisit", { key: userId, count: 199 }),
    );

    await expect(mark("Blend", true, PARIS)).rejects.toMatchObject({
      data: { kind: "RateLimited", name: "placeVisit" },
    });
    await mark("Tigre", false, PARIS);
    expect(await visits()).toEqual([]);

    await t.run((ctx) =>
      rateLimiter.limit(ctx, "placeVisitClear", { key: userId, count: 199 }),
    );
    await expect(mark("Tigre", false, PARIS)).rejects.toMatchObject({
      data: { kind: "RateLimited", name: "placeVisitClear" },
    });
  });

  it("refuses another user's save and a name with no letters", async () => {
    const { backend, t, itemId } = await setup();
    const other = await signedInUser(backend, { pro: true });

    await expect(
      other.t.mutation(api.placeVisits.setVisited, {
        itemId,
        name: "Tigre",
        visited: true,
      }),
    ).rejects.toThrow("Item not found");
    await expect(
      t.mutation(api.placeVisits.setVisited, {
        itemId,
        name: " !! ",
        visited: true,
      }),
    ).rejects.toThrow("Place name is empty");
  });

  it("records where a place was marked, once per spot, and a second city under its name", async () => {
    const { visits, mark } = await setup();

    await mark("Shake Shack", true, { ...PARIS, appleId: "P-1" });
    await mark("Shake Shack", true, { ...NEXT_DOOR, appleId: "P-1" });
    await mark("shake shack", true, { ...LONDON, appleId: " L-1 " });

    expect(await visits()).toMatchObject([
      {
        key: "shakeshack",
        name: "shake shack",
        spots: [
          { ...PARIS, appleId: "P-1" },
          { ...LONDON, appleId: "L-1" },
        ],
      },
    ]);
  });

  it("takes back one city's mark and keeps the other's", async () => {
    const { visits, mark } = await setup();
    await mark("Shake Shack", true, { ...PARIS, appleId: "P-1" });
    await mark("Shake Shack", true, { ...LONDON, appleId: "L-1" });

    await mark("Shake Shack", false, { ...PARIS, appleId: "P-1" });
    expect(await visits()).toMatchObject([
      { key: "shakeshack", spots: [{ ...LONDON, appleId: "L-1" }] },
    ]);

    await mark("Shake Shack", false, { ...LONDON, appleId: "L-1" });
    expect(await visits()).toEqual([]);
  });

  it("takes back a mark made without an Apple id from a few doors away", async () => {
    const { visits, mark } = await setup();
    await mark("Blend", true, PARIS);
    await mark("Blend", false, NEXT_DOOR);
    expect(await visits()).toEqual([]);
  });

  it("leaves another branch's mark when one branch is taken back", async () => {
    const { visits, mark } = await setup();
    await mark("Blue Bottle Coffee", true, { ...PARIS, appleId: "A" });
    await mark("Blue Bottle Coffee", true, { ...NEXT_DOOR, appleId: "B" });
    expect((await visits())[0]?.spots).toHaveLength(2);

    await mark("Blue Bottle Coffee", false, { ...NEXT_DOOR, appleId: "B" });
    expect(await visits()).toMatchObject([
      { spots: [{ ...PARIS, appleId: "A" }] },
    ]);
  });

  it("narrows a mark made by name alone to the spot it is marked again at", async () => {
    const { visits, mark } = await setup();
    await mark("Tigre", true);
    const [legacy] = await visits();
    expect(legacy).not.toHaveProperty("spots");

    await mark("Tigre", true, PARIS);
    const [refreshed] = await visits();
    expect(refreshed?.spots).toEqual([PARIS]);
    expect(refreshed?.visitedAt).toBeGreaterThanOrEqual(legacy!.visitedAt);

    await mark("Tigre", false, PARIS);
    expect(await visits()).toEqual([]);
  });

  it("reads where an installed app's mark was made from the save's pin", async () => {
    const { t, itemId, visits, mark } = await setup();
    await t.run((ctx) =>
      ctx.db.patch(itemId, {
        placePins: [{ name: "Shake Shack", ...PARIS, appleId: "P-1" }],
      }),
    );
    await mark("Shake Shack", true, LONDON);

    await mark("Shake Shack", true);
    expect((await visits())[0]?.spots).toEqual([
      LONDON,
      { ...PARIS, appleId: "P-1" },
    ]);

    await mark("Shake Shack", false);
    expect((await visits())[0]?.spots).toEqual([LONDON]);
  });

  it("lists a mark made by name alone at the places its save carries", async () => {
    const { t, userId, itemId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.patch(itemId, {
        placePins: [{ name: "Starbucks", ...PARIS }],
      });
      await ctx.db.insert("placeVisits", {
        userId,
        key: "starbucks",
        name: "Starbucks",
        itemId,
        visitedAt: 1,
      });
    });

    expect(await t.query(api.placeVisits.listVisits, {})).toEqual([
      { key: "starbucks", name: "Starbucks", spots: [PARIS] },
    ]);
  });

  it("takes back a venue marked under another name, by its Apple id", async () => {
    const { visits, mark } = await setup();
    await mark("Franklin BBQ", true, { ...PARIS, appleId: "X" });
    await mark("Micho", true, { ...PARIS, appleId: "M" });

    await mark("Franklin Barbecue", false, { ...NEXT_DOOR, appleId: "X" });
    expect((await visits()).map((visit) => visit.key)).toEqual(["micho"]);
  });

  it("keeps marks made at places when an installed app takes back a name its save has no pin for", async () => {
    const { visits, mark } = await setup();
    await mark("Shake Shack", true, PARIS);
    await mark("Shake Shack", true, LONDON);
    await mark("Shake Shack", false);
    expect((await visits())[0]?.spots).toEqual([PARIS, LONDON]);

    await mark("Tigre", true);
    await mark("Tigre", false);
    expect((await visits()).map((visit) => visit.key)).toEqual(["shakeshack"]);
  });

  it("marks and takes back every pin of the name on an installed app's save", async () => {
    const { t, itemId, visits, mark } = await setup();
    await t.run((ctx) =>
      ctx.db.patch(itemId, {
        placePins: [
          { name: "Jo's Coffee", ...PARIS },
          { name: "Jo's Coffee", ...LONDON },
        ],
      }),
    );
    await mark("Jo's Coffee", true, { lat: 30.26, lng: -97.74 });

    await mark("Jo's Coffee", true);
    expect((await visits())[0]?.spots).toEqual([
      { lat: 30.26, lng: -97.74 },
      PARIS,
      LONDON,
    ]);

    await mark("Jo's Coffee", false);
    expect((await visits())[0]?.spots).toEqual([{ lat: 30.26, lng: -97.74 }]);
  });

  it("keeps one branch's mark when the branch next door is marked and taken back", async () => {
    const { visits, mark } = await setup();
    await mark("Blue Bottle", true, PARIS);
    await mark("Blue Bottle", true, { ...NEXT_DOOR, appleId: "B" });
    expect((await visits())[0]?.spots).toEqual([
      PARIS,
      { ...NEXT_DOOR, appleId: "B" },
    ]);

    await mark("Blue Bottle", false, { ...NEXT_DOOR, appleId: "B" });
    expect((await visits())[0]?.spots).toEqual([PARIS]);
  });

  it("marks and clears an unidentified branch without changing a nearby identified branch", async () => {
    const { visits, mark } = await setup();
    const identified = { ...PARIS, appleId: "A" };
    await mark("Tigre", true, identified);
    await mark("Tigre", true, NEXT_DOOR);
    expect((await visits())[0]?.spots).toEqual([identified, NEXT_DOOR]);

    await mark("Tigre", false, NEXT_DOOR);
    expect((await visits())[0]?.spots).toEqual([identified]);
  });

  it("preserves the location of a legacy mark when an older app marks a save without pins", async () => {
    const { t, userId, mark } = await setup();
    const spot = { ...PARIS, appleId: "A" };
    await t.run(async (ctx) => {
      const sourceId = await ctx.db.insert("items", {
        userId,
        type: "link",
        status: "ready",
        title: "Tigre",
        tags: [],
        searchText: "Tigre",
        placePins: [{ name: "Tigre", ...spot }],
      });
      await ctx.db.insert("placeVisits", {
        userId,
        key: "tigre",
        name: "Tigre",
        itemId: sourceId,
        visitedAt: 1,
      });
    });

    await mark("Tigre", true);
    await mark("Tigre", false);
    expect(await t.query(api.placeVisits.listVisits, {})).toEqual([
      { key: "tigre", name: "Tigre", spots: [spot] },
    ]);
  });

  it.each(["inferred", "different"] as const)(
    "handles an explicit %s pin on a save with an ambiguous legacy visit",
    async (kind) => {
      const { t, userId, itemId, visits, mark } = await setup();
      const paris = { ...PARIS, appleId: "A" };
      const dallas = { lat: 32.7767, lng: -96.797, appleId: "D" };
      await t.run(async (ctx) => {
        await ctx.db.patch(itemId, {
          placePins: [
            { name: "Tigre", ...paris },
            { name: "Tigre", ...LONDON },
          ],
        });
        await ctx.db.insert("placeVisits", {
          userId,
          key: "tigre",
          name: "Tigre",
          itemId,
          visitedAt: 1,
        });
      });
      await mark("Tigre", true, kind === "inferred" ? paris : dallas);
      expect((await visits())[0]?.spots).toEqual(
        kind === "inferred" ? [paris] : [paris, LONDON, dallas],
      );
    },
  );

  it("refuses an older app's first mark when it would record more than 20 spots", async () => {
    const { t, itemId, visits, mark } = await setup();
    await t.run((ctx) =>
      ctx.db.patch(itemId, {
        placePins: Array.from({ length: 21 }, (_, i) => ({
          name: "Tigre",
          lat: 20 + i * 0.1,
          lng: 0,
          appleId: String(i),
        })),
      }),
    );
    await expect(mark("Tigre", true)).rejects.toThrow(
      "Place has too many visited spots",
    );
    expect(await visits()).toEqual([]);
  });

  it.each([
    ["Tigre", "Tigre, Alfama"],
    ["Tigre, Alfama", "Tigre"],
  ])(
    "clears a spot marked as %s when undoing it as %s",
    async (marked, pin) => {
      const { mark, visits } = await setup();
      await mark(pin, true, NEXT_DOOR);
      await mark(marked, true, PARIS);
      await mark(pin, false, PARIS);
      expect(await visits()).toMatchObject([{ name: pin, spots: [NEXT_DOOR] }]);
    },
  );

  it("refuses a spot past the cap and keeps every earlier one", async () => {
    const { t, userId, itemId, visits, mark } = await setup();
    const spots = Array.from({ length: 20 }, (_, i) => ({
      lat: 10 + i,
      lng: 20,
    }));
    await t.run((ctx) =>
      ctx.db.insert("placeVisits", {
        userId,
        key: "starbucks",
        name: "Starbucks",
        itemId,
        visitedAt: 1,
        spots,
      }),
    );

    await expect(mark("Starbucks", true, LONDON)).rejects.toThrow(
      "Place has too many visited spots",
    );
    expect((await visits())[0]?.spots).toEqual(spots);
  });

  it("refuses a spot off the map", async () => {
    const { visits, mark } = await setup();
    await expect(mark("Tigre", true, { lat: 91, lng: 0 })).rejects.toThrow(
      "Place position is invalid",
    );
    await expect(
      mark("Tigre", true, { lat: 0, lng: Number.NaN }),
    ).rejects.toThrow("Place position is invalid");
    expect(await visits()).toEqual([]);
  });
});

describe("listVisits", () => {
  it("agrees with Home for an address-qualified legacy mark on a bare pin", async () => {
    const { t, userId, itemId } = await setup();
    const pin = { name: "Tigre", ...PARIS };
    const name = "Tigre, Alfama";
    await t.run(async (ctx) => {
      await ctx.db.patch(itemId, {
        cities: ["Lisbon"],
        places: [name],
        placePins: [pin],
      });
      await ctx.db.insert("placeVisits", {
        userId,
        itemId,
        name,
        key: "tigrealfama",
        visitedAt: 1,
      });
    });

    const visits = await t.query(api.placeVisits.listVisits, {});
    expect(await t.query(api.items.listCities, {})).toMatchObject([
      { city: "Lisbon", placeCount: 1, visitedCount: 1 },
    ]);
    expect(visitMatcher(visits, [pin])(pin)).toBe(true);
  });

  it("lists only the caller's marks, with where each was made", async () => {
    const { backend, t, mark } = await setup();
    await mark("Caffé Dante", true);
    await mark("Shake Shack", true, { ...PARIS, appleId: "P-1" });
    const other = await signedInUser(backend, { pro: true });

    expect(await t.query(api.placeVisits.listVisits, {})).toEqual([
      {
        key: "shakeshack",
        name: "Shake Shack",
        spots: [{ ...PARIS, appleId: "P-1" }],
      },
      { key: "caffedante", name: "Caffé Dante" },
    ]);
    expect(await other.t.query(api.placeVisits.listVisits, {})).toEqual([]);
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

async function withMaps(failures = 0) {
  let failed = 0;
  vi.stubEnv("APPLE_MAPS_PRIVATE_KEY", await testKey());
  vi.stubEnv("APPLE_MAPS_KEY_ID", "KEY1");
  vi.stubEnv("APPLE_MAPS_TEAM_ID", "TEAM1");
  const fetchMock = vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.pathname === "/v1/token") {
      return Response.json({ accessToken: "maps", expiresInSeconds: 1800 });
    }
    if (failed < failures) {
      failed += 1;
      return new Response("busy", { status: 429 });
    }
    return Response.json({
      results: [{ country: "Portugal", countryCode: "pt" }],
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return () =>
    fetchMock.mock.calls.filter(
      ([input]) => new URL(input).pathname === "/v1/reverseGeocode",
    ).length;
}

const PIN = { name: "Tigre", lat: 38.71, lng: -9.14 };

async function passportSetup(options: { pro?: boolean } = {}) {
  const backend = newConvexTest();
  const { t, userId } = await signedInUser(backend, {
    pro: options.pro ?? true,
  });
  const itemId = await t.run(async (ctx) =>
    ctx.db.insert("items", {
      userId,
      type: "link",
      status: "ready",
      title: "Tigre",
      tags: [],
      searchText: "Tigre",
      cities: ["Lisbon"],
      heroImageUrl: "https://example.com/tigre.jpg",
      placePins: [PIN],
    }),
  );
  const visits = () =>
    t.run(async (ctx) =>
      ctx.db
        .query("placeVisits")
        .withIndex("by_user_and_visited", (q) => q.eq("userId", userId))
        .collect(),
    );
  const stamps = () => t.query(api.placeVisits.getPassport, {});
  return { backend, t, userId, itemId, visits, stamps };
}

async function settle(
  t: Awaited<ReturnType<typeof passportSetup>>["t"],
  run: () => Promise<unknown>,
) {
  await run();
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

describe("the passport", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("takes back a stamp after its save is deleted, and only the caller's", async () => {
    const { backend, t, itemId, visits, stamps } = await passportSetup();
    const other = await signedInUser(backend, { pro: true });
    const spot = { lat: PIN.lat, lng: PIN.lng };
    await t.mutation(api.placeVisits.setVisited, {
      itemId,
      name: "Tigre",
      visited: true,
      spot,
    });
    await t.run((ctx) => ctx.db.delete(itemId));
    expect(await stamps()).toHaveLength(1);

    await other.t.mutation(api.placeVisits.setVisited, {
      itemId,
      name: "Tigre",
      visited: false,
      spot,
    });
    expect(await visits()).toHaveLength(1);

    await t.mutation(api.placeVisits.setVisited, {
      itemId,
      name: "Tigre",
      visited: false,
      spot,
    });
    expect(await visits()).toEqual([]);
    expect(await stamps()).toEqual([]);
    await expect(
      t.mutation(api.placeVisits.setVisited, {
        itemId,
        name: "Tigre",
        visited: true,
      }),
    ).rejects.toThrow("Item not found");
  });

  it("takes back one branch of an old stamp and keeps the other", async () => {
    const { t, userId, itemId, visits, stamps } = await passportSetup();
    const first = { lat: PIN.lat, lng: PIN.lng };
    const second = { lat: 41.15, lng: -8.61 };
    await t.run(async (ctx) => {
      await ctx.db.insert("placeVisits", {
        userId,
        key: "tigre",
        name: "Tigre",
        itemId,
        visitedAt: 1,
        stampPlaces: [
          { ...first, city: "Lisbon", countryCode: "PT" },
          { ...second, city: "Porto", countryCode: "PT" },
        ],
      });
      await ctx.db.delete(itemId);
    });
    await t.mutation(api.placeVisits.setVisited, {
      itemId,
      name: "Tigre",
      visited: false,
      spot: first,
    });
    expect(await visits()).toHaveLength(1);
    expect(await stamps()).toMatchObject([{ ...second, city: "Porto" }]);
  });

  it("unmarks an old stamp by name after its save is deleted", async () => {
    const { t, userId, itemId, visits } = await passportSetup();
    await t.run(async (ctx) => {
      await ctx.db.insert("placeVisits", {
        userId,
        key: "tigre",
        name: "Tigre",
        itemId,
        visitedAt: 1,
        stampPlaces: [{ lat: PIN.lat, lng: PIN.lng, city: "Lisbon" }],
      });
      await ctx.db.delete(itemId);
    });
    await t.mutation(api.placeVisits.setVisited, {
      itemId,
      name: "Tigre",
      visited: false,
    });
    expect(await visits()).toEqual([]);
  });

  it("keeps a stored branch the save no longer pins when another is cleared", async () => {
    const { t, userId, itemId, visits, stamps } = await passportSetup();
    const second = { name: "Tigre", lat: 41.15, lng: -8.61 };
    await t.run(async (ctx) => {
      await ctx.db.insert("placeVisits", {
        userId,
        key: "tigre",
        name: "Tigre",
        itemId,
        visitedAt: 1,
        stampPlaces: [
          { lat: PIN.lat, lng: PIN.lng, city: "Lisbon" },
          { lat: second.lat, lng: second.lng, city: "Porto" },
        ],
      });
    });
    await t.mutation(api.placeVisits.setVisited, {
      itemId,
      name: "Tigre",
      visited: false,
      spot: { lat: PIN.lat, lng: PIN.lng },
    });
    expect(await visits()).toHaveLength(1);
    expect(await stamps()).toMatchObject([
      { lat: second.lat, lng: second.lng, city: "Porto" },
    ]);
  });

  it("keeps a stored stamp in the passport after the save drops its pin", async () => {
    await withMaps();
    const { t, userId, itemId, stamps } = await passportSetup();
    const second = { lat: 41.15, lng: -8.61 };
    await t.run((ctx) =>
      ctx.db.insert("placeVisits", {
        userId,
        key: "tigre",
        name: "Tigre",
        itemId,
        visitedAt: 1,
        stampPlaces: [
          { lat: PIN.lat, lng: PIN.lng, city: "Lisbon", countryCode: "PT" },
          { ...second, city: "Porto", countryCode: "PT" },
        ],
      }),
    );
    await settle(t, () =>
      t.mutation(internal.placeVisits.backfillCountries, { cursor: null }),
    );
    expect(await stamps()).toMatchObject([
      { lat: PIN.lat, lng: PIN.lng, city: "Lisbon" },
      { ...second, city: "Porto" },
    ]);
  });

  it("still lists every stamp when its saves are too large to read", async () => {
    const { t, userId, stamps } = await passportSetup();
    const count = 50;
    await t.run(async (ctx) => {
      for (let i = 0; i < count; i++) {
        const spot = { lat: 38 + i / 100, lng: -9 };
        const itemId = await ctx.db.insert("items", {
          userId,
          type: "link",
          status: "ready",
          title: `Place ${i}`,
          tags: [],
          searchText: "x".repeat(100_000),
          cities: ["Lisbon"],
          heroImageUrl: "https://example.com/cover.jpg",
          placePins: [{ name: `Place ${i}`, ...spot }],
        });
        await ctx.db.insert("placeVisits", {
          userId,
          key: placeKey(`Place ${i}`),
          name: `Place ${i}`,
          itemId,
          visitedAt: i + 1,
          spots: [spot],
          stampPlaces: [{ ...spot, city: "Lisbon", countryCode: "PT" }],
        });
      }
    });
    const listed = await stamps();
    expect(listed).toHaveLength(count);
    expect(listed.every((stamp) => stamp.countryCode === "PT")).toBe(true);
    expect(listed[0]?.cover).toBe("https://example.com/cover.jpg");
    expect(listed.at(-1)?.cover).toBeNull();
  });

  it("backfills the pin and country of a mark made before the Passport", async () => {
    const lookups = await withMaps();
    const { t, userId, itemId, stamps } = await passportSetup();
    await t.run((ctx) =>
      ctx.db.insert("placeVisits", {
        userId,
        key: "tigre",
        name: "Tigre",
        itemId,
        visitedAt: 1,
      }),
    );
    await settle(t, () =>
      t.mutation(internal.placeVisits.backfillCountries, { cursor: null }),
    );
    expect(await stamps()).toMatchObject([
      { lat: PIN.lat, lng: PIN.lng, city: "Lisbon", countryCode: "PT" },
    ]);
    expect(lookups()).toBe(1);
  });

  it("finds the pin of an old mark whose name was cut short", async () => {
    await withMaps();
    const { t, userId, itemId, stamps } = await passportSetup();
    const long = `Tigre ${"x".repeat(120)}`;
    await t.run(async (ctx) => {
      await ctx.db.patch(itemId, { placePins: [{ ...PIN, name: long }] });
      await ctx.db.insert("placeVisits", {
        userId,
        key: placeKey(long),
        name: long.slice(0, MAX_PLACE_NAME_CHARS),
        itemId,
        visitedAt: 1,
      });
    });
    await settle(t, () =>
      t.mutation(internal.placeVisits.backfillCountries, { cursor: null }),
    );
    expect(await stamps()).toMatchObject([{ lat: PIN.lat, countryCode: "PT" }]);
  });

  it("keeps an old mark's city and country after its save is deleted", async () => {
    await withMaps();
    const { t, userId, itemId, visits, stamps } = await passportSetup();
    await t.run((ctx) =>
      ctx.db.insert("placeVisits", {
        userId,
        key: "tigre",
        name: "Tigre",
        itemId,
        visitedAt: 1,
      }),
    );
    await settle(t, () =>
      t.mutation(internal.placeVisits.backfillCountries, { cursor: null }),
    );
    await t.run((ctx) => ctx.db.delete(itemId));
    await settle(t, () =>
      t.mutation(internal.placeVisits.backfillCountries, { cursor: null }),
    );
    expect((await visits())[0].stampPlaces).toMatchObject([
      { lat: PIN.lat, city: "Lisbon", countryCode: "PT" },
    ]);
    expect(await stamps()).toMatchObject([
      { lat: PIN.lat, city: "Lisbon", countryCode: "PT" },
    ]);
  });

  it("leaves a deleting account's marks alone in the backfill", async () => {
    const lookups = await withMaps();
    const { t, userId, itemId, visits } = await passportSetup();
    await t.run(async (ctx) => {
      await ctx.db.insert("placeVisits", {
        userId,
        key: "tigre",
        name: "Tigre",
        itemId,
        visitedAt: 1,
      });
      await ctx.db.patch(userId, { deleting: true });
    });
    await settle(t, () =>
      t.mutation(internal.placeVisits.backfillCountries, { cursor: null }),
    );
    expect((await visits())[0].stampPlaces).toBeUndefined();
    expect(lookups()).toBe(0);
  });

  it("keeps the pin, city and country of a place marked I went", async () => {
    const lookups = await withMaps();
    const { backend, t, itemId, visits, stamps } = await passportSetup();
    await settle(backend, () =>
      t.mutation(api.placeVisits.setVisited, {
        itemId,
        name: "Tigre",
        visited: true,
      }),
    );
    expect(await stamps()).toMatchObject([
      { lat: PIN.lat, lng: PIN.lng, city: "Lisbon", countryCode: "PT" },
    ]);
    expect((await visits())[0]?.backfilled).toBeUndefined();

    await settle(backend, () =>
      t.mutation(api.placeVisits.setVisited, {
        itemId,
        name: "Tigre",
        visited: true,
      }),
    );
    expect(lookups()).toBe(1);
    expect(await stamps()).toMatchObject([{ countryCode: "PT" }]);
  });

  it("stamps the city of the pin a city page marks, and keeps the same name elsewhere unstamped", async () => {
    await withMaps();
    const { backend, t, userId, itemId, stamps } = await passportSetup();
    await t.run((ctx) =>
      ctx.db.insert("items", {
        userId,
        type: "link",
        status: "ready",
        title: "Tigre Porto",
        tags: [],
        searchText: "Tigre",
        cities: ["Porto"],
        placePins: [{ ...PIN, lat: 41.15, lng: -8.61 }],
      }),
    );
    await settle(backend, () =>
      t.mutation(api.placeVisits.setVisited, {
        itemId,
        name: "Tigre",
        visited: true,
        spot: { lat: PIN.lat, lng: PIN.lng },
      }),
    );
    expect(await stamps()).toMatchObject([
      { lat: PIN.lat, city: "Lisbon", countryCode: "PT" },
    ]);
    expect(
      await t.query(api.placeVisits.listUnstampedPlaces, {}),
    ).toMatchObject([{ name: "Tigre", city: "Porto" }]);
  });

  it("tries a failed country lookup again, and gives up after three", async () => {
    const lookups = await withMaps(1);
    const { backend, t, itemId, stamps } = await passportSetup();
    await settle(backend, () =>
      t.mutation(api.placeVisits.setVisited, {
        itemId,
        name: "Tigre",
        visited: true,
      }),
    );
    expect(lookups()).toBe(2);
    expect(await stamps()).toMatchObject([{ countryCode: "PT" }]);

    await t.mutation(api.placeVisits.setVisited, {
      itemId,
      name: "Tigre",
      visited: false,
    });
    const failing = await withMaps(10);
    await settle(backend, () =>
      t.mutation(api.placeVisits.markVisitedBefore, {
        places: [{ itemId, name: "Tigre" }],
      }),
    );
    expect(failing()).toBe(3);
  });

  it("asks Apple nothing for someone who declined AI", async () => {
    const lookups = await withMaps();
    const { backend, t, userId, itemId, stamps } = await passportSetup();
    await backend.run((ctx) => setTestConsent(ctx, userId, "declined"));
    await settle(backend, () =>
      t.mutation(api.placeVisits.setVisited, {
        itemId,
        name: "Tigre",
        visited: true,
      }),
    );
    expect(lookups()).toBe(0);
    expect(await stamps()).toMatchObject([{ city: "Lisbon" }]);
    expect((await stamps())[0]?.countryCode).toBeUndefined();
  });

  it("drops a country found for a point the visit no longer has", async () => {
    const { t, itemId, visits, stamps } = await passportSetup();
    await t.mutation(api.placeVisits.setVisited, {
      itemId,
      name: "Tigre",
      visited: true,
    });
    const [visit] = await visits();
    await t.mutation(internal.placeVisits.storeCountry, {
      visitId: visit!._id,
      lat: 1,
      lng: 2,
      countryCode: "ES",
    });
    expect((await stamps())[0]?.countryCode).toBeUndefined();
  });

  it("keeps a stamp's country when its save's pin moves a little", async () => {
    const lookups = await withMaps();
    const { t, userId, itemId, stamps } = await passportSetup();
    const moved = { ...PIN, lat: PIN.lat + 0.0005 };
    await t.run(async (ctx) => {
      await ctx.db.insert("placeVisits", {
        userId,
        key: "tigre",
        name: "Tigre",
        itemId,
        visitedAt: 1,
        stampPlaces: [
          { lat: PIN.lat, lng: PIN.lng, city: "Lisbon", countryCode: "PT" },
        ],
      });
      await ctx.db.patch(itemId, { placePins: [moved] });
    });
    expect(await stamps()).toMatchObject([
      { lat: moved.lat, countryCode: "PT" },
    ]);
    await settle(t, () =>
      t.mutation(internal.placeVisits.backfillCountries, { cursor: null }),
    );
    expect(await stamps()).toMatchObject([
      { lat: moved.lat, city: "Lisbon", countryCode: "PT" },
    ]);
    expect(lookups()).toBe(0);
  });

  it("looks up a nearby branch's country instead of copying another branch's", async () => {
    const lookups = await withMaps();
    const { t, userId, itemId, visits } = await passportSetup();
    const branch = { ...PIN, lat: PIN.lat + 0.001 };
    await t.run(async (ctx) => {
      await ctx.db.insert("placeVisits", {
        userId,
        key: "tigre",
        name: "Tigre",
        itemId,
        visitedAt: 1,
        spots: [{ lat: PIN.lat, lng: PIN.lng }],
        stampPlaces: [
          { lat: PIN.lat, lng: PIN.lng, city: "Lisbon", countryCode: "ES" },
        ],
      });
      await ctx.db.patch(itemId, { placePins: [PIN, branch] });
    });
    await settle(t, () =>
      t.mutation(api.placeVisits.setVisited, {
        itemId,
        name: "Tigre",
        visited: true,
        spot: { lat: branch.lat, lng: branch.lng },
      }),
    );
    const [visit] = await visits();
    expect(visit?.stampPlaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lat: PIN.lat, countryCode: "ES" }),
        expect.objectContaining({ lat: branch.lat, countryCode: "PT" }),
      ]),
    );
    expect(lookups()).toBe(1);
  });

  it("looks up the country of a moved stamp that has none", async () => {
    const lookups = await withMaps();
    const { t, userId, itemId, visits } = await passportSetup();
    const moved = { ...PIN, lat: PIN.lat + 0.0005 };
    await t.run(async (ctx) => {
      await ctx.db.insert("placeVisits", {
        userId,
        key: "tigre",
        name: "Tigre",
        itemId,
        visitedAt: 1,
        stampPlaces: [{ lat: PIN.lat, lng: PIN.lng, city: "Lisbon" }],
      });
      await ctx.db.patch(itemId, { placePins: [moved] });
    });
    await settle(t, () =>
      t.mutation(api.placeVisits.setVisited, {
        itemId,
        name: "Tigre",
        visited: true,
      }),
    );
    const [visit] = await visits();
    expect(visit?.stampPlaces).toEqual([
      { lat: moved.lat, lng: moved.lng, city: "Lisbon", countryCode: "PT" },
    ]);
    expect(lookups()).toBe(1);
  });

  it("gives a branch marked next to a cleared one its own country", async () => {
    const lookups = await withMaps();
    const { t, userId, itemId, visits } = await passportSetup();
    const near = { ...PIN, lat: PIN.lat + 0.001 };
    const far = { ...PIN, lat: PIN.lat + 0.05 };
    await t.run(async (ctx) => {
      await ctx.db.insert("placeVisits", {
        userId,
        key: "tigre",
        name: "Tigre",
        itemId,
        visitedAt: 1,
        spots: [
          { lat: PIN.lat, lng: PIN.lng },
          { lat: far.lat, lng: far.lng },
        ],
        stampPlaces: [
          { lat: PIN.lat, lng: PIN.lng, city: "Lisbon", countryCode: "ES" },
          { lat: far.lat, lng: far.lng, city: "Lisbon", countryCode: "ES" },
        ],
      });
      await ctx.db.patch(itemId, { placePins: [PIN, near, far] });
    });
    await t.mutation(api.placeVisits.setVisited, {
      itemId,
      name: "Tigre",
      visited: false,
      spot: { lat: PIN.lat, lng: PIN.lng },
    });
    await settle(t, () =>
      t.mutation(api.placeVisits.setVisited, {
        itemId,
        name: "Tigre",
        visited: true,
        spot: { lat: near.lat, lng: near.lng },
      }),
    );
    const [visit] = await visits();
    expect(visit?.stampPlaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lat: far.lat, countryCode: "ES" }),
        expect.objectContaining({ lat: near.lat, countryCode: "PT" }),
      ]),
    );
    expect(visit?.stampPlaces).toHaveLength(2);
    expect(lookups()).toBe(1);
  });

  it("keeps a corrected branch's own country when a nearby branch is cleared", async () => {
    const { t, userId, itemId, visits } = await passportSetup();
    const oldBranch = { lat: PIN.lat + 0.0018, lng: PIN.lng };
    const corrected = { ...PIN, lat: PIN.lat + 0.00045 };
    await t.run(async (ctx) => {
      await ctx.db.insert("placeVisits", {
        userId,
        key: "tigre",
        name: "Tigre",
        itemId,
        visitedAt: 1,
        stampPlaces: [
          { lat: PIN.lat, lng: PIN.lng, city: "Lisbon", countryCode: "ES" },
          { ...oldBranch, city: "Lisbon", countryCode: "FR" },
        ],
      });
      await ctx.db.patch(itemId, { placePins: [PIN, corrected] });
    });
    await t.mutation(api.placeVisits.setVisited, {
      itemId,
      name: "Tigre",
      visited: false,
      spot: { lat: PIN.lat, lng: PIN.lng },
    });
    const [visit] = await visits();
    expect(visit?.stampPlaces).toEqual([
      expect.objectContaining({ countryCode: "FR" }),
    ]);
  });

  it("stores no country once the account is being deleted", async () => {
    const { t, userId, itemId, visits } = await passportSetup();
    await t.mutation(api.placeVisits.setVisited, {
      itemId,
      name: "Tigre",
      visited: true,
    });
    const [visit] = await visits();
    await t.run((ctx) => ctx.db.patch(userId, { deleting: true }));
    await t.mutation(internal.placeVisits.storeCountry, {
      visitId: visit!._id,
      lat: PIN.lat,
      lng: PIN.lng,
      countryCode: "PT",
    });
    const [after] = await visits();
    expect(after?.stampPlaces?.[0]?.countryCode).toBeUndefined();
  });

  it("counts an old stamp once after its save's pin is corrected", async () => {
    const { t, userId, itemId, stamps } = await passportSetup();
    await t.run(async (ctx) => {
      await ctx.db.insert("placeVisits", {
        userId,
        key: "tigre",
        name: "Tigre",
        itemId,
        visitedAt: 1,
        stampPlaces: [{ lat: PIN.lat, lng: PIN.lng, city: "Lisbon" }],
      });
      await ctx.db.patch(itemId, {
        placePins: [{ ...PIN, lat: PIN.lat + 0.0005 }],
      });
    });
    expect(await stamps()).toHaveLength(1);
  });

  it("marks places from before Shelvr without a date, in one go, past the single-mark limit", async () => {
    const { t, itemId, visits } = await passportSetup();
    await t.mutation(api.placeVisits.setVisited, {
      itemId,
      name: "Tigre",
      visited: true,
    });
    const [kept] = await visits();
    const names = Array.from({ length: 30 }, (_, i) => `Spot ${i + 1}`);
    const count = await t.mutation(api.placeVisits.markVisitedBefore, {
      places: [...names, "Tigre", "spot 1"].map((name) => ({ itemId, name })),
    });
    expect(count).toBe(31);
    const all = await visits();
    expect(all).toHaveLength(31);
    expect(all.find((visit) => visit.key === "tigre")).toEqual(kept);
    expect(
      all
        .filter((visit) => visit.key !== "tigre")
        .every((visit) => visit.backfilled),
    ).toBe(true);
  });

  it("stamps one name once in each city a batch marks it in", async () => {
    const { t, userId, itemId, stamps } = await passportSetup();
    const porto = await t.run(async (ctx) =>
      ctx.db.insert("items", {
        userId,
        type: "link",
        status: "ready",
        title: "Tigre Porto",
        tags: [],
        searchText: "Tigre",
        cities: ["Porto"],
        placePins: [{ ...PIN, lat: 41.15, lng: -8.61 }],
      }),
    );
    await t.mutation(api.placeVisits.markVisitedBefore, {
      places: [
        { itemId, name: "Tigre" },
        { itemId: porto, name: "tigre" },
      ],
    });
    expect(await stamps()).toMatchObject([
      { key: "tigre", city: "Lisbon" },
      { key: "tigre", city: "Porto" },
    ]);
  });

  it("waits for the shared budget, then finds the country", async () => {
    const lookups = await withMaps();
    const { backend, t, itemId, stamps } = await passportSetup();
    await backend.run((ctx) =>
      rateLimiter.limit(ctx, "visitCountryGlobal", { count: 100 }),
    );
    await settle(backend, () =>
      t.mutation(api.placeVisits.setVisited, {
        itemId,
        name: "Tigre",
        visited: true,
      }),
    );
    expect(lookups()).toBe(1);
    expect(await stamps()).toMatchObject([
      { city: "Lisbon", countryCode: "PT" },
    ]);
  });

  it("spends no shared budget for someone who declined AI", async () => {
    await withMaps();
    const { backend, t, userId, itemId } = await passportSetup();
    await backend.run((ctx) => setTestConsent(ctx, userId, "declined"));
    await settle(backend, () =>
      t.mutation(api.placeVisits.setVisited, {
        itemId,
        name: "Tigre",
        visited: true,
      }),
    );
    const left = await backend.run((ctx) =>
      rateLimiter.check(ctx, "visitCountryGlobal", { count: 100 }),
    );
    expect(left.ok).toBe(true);
  });

  it("refuses a batch over another user's save, and marks nothing", async () => {
    const { backend, itemId } = await passportSetup();
    const other = await signedInUser(backend, { pro: true });
    const ownItem = await other.t.run(async (ctx) =>
      ctx.db.insert("items", {
        userId: other.userId,
        type: "link",
        status: "ready",
        title: "Tigre",
        tags: [],
        searchText: "Tigre",
        placePins: [PIN],
      }),
    );
    await expect(
      other.t.mutation(api.placeVisits.markVisitedBefore, {
        places: [
          { itemId: ownItem, name: "Tigre" },
          { itemId, name: "Tigre" },
        ],
      }),
    ).rejects.toThrow("Item not found");
    expect(
      await other.t.run((ctx) =>
        ctx.db
          .query("placeVisits")
          .withIndex("by_user_and_visited", (q) => q.eq("userId", other.userId))
          .take(5),
      ),
    ).toEqual([]);
  });

  it("keeps a visit's pin and country when a save without that pin marks it again", async () => {
    await withMaps();
    const { backend, t, userId, itemId, stamps } = await passportSetup();
    await settle(backend, () =>
      t.mutation(api.placeVisits.setVisited, {
        itemId,
        name: "Tigre",
        visited: true,
      }),
    );
    const bare = await t.run(async (ctx) =>
      ctx.db.insert("items", {
        userId,
        type: "link",
        status: "ready",
        title: "Tigre again",
        tags: [],
        searchText: "Tigre",
      }),
    );
    await t.mutation(api.placeVisits.setVisited, {
      itemId: bare,
      name: "Tigre",
      visited: true,
    });
    expect(await stamps()).toMatchObject([
      { itemId, lat: PIN.lat, city: "Lisbon", countryCode: "PT" },
    ]);
  });

  it("finds the country past a malformed result", async () => {
    vi.stubEnv("APPLE_MAPS_PRIVATE_KEY", await testKey());
    vi.stubEnv("APPLE_MAPS_KEY_ID", "KEY1");
    vi.stubEnv("APPLE_MAPS_TEAM_ID", "TEAM1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) =>
        new URL(input).pathname === "/v1/token"
          ? Response.json({ accessToken: "maps", expiresInSeconds: 1800 })
          : Response.json({
              results: [{ countryCode: "PRT" }, { countryCode: "pt" }],
            }),
      ),
    );
    const { backend, t, itemId, stamps } = await passportSetup();
    await settle(backend, () =>
      t.mutation(api.placeVisits.setVisited, {
        itemId,
        name: "Tigre",
        visited: true,
      }),
    );
    expect(await stamps()).toMatchObject([{ countryCode: "PT" }]);
  });

  it("lists stamps newest first with covers, and pins old plan marks from their save", async () => {
    const { t, userId, itemId } = await passportSetup();
    await t.run((ctx) =>
      ctx.db.insert("placeVisits", {
        userId,
        key: "tigre",
        name: "Tigre",
        itemId,
        visitedAt: 1,
      }),
    );
    await t.mutation(api.placeVisits.markVisitedBefore, {
      places: [{ itemId, name: "Cervejaria" }],
    });
    expect(await t.query(api.placeVisits.getPassport, {})).toEqual([
      expect.objectContaining({
        key: "cervejaria",
        backfilled: true,
        cover: "https://example.com/tigre.jpg",
      }),
      expect.objectContaining({
        key: "tigre",
        lat: PIN.lat,
        lng: PIN.lng,
        city: "Lisbon",
        cover: "https://example.com/tigre.jpg",
      }),
    ]);
  });

  it("names the app a stamp's reel was saved from", async () => {
    const { t, itemId } = await passportSetup();
    const app = async (url: string) => {
      await t.run((ctx) => ctx.db.patch(itemId, { url }));
      const [stamp] = await t.query(api.placeVisits.getPassport, {});
      return stamp.source;
    };
    await t.mutation(api.placeVisits.markVisitedBefore, {
      places: [{ itemId, name: "Tigre" }],
    });
    expect(await app("https://www.instagram.com/reel/abc/")).toBe("instagram");
    expect(await app("https://www.tiktok.com/@a/video/123")).toBe("tiktok");
    expect(await app("https://www.youtube.com/watch?v=abcdefghijk")).toBe(
      undefined,
    );
  });

  it("lists unstamped places with a city, newest save first, once each", async () => {
    const { t, userId, itemId } = await passportSetup();
    const newer = await t.run((ctx) =>
      ctx.db.insert("items", {
        userId,
        type: "link",
        status: "ready",
        title: "Porto and Lisbon",
        tags: [],
        searchText: "Porto and Lisbon",
        cities: ["Porto", "Lisbon"],
        placePins: [
          { name: "Majestic", lat: 41.15, lng: -8.61, city: "Porto" },
          { name: "Somewhere", lat: 40, lng: -8 },
          { name: "Tigre", lat: PIN.lat, lng: PIN.lng, city: "Lisbon" },
        ],
      }),
    );
    await t.mutation(api.placeVisits.markVisitedBefore, {
      places: [{ itemId, name: "Majestic" }],
    });

    expect(await t.query(api.placeVisits.listUnstampedPlaces, {})).toEqual([
      {
        itemId: newer,
        name: "Tigre",
        city: "Lisbon",
        spot: { lat: PIN.lat, lng: PIN.lng },
        title: "Porto and Lisbon",
        cover: null,
      },
    ]);
  });

  it("lists a name once per city, with its own pin's city", async () => {
    const { t, userId, stamps } = await passportSetup();
    const save = (city: string, lat: number) =>
      t.run((ctx) =>
        ctx.db.insert("items", {
          userId,
          type: "link",
          status: "ready",
          title: city,
          tags: [],
          searchText: city,
          cities: ["Lisbon", "Porto"],
          placePins: [
            { name: "Cafe Uno", lat: lat + 1, lng: -8 },
            { name: "Cafe Uno", lat, lng: -8, city },
          ],
        }),
      );
    const porto = await save("Porto", 41.15);
    const newer = await save("Lisbon", 38.7);

    const rows = await t.query(api.placeVisits.listUnstampedPlaces, {});
    expect(rows.filter((row) => row.name === "Cafe Uno")).toEqual([
      {
        itemId: newer,
        name: "Cafe Uno",
        city: "Lisbon",
        spot: { lat: 38.7, lng: -8 },
        title: "Lisbon",
        cover: null,
      },
      {
        itemId: porto,
        name: "Cafe Uno",
        city: "Porto",
        spot: { lat: 41.15, lng: -8 },
        title: "Porto",
        cover: null,
      },
    ]);

    await t.mutation(api.placeVisits.markVisitedBefore, {
      places: [{ itemId: newer, name: "Cafe Uno" }],
    });
    expect(await stamps()).toContainEqual(
      expect.objectContaining({ lat: 38.7, city: "Lisbon" }),
    );
    expect(
      (await t.query(api.placeVisits.listUnstampedPlaces, {}))
        .filter((row) => row.name === "Cafe Uno")
        .map((row) => row.city),
    ).toEqual(["Porto"]);
  });

  it("marks only the branch picked when one save has two of the same name", async () => {
    const { t, userId, stamps } = await passportSetup();
    const both = await t.run((ctx) =>
      ctx.db.insert("items", {
        userId,
        type: "link",
        status: "ready",
        title: "Cafe Uno twice",
        tags: [],
        searchText: "Cafe Uno",
        cities: ["Lisbon", "Porto"],
        placePins: [
          { name: "Cafe Uno", lat: 38.7, lng: -9.1, city: "Lisbon" },
          { name: "Cafe Uno", lat: 41.15, lng: -8.6, city: "Porto" },
        ],
      }),
    );
    const listed = (
      await t.query(api.placeVisits.listUnstampedPlaces, {})
    ).filter((row) => row.name === "Cafe Uno");
    const lisbon = listed.find((row) => row.city === "Lisbon")!;
    await t.mutation(api.placeVisits.markVisitedBefore, {
      places: [{ itemId: both, name: lisbon.name, spot: lisbon.spot }],
    });
    expect(
      (await stamps()).filter((stamp) => stamp.name === "Cafe Uno"),
    ).toMatchObject([{ city: "Lisbon", lat: 38.7 }]);
    expect(
      (await t.query(api.placeVisits.listUnstampedPlaces, {}))
        .filter((row) => row.name === "Cafe Uno")
        .map((row) => row.city),
    ).toEqual(["Porto"]);
  });

  it("reads a pin's empty city as the save's own city, in the list and the stamp", async () => {
    const { t, itemId, stamps } = await passportSetup();
    await t.run((ctx) =>
      ctx.db.patch(itemId, { placePins: [{ ...PIN, city: "" }] }),
    );

    const rows = await t.query(api.placeVisits.listUnstampedPlaces, {});
    expect(rows).toMatchObject([{ name: "Tigre", city: "Lisbon" }]);

    await t.mutation(api.placeVisits.markVisitedBefore, {
      places: [{ itemId, name: "Tigre" }],
    });
    expect(await stamps()).toMatchObject([{ city: "Lisbon" }]);
  });
});
