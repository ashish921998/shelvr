import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cityList,
  countLabel,
  fetchPublicMap,
  mapCounts,
  mapDescription,
  mapMetadata,
  mapTitle,
  parsePublicMap,
  placeLink,
  type PublicMap,
} from "./publicMap";

const mocks = vi.hoisted(() => ({ serverLog: vi.fn() }));
vi.mock("@/lib/serverLog", () => ({ serverLog: mocks.serverLog }));

const TOKEN = "0123456789abcdef0123456789abcdef";

const map: PublicMap = {
  ownerName: "Ashish",
  cities: [
    {
      city: "Mexico City",
      places: [
        {
          name: "Contramar",
          lat: 19.419,
          lng: -99.166,
          emoji: "🍽️",
          went: true,
          post: {
            site: "instagram",
            url: "https://www.instagram.com/reel/DFixtureMx1/",
          },
        },
        { name: "Café Avellaneda", lat: 19.348, lng: -99.162, went: false },
        {
          name: "Panadería Rosetta",
          lat: 19.42,
          lng: -99.161,
          emoji: "🥐",
          went: false,
          post: { site: "youtube", url: "https://youtu.be/fixtureMx01" },
        },
        {
          name: "Taquería Orinoco",
          lat: 19.418,
          lng: -99.164,
          emoji: "🌮",
          went: false,
          post: {
            site: "tiktok",
            url: "https://www.tiktok.com/@shelvr.fixtures/video/7300000000000000001",
          },
        },
      ],
    },
    {
      city: "Austin",
      places: [
        { name: "Jo's Coffee", lat: 30.25, lng: -97.749, went: false },
        { name: "Houndstooth Coffee", lat: 30.27, lng: -97.742, went: false },
      ],
    },
  ],
  saveAll: false,
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.stubEnv("CONVEX_SITE_URL", "https://deployment.convex.site");
  vi.stubEnv("WAITLIST_SHARED_SECRET", "shared-secret");
  mocks.serverLog.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function respond(body: unknown, status = 200) {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status }),
  );
}

describe("fetchPublicMap", () => {
  it("does not call the backend without its address or the shared secret", async () => {
    vi.stubEnv("WAITLIST_SHARED_SECRET", "");
    expect(await fetchPublicMap(TOKEN, "198.51.100.7")).toEqual({
      outcome: "unavailable",
    });
    vi.stubEnv("WAITLIST_SHARED_SECRET", "shared-secret");
    vi.stubEnv("CONVEX_SITE_URL", "");
    vi.stubEnv("CONVEX_URL", "");
    expect(await fetchPublicMap(TOKEN, undefined)).toEqual({
      outcome: "unavailable",
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.serverLog.mock.calls).toEqual([
      [
        "error",
        "public_map_unconfigured",
        { has_site_url: true, has_shared_secret: false },
      ],
      [
        "error",
        "public_map_unconfigured",
        { has_site_url: false, has_shared_secret: true },
      ],
    ]);
  });

  it("sends the secret and the visitor's address, uncached, with the token encoded", async () => {
    respond(map);
    expect(await fetchPublicMap("a/b", "198.51.100.7")).toEqual({
      outcome: "found",
      map,
    });
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://deployment.convex.site/map/pages/a%2Fb");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.headers).toEqual({
      "x-waitlist-secret": "shared-secret",
      "x-shelvr-client-ip": "198.51.100.7",
    });
    expect(mocks.serverLog).not.toHaveBeenCalled();
  });

  it("leaves the address header out when there is none", async () => {
    respond(map);
    await fetchPublicMap(TOKEN, undefined);
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({ "x-waitlist-secret": "shared-secret" });
  });

  it("tells a dead link from a limit and an outage, logging all but the dead link", async () => {
    respond({ message: "Not found." }, 404);
    expect(await fetchPublicMap(TOKEN, undefined)).toEqual({
      outcome: "missing",
    });
    expect(mocks.serverLog).not.toHaveBeenCalled();

    respond({ message: "Too many attempts." }, 429);
    expect(await fetchPublicMap(TOKEN, undefined)).toEqual({
      outcome: "unavailable",
    });
    expect(mocks.serverLog).toHaveBeenLastCalledWith(
      "warn",
      "public_map_limited",
      {},
    );

    respond({ message: "Could not load this map." }, 500);
    expect(await fetchPublicMap(TOKEN, undefined)).toEqual({
      outcome: "unavailable",
    });
    expect(mocks.serverLog).toHaveBeenLastCalledWith(
      "error",
      "public_map_failed",
      { status: 500 },
    );

    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("offline"));
    expect(await fetchPublicMap(TOKEN, undefined)).toEqual({
      outcome: "unavailable",
    });
    expect(mocks.serverLog).toHaveBeenLastCalledWith(
      "error",
      "public_map_failed",
      { error_name: "TypeError" },
    );
  });

  it("treats a body it cannot read as an outage", async () => {
    respond({ places: [] });
    expect(await fetchPublicMap(TOKEN, undefined)).toEqual({
      outcome: "unavailable",
    });
    expect(mocks.serverLog).toHaveBeenLastCalledWith(
      "error",
      "public_map_failed",
      { status: 200 },
    );
  });
});

