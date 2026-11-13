import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  dotMap,
  loadPassport,
  recordPassportOpen,
  passportSummary,
  passportTitle,
  type SharedPassport,
} from "./passportShare";

const mocks = vi.hoisted(() => ({ serverLog: vi.fn() }));
vi.mock("@/lib/serverLog", () => ({ serverLog: mocks.serverLog }));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.stubEnv("CONVEX_SITE_URL", "https://deployment.convex.site");
  mocks.serverLog.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const passport: SharedPassport = {
  ownerName: "Maya",
  places: 3,
  cities: 2,
  countries: 1,
  byCity: [
    {
      city: "Lisbon",
      dot: { lat: 38.7, lng: -9.1 },
      names: ["Tigre", "Bar Alto"],
    },
    { city: "Porto", dot: { lat: 41.1, lng: -8.6 }, names: ["Majestic"] },
  ],
};

describe("loadPassport", () => {
  it("fetches the page uncached", async () => {
    vi.mocked(fetch).mockImplementation(
      async () => new Response(JSON.stringify(passport), { status: 200 }),
    );
    expect(await loadPassport("a/b")).toEqual({ outcome: "found", passport });
    expect(fetch).toHaveBeenLastCalledWith(
      "https://deployment.convex.site/passport/shares/a%2Fb",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("tells a stopped link from an outage", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await loadPassport("gone")).toEqual({ outcome: "missing" });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }));
    expect(await loadPassport("down")).toEqual({ outcome: "unavailable" });
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("offline"));
    expect(await loadPassport("down")).toEqual({ outcome: "unavailable" });
    expect(mocks.serverLog).toHaveBeenCalledTimes(2);
  });

  it("is unavailable without a Convex deployment", async () => {
    vi.stubEnv("CONVEX_SITE_URL", "");
    vi.stubEnv("CONVEX_URL", "");
    expect(await loadPassport("abc")).toEqual({ outcome: "unavailable" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("recordPassportOpen", () => {
  it("posts the open, and logs only a real failure", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
    await recordPassportOpen("a/b");
    expect(fetch).toHaveBeenLastCalledWith(
      "https://deployment.convex.site/passport/shares/a%2Fb",
      { method: "POST" },
    );
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }));
    await recordPassportOpen("gone");
    expect(mocks.serverLog).not.toHaveBeenCalled();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }));
    await recordPassportOpen("down");
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("offline"));
    await recordPassportOpen("down");
    expect(mocks.serverLog).toHaveBeenCalledTimes(2);
  });
});

describe("passport text", () => {
  it("names the owner and counts places, cities and countries", () => {
    expect(passportTitle(passport)).toBe("Maya’s passport");
    expect(passportTitle({ ...passport, ownerName: undefined })).toBe(
      "A Shelvr passport",
    );
    expect(passportSummary(passport)).toBe("3 places · 2 cities · 1 country");
    expect(passportSummary({ ...passport, places: 1, countries: null })).toBe(
      "1 place · 2 cities",
    );
  });
});

describe("dotMap", () => {
  const box = { width: 560, height: 300, pad: 48, spread: 7 };

  it("draws one dot per place, gathered around its city inside the box", () => {
    const cities = dotMap(passport.byCity, box);
    expect(cities.map((city) => [city.city, city.dots.length])).toEqual([
      ["Lisbon", 2],
      ["Porto", 1],
    ]);
    for (const city of cities) {
      expect(city.x).toBeGreaterThan(box.pad - 0.01);
      expect(city.x).toBeLessThan(box.width - box.pad + 0.01);
      expect(city.y).toBeGreaterThan(box.pad - 0.01);
      expect(city.y).toBeLessThan(box.height - box.pad + 0.01);
    }
    expect(cities[1].y).toBeLessThan(cities[0].y);
  });

  it("keeps a big southern cluster and its label inside the box", () => {
    for (const count of [50, 500]) {
      const byCity = [
        { city: "Porto", dot: { lat: 41.1, lng: -8.6 }, names: ["North"] },
        {
          city: "Lisbon",
          dot: { lat: 38.7, lng: -9.1 },
          names: Array.from({ length: count }, (_, index) => `Spot ${index}`),
        },
      ];
      for (const city of dotMap(byCity, box)) {
        expect(city.labelY).toBeLessThanOrEqual(box.height - 16);
        for (const dot of city.dots) {
          expect(dot.x).toBeGreaterThanOrEqual(0);
          expect(dot.x).toBeLessThanOrEqual(box.width);
          expect(dot.y).toBeGreaterThanOrEqual(0);
          expect(dot.y).toBeLessThanOrEqual(box.height);
        }
      }
    }
  });

  it("names both cities on a dot they share, without moving either", () => {
    const dot = { lat: 38.7, lng: -9.2 };
    const cities = dotMap(
      [
        { city: "Lisbon", dot, names: ["A", "C"] },
        { city: "Oeiras", dot, names: ["B"] },
        { city: "Setúbal", dot: { lat: 38.5, lng: -8.9 }, names: ["D"] },
      ],
      box,
    );
    expect(cities.map((city) => city.city)).toEqual([
      "Lisbon · Oeiras",
      "Setúbal",
    ]);
    expect(cities[0].dots).toHaveLength(3);
  });

  it("keeps a long joined label inside the map at either edge", () => {
    const dot = { lat: 34.1, lng: -118.4 };
    const cities = dotMap(
      [
        { city: "West Hollywood", dot, names: ["A"] },
        { city: "Beverly Hills", dot, names: ["B"] },
        { city: "Pasadena", dot: { lat: 34.1, lng: -118.1 }, names: ["C"] },
        ...[
          "Santa Monica",
          "Culver City",
          "Inglewood",
          "Marina del Rey",
          "Playa Vista",
          "El Segundo",
        ].map((city) => ({
          city,
          dot: { lat: 34.0, lng: -118.4 },
          names: [city],
        })),
      ],
      box,
    );
    for (const city of cities) {
      const half = (city.city.length * 7.5) / 2;
      expect(city.labelX - half).toBeGreaterThanOrEqual(0);
      expect(city.labelX + half).toBeLessThanOrEqual(box.width);
    }
    expect(cities[0].labelX).toBeGreaterThan(cities[0].x);
    expect(cities[2].city.endsWith("…")).toBe(true);
  });

  it("centres a single city and skips places with no dot", () => {
    const [only, ...rest] = dotMap(
      [passport.byCity[1], { names: ["Nowhere"] }],
      box,
    );
    expect(rest).toEqual([]);
    expect(only).toMatchObject({ x: box.width / 2, y: box.height / 2 });
    expect(dotMap([{ names: ["Nowhere"] }], box)).toEqual([]);
  });
});
