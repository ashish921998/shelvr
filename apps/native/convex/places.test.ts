// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, components, internal } from "./_generated/api";
import { indexPlace } from "./model/placeIndex";
import { newConvexTest } from "./test.setup";

const fetchGoogleMapsList = vi.hoisted(() => vi.fn());

vi.mock("./model/readers/googleMaps", () => ({ fetchGoogleMapsList }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fetchGoogleMapsList.mockReset();
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

const LISBON = { lat: 38.72, lng: -9.14 };
const PORTO = { lat: 41.15, lng: -8.61 };

async function withApple(
  found: Record<
    string,
    { lat: number; lng: number; label?: string; status?: number }
  >,
) {
  vi.stubEnv("APPLE_MAPS_PRIVATE_KEY", await testKey());
  vi.stubEnv("APPLE_MAPS_KEY_ID", "KEY1");
  vi.stubEnv("APPLE_MAPS_TEAM_ID", "TEAM1");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = new URL(input);
      if (url.pathname === "/v1/token")
        return Response.json({ accessToken: "maps", expiresInSeconds: 1800 });
      const q = url.searchParams.get("q") ?? "";
      const name = q.split(",")[0];
      if (url.pathname === "/v1/geocode")
        return Response.json({
          results: [
            {
              name: q,
              coordinate: { latitude: LISBON.lat, longitude: LISBON.lng },
            },
          ],
        });
      const at = found[name];
      if (at?.status) return new Response(null, { status: at.status });
      const label = at?.label ?? name;
      return Response.json({
        results: at
          ? [
              {
                name: label,
                id: `ID-${label}`,
                poiCategory: "Cafe",
                coordinate: { latitude: at.lat, longitude: at.lng },
              },
            ]
          : [],
      });
    }),
  );
}

const cafe = (appleId: string, name = appleId) => ({
  name,
  lat: 38.7,
  lng: -9.1,
  appleId,
});

async function rows(t: ReturnType<typeof newConvexTest>) {
  return await t.run((ctx) => ctx.db.query("places").collect());
}

describe("places:store", () => {
  it("inserts live rows and dedupes by appleId within and across calls", async () => {
    const t = newConvexTest();
    const first = await t.mutation(internal.places.store, {
      city: "Lisbon",
      places: [cafe("A"), cafe("A"), cafe("B")],
    });
    expect(first).toEqual({ added: 2, existing: 1 });
    const again = await t.mutation(internal.places.store, {
      city: "Lisbon",
      places: [cafe("A"), cafe("B")],
    });
    expect(again).toEqual({ added: 0, existing: 2 });
    expect(await rows(t)).toMatchObject([
      { appleId: "A", status: "live", city: "Lisbon" },
      { appleId: "B", status: "live" },
    ]);
  });

  it("appends a new source once and stops at three", async () => {
    const t = newConvexTest();
    const call = (source: string) =>
      t.mutation(internal.places.store, {
        city: "Lisbon",
        places: [cafe("A")],
        source,
      });
    await call("s1");
    await call("s1");
    await call("s2");
    await call("s3");
    await call("s4");
    const [row] = await rows(t);
    expect(row.sources).toEqual([{ url: "s1" }, { url: "s2" }, { url: "s3" }]);
  });
});

const WORLD = { west: -180, south: -85, east: 180, north: 85 };
const LISBON_BOX = { west: -9.3, south: 38.6, east: -8.9, north: 38.8 };

function signedIn() {
  const base = newConvexTest();
  return base
    .run((ctx) => ctx.db.insert("users", {}))
    .then((userId) => ({
      base,
      user: base.withIdentity({ subject: `${userId}|session-1` }),
    }));
}

const venue = (appleId: string, lat: number, lng: number) => ({
  name: appleId,
  lat,
  lng,
  appleId,
});

async function storeAll(
  t: ReturnType<typeof newConvexTest>,
  places: ReturnType<typeof venue>[],
) {
  for (let i = 0; i < places.length; i += 50)
    await t.mutation(internal.places.store, {
      city: "Anywhere",
      places: places.slice(i, i + 50),
    });
}