describe("parsePublicMap", () => {
  it("keeps a well-formed map as it is", () => {
    expect(parsePublicMap(map)).toEqual(map);
  });

  it("refuses a body without a cities list", () => {
    expect(parsePublicMap(null)).toBeUndefined();
    expect(parsePublicMap("map")).toBeUndefined();
    expect(parsePublicMap({ cities: "Austin" })).toBeUndefined();
  });

  it("caps cities, places and text", () => {
    const place = { name: "x".repeat(300), lat: 1, lng: 2, went: false };
    const parsed = parsePublicMap({
      ownerName: ` ${"A".repeat(60)} `,
      cities: Array.from({ length: 15 }, (_, index) => ({
        city: `${"C".repeat(100)}${index}`,
        places: Array.from({ length: 120 }, () => ({
          ...place,
          emoji: "🍽️".repeat(10),
        })),
      })),
    })!;
    expect(parsed.ownerName).toBe("A".repeat(40));
    expect(parsed.cities).toHaveLength(12);
    expect(parsed.cities[0].city).toBe("C".repeat(80));
    expect(parsed.cities[0].places).toHaveLength(100);
    expect(parsed.cities[0].places[0].name).toBe("x".repeat(120));
    expect(Array.from(parsed.cities[0].places[0].emoji!)).toHaveLength(16);
  });

  it("skips malformed places and the cities they leave empty", () => {
    const parsed = parsePublicMap({
      cities: [
        {
          city: "Austin",
          places: [
            { name: "Jo's Coffee", lat: 30.25, lng: -97.749, went: false },
            { name: " ", lat: 1, lng: 1, went: false },
            { name: "North", lat: 91, lng: 1, went: false },
            { name: "East", lat: 1, lng: -181, went: false },
            { name: "Nowhere", lat: Number.NaN, lng: 1, went: false },
            { name: "Text", lat: "30", lng: 1, went: false },
            { name: "Maybe", lat: 1, lng: 1, went: "yes" },
            "Houndstooth Coffee",
          ],
        },
        { city: "Lisbon", places: [{ name: "Bad", lat: 99, lng: 0 }] },
        { city: " ", places: [{ name: "A", lat: 1, lng: 1, went: false }] },
      ],
    });
    expect(parsed).toEqual({
      cities: [
        {
          city: "Austin",
          places: [
            { name: "Jo's Coffee", lat: 30.25, lng: -97.749, went: false },
          ],
        },
      ],
      saveAll: false,
    });
  });

  it("turns Save all on only for a literal true", () => {
    const body = { cities: map.cities };
    expect(parsePublicMap({ ...body, saveAll: true })?.saveAll).toBe(true);
    for (const saveAll of ["true", 1, null, {}]) {
      expect(parsePublicMap({ ...body, saveAll })?.saveAll).toBe(false);
    }
    expect(parsePublicMap(body)?.saveAll).toBe(false);
  });

  it("drops a post link that is not the site's own post URL, keeping the place", () => {
    const place = (post: unknown) => ({
      name: "Contramar",
      lat: 19.419,
      lng: -99.166,
      went: false,
      post,
    });
    const parsed = parsePublicMap({
      cities: [
        {
          city: "Mexico City",
          places: [
            place({ site: "instagram", url: "https://evil.example/reel/x/" }),
            place({ site: "tiktok", url: "https://www.instagram.com/reel/x/" }),
            place({ site: "youtube", url: "javascript:alert(1)" }),
            place({
              site: "instagram",
              url: "https://www.instagram.com.evil.example/reel/x/",
            }),
            place({ site: "instagram", url: "https://www.instagram.com/a b/" }),
            place({ site: "x", url: "https://x.com/someone/status/1" }),
            place({
              site: "youtube",
              url: `https://youtu.be/${"a".repeat(400)}`,
            }),
            place("https://youtu.be/abc"),
            place({ site: "youtube", url: "https://youtu.be/fixtureMx01" }),
          ],
        },
      ],
    })!;
    expect(parsed.cities[0].places.map((entry) => entry.post)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { site: "youtube", url: "https://youtu.be/fixtureMx01" },
    ]);
  });
});

