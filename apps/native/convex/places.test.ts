// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import { newConvexTest } from "./test.setup";

const fetchGoogleMapsList = vi.hoisted(() => vi.fn());

vi.mock("./model/readers/googleMaps", () => ({ fetchGoogleMapsList }));

afterEach(() => {
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
  found: Record<string, { lat: number; lng: number; label?: string }>,
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

describe("places:forMap", () => {
  it("returns only live rows, with kinds", async () => {
    const base = newConvexTest();
    const userId = await base.run((ctx) => ctx.db.insert("users", {}));
    const t = base.withIdentity({ subject: `${userId}|session-1` });
    await base.mutation(internal.places.store, {
      city: "Lisbon",
      places: [{ ...cafe("A", "Live Cafe"), category: "Cafe" }, cafe("B")],
    });
    const hidden = (await rows(base)).find((r) => r.appleId === "B")!;
    await base.run((ctx) => ctx.db.patch(hidden._id, { status: "hidden" }));
    const result = await t.query(api.places.forMap, {});
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "Live Cafe",
      city: "Lisbon",
      appleId: "A",
    });
    expect(result[0].kinds.length).toBeGreaterThan(0);
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

  it("lists an Apple miss, a place without a point and a far match as missed", async () => {
    await withApple({
      Found: { lat: 38.71, lng: -9.13 },
      Drifted: { lat: 38.75, lng: -9.13 },
    });
    fetchGoogleMapsList.mockResolvedValue({
      placeList: [
        { name: "Found", lat: 38.71, lng: -9.13 },
        { name: "Unknown", lat: 38.7, lng: -9.1 },
        { name: "No point" },
        { name: "Drifted", lat: 38.71, lng: -9.13 },
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
      missed: ["Unknown", "No point", "Drifted"],
    });
    expect(await rows(t)).toMatchObject([
      { name: "Found", sources: [{ url: "https://maps.app.goo.gl/x" }] },
    ]);
  });
});