async function names(
  user: ReturnType<ReturnType<typeof newConvexTest>["withIdentity"]>,
  box: typeof WORLD,
) {
  const result = await user.query(api.places.inArea, { box });
  return result.places.map((place) => place.name).sort();
}

async function indexed(t: ReturnType<typeof newConvexTest>, key: string) {
  return await t.run((ctx) =>
    ctx.runQuery(components.geospatial.document.get, { key }),
  );
}

describe("places:forMap", () => {
  it("returns live rows with kinds", async () => {
    const { base, user } = await signedIn();
    await base.mutation(internal.places.store, {
      city: "Lisbon",
      places: [{ ...cafe("A", "Live Cafe"), category: "Cafe" }],
    });
    const result = await user.query(api.places.forMap, {});
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "Live Cafe",
      city: "Lisbon",
      appleId: "A",
    });
    expect(result[0].kinds.length).toBeGreaterThan(0);
  });

  it("returns only the places inside the box", async () => {
    const { base, user } = await signedIn();
    await storeAll(base, [
      venue("Lisbon", 38.72, -9.14),
      venue("Porto", 41.15, -8.61),
      venue("Tokyo", 35.68, 139.69),
    ]);
    expect(
      await names(user, { west: -10, south: 38, east: -9, north: 39 }),
    ).toEqual(["Lisbon"]);
    expect(
      await names(user, { west: -10, south: 38, east: -8, north: 42 }),
    ).toEqual(["Lisbon", "Porto"]);
    expect(
      await names(user, { west: 20, south: -10, east: 30, north: 10 }),
    ).toEqual([]);
    expect(
      await names(user, { west: -100, south: 0, east: 0, north: 60 }),
    ).toEqual(["Lisbon", "Porto"]);
    expect(
      await names(user, { west: 100, south: 0, east: 200, north: 60 }),
    ).toEqual(["Tokyo"]);
  });

  it("answers a caller that sends no box with the live places", async () => {
    const { base, user } = await signedIn();
    await storeAll(base, [
      venue("Keep", 38.7, -9.1),
      venue("Hide", 35.68, 139.69),
    ]);
    const hidden = (await rows(base)).find((r) => r.appleId === "Hide")!;
    await base.run((ctx) => ctx.db.patch(hidden._id, { status: "hidden" }));
    const result = await user.query(api.places.forMap, {});
    expect(result.map((place) => place.name)).toEqual(["Keep"]);
  });

  it("caps the answer", async () => {
    const { base, user } = await signedIn();
    await storeAll(
      base,
      Array.from({ length: 320 }, (_, i) =>
        venue(
          `P${i}`,
          38.7 + (i % 20) / 1000,
          -9.2 + Math.floor(i / 20) / 1000,
        ),
      ),
    );
    const result = await user.query(api.places.inArea, { box: WORLD });
    expect(result.places).toHaveLength(300);
    expect(new Set(result.places.map((place) => place._id)).size).toBe(300);
    expect(result.complete).toBe(false);
    const narrow = await user.query(api.places.inArea, {
      box: { west: -9.3, south: 38.6, east: -9.1, north: 38.8 },
    });
    expect(narrow.places).toHaveLength(300);
    expect(narrow.complete).toBe(false);
  }, 60_000);

  it("says the answer is complete only when it read the whole area", async () => {
    const { base, user } = await signedIn();
    await storeAll(base, [venue("Lisbon", 38.72, -9.14)]);
    const small = await user.query(api.places.inArea, {
      box: { west: -10, south: 38, east: -9, north: 39 },
    });
    expect(small).toMatchObject({
      complete: true,
      places: [{ name: "Lisbon" }],
    });
    await base.run(async (ctx) => {
      for (let i = 0; i < 2000; i++)
        await ctx.db.insert("places", {
          name: `South${i}`,
          city: "South",
          lat: -40,
          lng: i / 100,
          appleId: `South${i}`,
          status: "live",
          addedAt: i,
        });
    });
    const wide = await user.query(api.places.inArea, {
      box: { west: -180, south: 0, east: 180, north: 60 },
    });
    expect(wide.places.map((place) => place.name)).toEqual(["Lisbon"]);
    expect(wide.complete).toBe(false);
  }, 60_000);

  it("leaves out a row hidden after it was indexed", async () => {
    const { base, user } = await signedIn();
    await storeAll(base, [
      venue("Keep", 38.7, -9.1),
      venue("Hide", 38.71, -9.1),
    ]);
    const hidden = (await rows(base)).find((r) => r.appleId === "Hide")!;
    await base.run((ctx) => ctx.db.patch(hidden._id, { status: "hidden" }));
    expect(await names(user, LISBON_BOX)).toEqual(["Keep"]);
    expect(await names(user, WORLD)).toEqual(["Keep"]);
  });

  it("leaves out a row moved out of the area before it was reindexed", async () => {
    const { base, user } = await signedIn();
    await storeAll(base, [
      venue("Keep", 38.7, -9.1),
      venue("Moved", 38.71, -9.1),
    ]);
    const moved = (await rows(base)).find((r) => r.appleId === "Moved")!;
    await base.run((ctx) => ctx.db.patch(moved._id, { lat: 48.85, lng: 2.35 }));
    expect(await names(user, LISBON_BOX)).toEqual(["Keep"]);
  });

  it("finds places on both sides of the antimeridian", async () => {
    const { base, user } = await signedIn();
    await storeAll(base, [
      venue("East", 0, 179.9),
      venue("West", 0, -179.9),
      venue("Middle", 0, 0),
      venue("Wide", 0, 150),
      venue("Pacific", 0, -160),
    ]);
    expect(
      await names(user, { west: 170, south: -5, east: -170, north: 5 }),
    ).toEqual(["East", "West"]);
    expect(
      await names(user, { west: 170, south: -5, east: 190, north: 5 }),
    ).toEqual(["East", "West"]);
    expect(
      await names(user, { west: 190, south: -5, east: 210, north: 5 }),
    ).toEqual(["Pacific"]);
    expect(
      await names(user, { west: -190, south: -5, east: -170, north: 5 }),
    ).toEqual(["East", "West"]);
  });

  it("follows the index cursor past rows outside the box", async () => {
    const { base, user } = await signedIn();
    await base.run(async (ctx) => {
      const add = async (
        appleId: string,
        lat: number,
        lng: number,
        at: number,
      ) => {
        const row = {
          name: appleId,
          city: "Lisbon",
          lat,
          lng,
          appleId,
          status: "live" as const,
          addedAt: at,
        };
        await indexPlace(ctx, {
          _id: await ctx.db.insert("places", row),
          ...row,
        });
      };
      for (let i = 0; i < 1200; i++)
        await add(
          `D${i}`,
          38.700503 + (i % 40) / 10000000,
          -9.0996 + Math.floor(i / 40) / 10000000,
          i,
        );
      for (const n of [1, 2, 3])
        await add(`Target${n}`, 38.7005, -9.0996 + n / 100000000, -5000 - n);
    });
    expect(
      await names(user, {
        west: -9.099601,
        south: 38.700499,
        east: -9.099599,
        north: 38.700501,
      }),
    ).toEqual(["Target1", "Target2", "Target3"]);
  }, 60_000);

  it("answers the world box with every continent", async () => {
    const { base, user } = await signedIn();
    await storeAll(base, [
      venue("A", -33.9, 151.2),
      venue("B", 40.7, -74),
      venue("C", 51.5, -0.1),
      venue("D", 35.7, 139.7),
      venue("E", -22.9, -43.2),
    ]);
    expect(await names(user, WORLD)).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("rejects a box that is not degrees", async () => {
    const { user } = await signedIn();
    await expect(
      user.query(api.places.inArea, { box: { ...WORLD, west: Number.NaN } }),
    ).rejects.toThrow("finite");
    await expect(
      user.query(api.places.inArea, { box: { ...WORLD, south: 10, north: 5 } }),
    ).rejects.toThrow("south");
  });
});