describe("page copy", () => {
  it("titles the map with the owner's first name when there is one", () => {
    expect(mapTitle(map)).toBe("Ashish’s map");
    expect(mapTitle({ cities: map.cities, saveAll: false })).toBe(
      "A Shelvr map",
    );
    expect(mapTitle(undefined)).toBe("A Shelvr map");
  });

  it("counts cities, places and Been there", () => {
    expect(mapCounts(map)).toEqual({ cities: 2, places: 6, been: 1 });
    expect(mapCounts(undefined)).toEqual({ cities: 0, places: 0, been: 0 });
  });

  it("says one or many", () => {
    expect(countLabel(1, "city", "cities")).toBe("1 city");
    expect(countLabel(2, "city", "cities")).toBe("2 cities");
    expect(countLabel(0, "place", "places")).toBe("0 places");
  });

  it("lists up to three cities by name", () => {
    expect(cityList(["Austin"])).toBe("Austin");
    expect(cityList(["Mexico City", "Austin"])).toBe("Mexico City and Austin");
    expect(cityList(["Mexico City", "Austin", "Lisbon"])).toBe(
      "Mexico City, Austin and Lisbon",
    );
    expect(
      cityList(["Mexico City", "Austin", "Lisbon", "Porto", "Paris"]),
    ).toBe("Mexico City, Austin, Lisbon and 2 more");
  });

  it("describes the map, naming Been there only when there is some", () => {
    expect(mapDescription(map)).toBe(
      "Mexico City and Austin: 6 places, 1 been there. Made with Shelvr.",
    );
    expect(mapDescription({ cities: [map.cities[1]], saveAll: false })).toBe(
      "Austin: 2 places. Made with Shelvr.",
    );
    expect(
      mapDescription({ ownerName: "Ashish", cities: [], saveAll: false }),
    ).toBe("A map made with Shelvr.");
    expect(mapDescription(undefined)).toBe("Places saved with Shelvr.");
  });

  it("asks people to save the places when Save all is on and there are some", () => {
    expect(mapDescription({ ...map, saveAll: true })).toBe(
      "Mexico City and Austin: 6 places, 1 been there. Save them all to Shelvr.",
    );
    expect(
      mapDescription({ ownerName: "Ashish", cities: [], saveAll: true }),
    ).toBe("A map made with Shelvr.");
  });
});

describe("placeLink", () => {
  const [contramar, avellaneda, rosetta, orinoco] = map.cities[0].places;

  it("links a place to the post it came from", () => {
    expect(placeLink(contramar, "Mexico City", false)).toEqual({
      label: "See on Instagram",
      href: "https://www.instagram.com/reel/DFixtureMx1/",
    });
    expect(placeLink(orinoco, "Mexico City", true)).toEqual({
      label: "Watch on TikTok",
      href: "https://www.tiktok.com/@shelvr.fixtures/video/7300000000000000001",
    });
    expect(placeLink(rosetta, "Mexico City", false)).toEqual({
      label: "Watch on YouTube",
      href: "https://youtu.be/fixtureMx01",
    });
  });

  it("opens any other place in Apple Maps, or Google Maps on Android", () => {
    expect(placeLink(avellaneda, "Mexico City", false)).toEqual({
      label: "Open in Maps",
      href: "https://maps.apple.com/?q=Caf%C3%A9%20Avellaneda&ll=19.348,-99.162",
    });
    expect(placeLink(avellaneda, "Mexico City", true)).toEqual({
      label: "Open in Maps",
      href: "https://www.google.com/maps/search/?api=1&query=Caf%C3%A9%20Avellaneda%2C%20Mexico%20City",
    });
  });
});

describe("mapMetadata", () => {
  it("keeps the page out of search and points its canonical and og:url at the page", () => {
    expect(mapMetadata(TOKEN, map)).toEqual({
      title: "Ashish’s map — Shelvr",
      description:
        "Mexico City and Austin: 6 places, 1 been there. Made with Shelvr.",
      alternates: { canonical: `/m/${TOKEN}` },
      robots: { index: false, follow: false },
      openGraph: {
        title: "Ashish’s map",
        description:
          "Mexico City and Austin: 6 places, 1 been there. Made with Shelvr.",
        url: `/m/${TOKEN}`,
        siteName: "Shelvr",
        type: "website",
      },
      twitter: {
        card: "summary",
        title: "Ashish’s map",
        description:
          "Mexico City and Austin: 6 places, 1 been there. Made with Shelvr.",
      },
    });
  });

  it("describes a missing map without naming anyone", () => {
    const metadata = mapMetadata(TOKEN, undefined);
    expect(metadata.title).toBe("A Shelvr map — Shelvr");
    expect(metadata.description).toBe("Places saved with Shelvr.");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
