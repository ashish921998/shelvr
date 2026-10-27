import { describe, expect, it, vi } from "vitest";

import {
  appleMapsAccessToken,
  appleMapsConfig,
  appleMapsLookup,
  firstPlace,
} from "./appleMaps";
import { distanceKm } from "./trip";

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

function decode(part: string): unknown {
  return JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
}

describe("appleMapsConfig", () => {
  it("is null until all three variables are set", () => {
    expect(appleMapsConfig({ APPLE_MAPS_KEY_ID: "K" })).toBeNull();
    expect(
      appleMapsConfig({
        APPLE_MAPS_PRIVATE_KEY: " key ",
        APPLE_MAPS_KEY_ID: "K",
        APPLE_MAPS_TEAM_ID: "T",
      }),
    ).toEqual({ privateKey: "key", keyId: "K", teamId: "T" });
  });
});

describe("appleMapsAccessToken", () => {
  it("signs a server_api token and returns Apple's access token", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ accessToken: "maps-token", expiresInSeconds: 1800 }),
    );
    const token = await appleMapsAccessToken(
      { privateKey: await testKey(), keyId: "KEY1", teamId: "TEAM1" },
      fetchImpl as unknown as typeof fetch,
    );
    expect(token).toBe("maps-token");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    expect(url).toBe("https://maps-api.apple.com/v1/token");
    const [header, claims] = init.headers.Authorization.replace(
      "Bearer ",
      "",
    ).split(".");
    expect(decode(header)).toEqual({ alg: "ES256", kid: "KEY1", typ: "JWT" });
    expect(decode(claims)).toMatchObject({
      iss: "TEAM1",
      scope: "server_api",
    });
  });

  it("is null for a malformed key", async () => {
    const fetchImpl = vi.fn();
    expect(
      await appleMapsAccessToken(
        { privateKey: "not-a-key", keyId: "K", teamId: "T" },
        fetchImpl as unknown as typeof fetch,
      ),
    ).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("is null when Apple refuses", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 401 }));
    expect(
      await appleMapsAccessToken(
        { privateKey: await testKey(), keyId: "K", teamId: "T" },
        fetchImpl as unknown as typeof fetch,
      ),
    ).toBeNull();
  });
});

describe("firstPlace", () => {
  it("skips a distant namesake and accepts the nearby result", () => {
    const paris = { lat: 48.86, lng: 2.35 };
    const results = [
      { coordinate: { latitude: 43.7858, longitude: -85.5028 } },
      { coordinate: { latitude: 48.866, longitude: 2.338 } },
    ];
    expect(firstPlace({ results }, paris)).toEqual({ lat: 48.866, lng: 2.338 });
    expect(firstPlace({ results: results.slice(0, 1) }, paris)).toBeNull();
  });
  it("reads the first result with a usable coordinate", () => {
    expect(
      firstPlace({
        results: [
          { name: "No coordinate" },
          { coordinate: { latitude: 38.71, longitude: -9.13 } },
        ],
      }),
    ).toEqual({ lat: 38.71, lng: -9.13 });
  });

  it("returns the result's Apple place id", () => {
    expect(
      firstPlace({
        results: [
          {
            id: "I91A40F8387BB823E",
            coordinate: { latitude: 1, longitude: 2 },
          },
        ],
      }),
    ).toEqual({ lat: 1, lng: 2, appleId: "I91A40F8387BB823E" });
  });

  it("carries Apple's place id and point-of-interest category", () => {
    expect(
      firstPlace({
        results: [
          {
            id: "I1",
            poiCategory: "Bakery",
            coordinate: { latitude: 30.26, longitude: -97.74 },
          },
        ],
      }),
    ).toEqual({ lat: 30.26, lng: -97.74, appleId: "I1", category: "Bakery" });
  });

  it("is null for an empty or malformed reply", () => {
    expect(firstPlace({ results: [] })).toBeNull();
    expect(firstPlace({ results: "x" })).toBeNull();
    expect(
      firstPlace({
        results: [{ coordinate: { latitude: 200, longitude: 0 } }],
      }),
    ).toBeNull();
    expect(firstPlace(null)).toBeNull();
  });
});

describe("appleMapsLookup", () => {
  it("preserves a street address instead of substituting a similarly named business", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        results: [
          {
            name: "205 E Houston St",
            structuredAddress: {
              locality: "New York",
              thoroughfare: "E Houston St",
            },
            coordinate: { latitude: 40.7221936, longitude: -73.9875081 },
          },
        ],
      }),
    );
    expect(
      await appleMapsLookup(
        "tok",
        "search",
        "205 East Houston Street, New York, NY",
        { lat: 40.72, lng: -73.98 },
        fetchImpl as typeof fetch,
      ),
    ).toEqual({ lat: 40.7221936, lng: -73.9875081 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a city-centre address match as a place-name search", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          results: [
            {
              name: "Paris",
              structuredAddress: { locality: "Paris" },
              coordinate: { latitude: 48.8567879, longitude: 2.3510768 },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          results: [
            {
              name: "Micho",
              structuredAddress: {
                locality: "Paris",
                thoroughfare: "Rue de Richelieu",
              },
              coordinate: { latitude: 48.8660723, longitude: 2.3371738 },
            },
          ],
        }),
      );
    expect(
      await appleMapsLookup(
        "tok",
        "search",
        "Micho, Paris",
        { lat: 48.86, lng: 2.35 },
        fetchImpl,
      ),
    ).toEqual({ lat: 48.8660723, lng: 2.3371738 });
    expect(
      new URL(fetchImpl.mock.calls[1][0]).searchParams.get("resultTypeFilter"),
    ).toBe("Poi");
  });
  it("searches near a point with the access token", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        results: [{ coordinate: { latitude: 38.71, longitude: -9.13 } }],
      }),
    );
    const place = await appleMapsLookup(
      "tok",
      "search",
      "Pastéis de Belém, Lisbon",
      { lat: 38.7, lng: -9.1 },
      fetchImpl as unknown as typeof fetch,
    );
    expect(place).toEqual({ lat: 38.71, lng: -9.13 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/v1/search");
    expect(parsed.searchParams.get("resultTypeFilter")).toBe("Poi,Address");
    expect(parsed.searchParams.get("q")).toBe("Pastéis de Belém, Lisbon");
    expect(parsed.searchParams.get("searchLocation")).toBe("38.7,-9.1");
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("is null when the quota is spent or Apple is unreachable", async () => {
    const spent = vi.fn(async () => new Response("", { status: 429 }));
    const down = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(
      await appleMapsLookup(
        "tok",
        "geocode",
        "Lisbon",
        undefined,
        spent as unknown as typeof fetch,
      ),
    ).toBeNull();
    expect(
      await appleMapsLookup(
        "tok",
        "geocode",
        "Lisbon",
        undefined,
        down as unknown as typeof fetch,
      ),
    ).toBeNull();
  });
});

describe("distanceKm", () => {
  it("measures Lisbon to Porto at about 274 km", () => {
    const km = distanceKm(
      { lat: 38.7223, lng: -9.1393 },
      { lat: 41.1579, lng: -8.6291 },
    );
    expect(km).toBeGreaterThan(270);
    expect(km).toBeLessThan(280);
  });
});