describe("places:forMap read limits", () => {
  it("answers wide and narrow boxes over a dense city and many cells", async () => {
    const base = newConvexTest({ transactionLimits: true });
    const userId = await base.run((ctx) => ctx.db.insert("users", {}));
    const user = base.withIdentity({ subject: `${userId}|session-1` });
    await storeAll(base, [
      ...Array.from({ length: 260 }, (_, i) =>
        venue(
          `SF${i}`,
          37.7 + (i % 20) / 200,
          -122.5 + Math.floor(i / 20) / 200,
        ),
      ),
      ...Array.from({ length: 1600 }, (_, i) => {
        const cell = Math.floor(i / 20);
        return venue(
          `E${i}`,
          -40 + (cell % 10) * 10 + (i % 5) / 50,
          2 + Math.floor(cell / 10) * 11 + Math.floor((i % 20) / 5) / 50,
        );
      }),
    ]);
    const count = async (box?: typeof WORLD) =>
      box
        ? (await user.query(api.places.inArea, { box })).places.length
        : (await user.query(api.places.forMap, {})).length;
    expect(await count()).toBe(1860);
    expect(await count(WORLD)).toBe(300);
    expect(await count({ west: -45, south: -40, east: 45, north: 70 })).toBe(
      300,
    );
    expect(await count({ west: 0, south: -45, east: 80, north: 60 })).toBe(300);
    expect(
      await count({ west: -122.3, south: 37, east: -100, north: 50 }),
    ).toBe(0);
    expect(
      await count({ west: -123, south: 37.5, east: -122, north: 38 }),
    ).toBe(260);
  }, 180_000);
});

describe("places:store indexing", () => {
  it("indexes a row it inserts and leaves an existing row's point alone", async () => {
    const t = newConvexTest();
    await storeAll(t, [venue("A", 38.7, -9.1)]);
    const first = await indexed(t, (await rows(t))[0]._id);
    expect(first).toMatchObject({ coordinates: { latitude: 38.7 } });
    await storeAll(t, [venue("A", 10, 10)]);
    expect(await indexed(t, (await rows(t))[0]._id)).toEqual(first);
  });
});

describe("places:reindexPage", () => {
  it("indexes rows stored without it, across pages, and twice changes nothing", async () => {
    vi.useFakeTimers();
    const { base, user } = await signedIn();
    await base.run(async (ctx) => {
      for (let i = 0; i < 120; i++)
        await ctx.db.insert("places", {
          name: `R${i}`,
          city: "Lisbon",
          lat: 38.7,
          lng: -9.1 + i / 1000,
          appleId: `R${i}`,
          status: "live",
          addedAt: i,
        });
    });
    expect(await names(user, LISBON_BOX)).toEqual([]);
    await base.mutation(internal.places.reindexPage, { cursor: null });
    await base.finishAllScheduledFunctions(vi.runOnlyPendingTimers);
    expect(await names(user, LISBON_BOX)).toHaveLength(120);
    const before = await Promise.all(
      (await rows(base)).map((row) => indexed(base, row._id)),
    );
    await base.mutation(internal.places.reindexPage, { cursor: null });
    await base.finishAllScheduledFunctions(vi.runOnlyPendingTimers);
    const after = await Promise.all(
      (await rows(base)).map((row) => indexed(base, row._id)),
    );
    expect(after).toEqual(before);
    expect(await names(user, LISBON_BOX)).toHaveLength(120);
  }, 60_000);

  it("removes a hidden row from the index", async () => {
    const t = newConvexTest();
    await storeAll(t, [venue("A", 38.7, -9.1)]);
    const [row] = await rows(t);
    expect(await indexed(t, row._id)).not.toBeNull();
    await t.run((ctx) => ctx.db.patch(row._id, { status: "hidden" }));
    await t.mutation(internal.places.reindexPage, { cursor: null });
    expect(await indexed(t, row._id)).toBeNull();
  });
});

describe("places:addByName", () => {
  it("stores a name found in the city, skips one found far away, and is idempotent", async () => {
    await withApple({
      "Pastel Cafe": { lat: 38.71, lng: -9.13 },
      "Far Cafe": PORTO,
    });
    const t = newConvexTest();
    const args = {
      city: "Lisbon",
      names: ["Pastel Cafe", "Far Cafe", "Nowhere"],
      source: "https://example.com/reel",
    };
    const first = await t.action(internal.places.addByName, args);
    expect(first).toEqual({
      added: 1,
      existing: 0,
      missed: ["Far Cafe", "Nowhere"],
    });
    const second = await t.action(internal.places.addByName, args);
    expect(second).toEqual({
      added: 0,
      existing: 1,
      missed: ["Far Cafe", "Nowhere"],
    });
    expect(await rows(t)).toMatchObject([
      {
        name: "Pastel Cafe",
        city: "Lisbon",
        appleId: "ID-Pastel Cafe",
        sources: [{ url: "https://example.com/reel" }],
      },
    ]);
  });

  it("keeps a branch of the named venue, skips another venue Apple offers instead, and drops blank lines", async () => {
    await withApple({
      "Pastl Cafe": { lat: 38.71, lng: -9.13, label: "Other Bar" },
      "Time Out Market": {
        lat: 38.707,
        lng: -9.146,
        label: "Time Out Market Lisboa",
      },
    });
    const t = newConvexTest();
    const report = await t.action(internal.places.addByName, {
      city: "Lisbon",
      names: ["Pastl Cafe", "  ", " Time Out Market "],
    });
    expect(report).toEqual({ added: 1, existing: 0, missed: ["Pastl Cafe"] });
    expect(await rows(t)).toMatchObject([
      { name: "Time Out Market", appleId: "ID-Time Out Market Lisboa" },
    ]);
  });

  it("rejects an empty city and more than 100 names", async () => {
    await withApple({});
    const t = newConvexTest();
    await expect(
      t.action(internal.places.addByName, { city: " ", names: ["x"] }),
    ).rejects.toThrow("city is empty");
    await expect(
      t.action(internal.places.addByName, {
        city: "Lisbon",
        names: Array.from({ length: 101 }, (_, i) => `n${i}`),
      }),
    ).rejects.toThrow("at most 100");
  });

  it("fails rather than reporting misses when Apple is unavailable", async () => {
    await withApple({ Busy: { lat: 38.71, lng: -9.13, status: 429 } });
    const t = newConvexTest();
    await expect(
      t.action(internal.places.addByName, { city: "Lisbon", names: ["Busy"] }),
    ).rejects.toThrow("Apple Maps is unavailable");
    expect(await rows(t)).toEqual([]);
  });
});

describe("places:importGoogleMapsList", () => {
  it("throws when the link is not a list", async () => {
    await withApple({});
    fetchGoogleMapsList.mockResolvedValue(undefined);
    await expect(
      newConvexTest().action(internal.placesImport.importGoogleMapsList, {
        city: "Lisbon",
        url: "https://example.com",
      }),
    ).rejects.toThrow("not a Google Maps list");
  });

  it("lists an Apple miss, a place without a point, a far match and another venue as missed", async () => {
    await withApple({
      Found: { lat: 38.71, lng: -9.13 },
      Drifted: { lat: 38.75, lng: -9.13 },
      Renamed: { lat: 38.7101, lng: -9.1301, label: "Other Bar" },
    });
    fetchGoogleMapsList.mockResolvedValue({
      placeList: [
        { name: "Found", lat: 38.71, lng: -9.13 },
        { name: "Unknown", lat: 38.7, lng: -9.1 },
        { name: "No point" },
        { name: "Drifted", lat: 38.71, lng: -9.13 },
        { name: "Renamed", lat: 38.71, lng: -9.13 },
      ],
    });
    const t = newConvexTest();
    const report = await t.action(internal.placesImport.importGoogleMapsList, {
      city: "Lisbon",
      url: "https://maps.app.goo.gl/x",
    });
    expect(report).toEqual({
      added: 1,
      existing: 0,
      missed: ["Unknown", "No point", "Drifted", "Renamed"],
    });
    expect(await rows(t)).toMatchObject([
      { name: "Found", sources: [{ url: "https://maps.app.goo.gl/x" }] },
    ]);
  });

  it("fails rather than reporting misses when Apple is unavailable", async () => {
    await withApple({ Busy: { lat: 38.71, lng: -9.13, status: 503 } });
    fetchGoogleMapsList.mockResolvedValue({
      placeList: [{ name: "Busy", lat: 38.71, lng: -9.13 }],
    });
    await expect(
      newConvexTest().action(internal.placesImport.importGoogleMapsList, {
        city: "Lisbon",
        url: "https://maps.app.goo.gl/x",
      }),
    ).rejects.toThrow("Apple Maps is unavailable");
  });
});
