// @vitest-environment edge-runtime
import { isRateLimitError } from "@convex-dev/rate-limiter";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { WAITLIST_CLIENT_IP_HEADER, WAITLIST_SECRET_HEADER } from "./http";
import { placeKey } from "./model/plan";
import { MAX_PUBLIC_MAP_CITIES } from "./model/publicMapLimits";
import { newConvexTest, signedInUser, type TestBackend } from "./test.setup";

const SECRET = "public-map-test-secret";
const UNKNOWN_TOKEN = "0".repeat(32);
const TOKEN = /^[0-9a-f]{32}$/;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const TITLES = [
  "Contramar tuna tostadas",
  "Best tacos in Roma Norte",
  "A morning in Roma",
  "Mexico City museums",
  "Austin coffee stops",
  "Still reading this one",
];

async function owner(
  backend: TestBackend = newConvexTest(),
  options: { pro?: boolean } = {},
) {
  const user = await signedInUser(backend, { pro: options.pro ?? true });
  return { backend, ...user };
}

async function seedSaves(backend: TestBackend, userId: Id<"users">) {
  return await backend.run(async (ctx) => {
    const insert = (fields: Partial<Doc<"items">>) =>
      ctx.db.insert("items", {
        userId,
        type: "link",
        status: "ready",
        tags: ["travel", "food"],
        searchText: "",
        cities: ["Mexico City"],
        ...fields,
      });
    const contramar = await insert({
      title: TITLES[0],
      url: "https://www.instagram.com/someone/reel/DFixtureMx1/?igsh=c2hlbHZyZml4dHVyZQ==",
      placePins: [
        {
          name: "Contramar",
          lat: 19.4192,
          lng: -99.1663,
          city: "Mexico City",
          appleId: "apple-contramar",
          category: "Restaurant",
        },
      ],
    });
    const tacos = await insert({
      title: TITLES[1],
      url: "https://www.tiktok.com/@shelvr.fixtures/video/7300000000000000001?is_from_webapp=1",
      placePins: [
        { name: "Taquería Orinoco", lat: 19.418, lng: -99.164 },
        { name: "Calle Durango 200", lat: 19.4205, lng: -99.168 },
      ],
    });
    const bakery = await insert({
      title: TITLES[2],
      url: "https://www.youtube.com/watch?v=fixtureMx01&si=shelvrfixture",
      placePins: [
        {
          name: "Panadería Rosetta",
          lat: 19.4196,
          lng: -99.1606,
          category: "Bakery",
        },
      ],
    });
    const note = await insert({
      type: "note",
      title: TITLES[3],
      note: "Frida museum: book tickets ahead.",
      tags: ["travel", "museums"],
      placePins: [{ name: "Museo Frida Kahlo", lat: 19.3551, lng: -99.1624 }],
    });
    const austin = await insert({
      title: TITLES[4],
      url: "https://example.com/places/austin-coffee",
      tags: ["coffee"],
      cities: ["Austin"],
      placePins: [{ name: "Jo's Coffee", lat: 30.2502, lng: -97.7496 }],
    });
    const processing = await insert({
      status: "processing",
      title: TITLES[5],
      url: "https://example.com/el-moro",
      placePins: [{ name: "El Moro", lat: 19.4337, lng: -99.1411 }],
    });
    return [contramar, tacos, bakery, note, austin, processing];
  });
}

async function markVisited(
  backend: TestBackend,
  userId: Id<"users">,
  itemId: Id<"items">,
  name: string,
) {
  await backend.run((ctx) =>
    ctx.db.insert("placeVisits", {
      userId,
      key: placeKey(name),
      name,
      itemId,
      visitedAt: Date.now(),
    }),
  );
}

async function pagesOf(backend: TestBackend, userId: Id<"users">) {
  return await backend.run((ctx) =>
    ctx.db
      .query("publicMaps")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
  );
}

function block(backend: TestBackend, token: string, blocked = true) {
  return backend.mutation(internal.publicMaps.setPublicMapBlocked, {
    token,
    blocked,
  });
}

function claim(backend: TestBackend, token: string, ip?: string) {
  return backend.mutation(internal.publicMaps.claimPublicMapView, {
    token,
    ip,
  });
}

function readPage(
  backend: TestBackend,
  token: string,
  options: { secret?: string; ip?: string } = {},
) {
  return backend.fetch(`/map/pages/${token}`, {
    headers: {
      [WAITLIST_SECRET_HEADER]: options.secret ?? SECRET,
      [WAITLIST_CLIENT_IP_HEADER]: options.ip ?? "203.0.113.7",
    },
  });
}

async function refusal(promise: Promise<unknown>): Promise<unknown> {
  return await promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

describe("getMyPublicMap", () => {
  it("is null until the page exists, then shows its link, cities and block", async () => {
    const { backend, t } = await owner();
    await expect(t.query(api.publicMaps.getMyPublicMap, {})).resolves.toBe(
      null,
    );
    const { token } = await t.mutation(api.publicMaps.setPublicMapCities, {
      cities: ["Mexico City"],
    });
    await expect(t.query(api.publicMaps.getMyPublicMap, {})).resolves.toEqual({
      token,
      cities: ["Mexico City"],
      blocked: false,
    });
    await block(backend, token);
    await expect(
      t.query(api.publicMaps.getMyPublicMap, {}),
    ).resolves.toMatchObject({ token, blocked: true });
  });
});

describe("setPublicMapCities", () => {
  it("needs Pro to create a page", async () => {
    const { backend, t, userId } = await owner(newConvexTest(), { pro: false });
    await expect(
      t.mutation(api.publicMaps.setPublicMapCities, { cities: ["Austin"] }),
    ).rejects.toMatchObject({ data: { code: "pro_required" } });
    expect(await pagesOf(backend, userId)).toEqual([]);
  });

  it("creates a page with a random link and changes its cities without a new one", async () => {
    const { backend, t, userId } = await owner();
    const created = await t.mutation(api.publicMaps.setPublicMapCities, {
      cities: [" Mexico   City ", "Austin"],
    });
    expect(created.token).toMatch(TOKEN);
    expect(created.cities).toEqual(["Mexico City", "Austin"]);

    const updated = await t.mutation(api.publicMaps.setPublicMapCities, {
      cities: [" austin ", "Austin", "Lisbon", "   "],
    });
    expect(updated).toEqual({
      token: created.token,
      cities: ["austin", "Lisbon"],
    });
    expect(await pagesOf(backend, userId)).toHaveLength(1);
  });

  it(`keeps at most ${MAX_PUBLIC_MAP_CITIES} cities and refuses none`, async () => {
    const { t } = await owner();
    const cities = Array.from({ length: 14 }, (_, i) => `City ${i}`);
    const page = await t.mutation(api.publicMaps.setPublicMapCities, {
      cities,
    });
    expect(page.cities).toEqual(cities.slice(0, MAX_PUBLIC_MAP_CITIES));
    await expect(
      t.mutation(api.publicMaps.setPublicMapCities, { cities: [" ", ""] }),
    ).rejects.toThrow("City required");
    await expect(
      t.mutation(api.publicMaps.setPublicMapCities, { cities: [] }),
    ).rejects.toThrow("City required");
  });

  it("lets a lapsed owner change, rotate and turn off the page, but not make a new one", async () => {
    const { backend, t, userId } = await owner();
    const { token } = await t.mutation(api.publicMaps.setPublicMapCities, {
      cities: ["Austin"],
    });
    await backend.run(async (ctx) => {
      const sub = await ctx.db
        .query("subscriptions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique();
      await ctx.db.delete(sub!._id);
    });

    await expect(
      t.mutation(api.publicMaps.setPublicMapCities, { cities: ["Lisbon"] }),
    ).resolves.toEqual({ token, cities: ["Lisbon"] });
    const rotated = await t.mutation(api.publicMaps.rotatePublicMapLink, {});
    expect(rotated).toMatch(TOKEN);
    expect(rotated).not.toBe(token);
    await t.mutation(api.publicMaps.turnOffPublicMap, {});
    expect(await pagesOf(backend, userId)).toEqual([]);
    await expect(
      t.mutation(api.publicMaps.setPublicMapCities, { cities: ["Lisbon"] }),
    ).rejects.toMatchObject({ data: { code: "pro_required" } });
  });

  it("refuses to change a blocked page", async () => {
    const { backend, t } = await owner();
    const { token } = await t.mutation(api.publicMaps.setPublicMapCities, {
      cities: ["Austin"],
    });
    await block(backend, token);
    await expect(
      t.mutation(api.publicMaps.setPublicMapCities, { cities: ["Lisbon"] }),
    ).rejects.toThrow("Map page blocked");
    await expect(
      t.query(api.publicMaps.getMyPublicMap, {}),
    ).resolves.toMatchObject({ cities: ["Austin"] });
  });
});

describe("rotatePublicMapLink", () => {
  it("swaps the link, and the old one stops working", async () => {
    vi.stubEnv("WAITLIST_SHARED_SECRET", SECRET);
    const { backend, t } = await owner();
    await expect(
      t.mutation(api.publicMaps.rotatePublicMapLink, {}),
    ).resolves.toBeNull();
    const { token } = await t.mutation(api.publicMaps.setPublicMapCities, {
      cities: ["Austin"],
    });
    const rotated = await t.mutation(api.publicMaps.rotatePublicMapLink, {});
    expect(rotated).toMatch(TOKEN);
    expect(rotated).not.toBe(token);
    expect((await readPage(backend, token)).status).toBe(404);
    expect((await readPage(backend, rotated!)).status).toBe(200);
  });

  it("leaves a blocked page's link as it is", async () => {
    const { backend, t } = await owner();
    const { token } = await t.mutation(api.publicMaps.setPublicMapCities, {
      cities: ["Austin"],
    });
    await block(backend, token);
    await expect(
      t.mutation(api.publicMaps.rotatePublicMapLink, {}),
    ).resolves.toBeNull();
    await expect(
      t.query(api.publicMaps.getMyPublicMap, {}),
    ).resolves.toMatchObject({ token });
  });
});

describe("turnOffPublicMap", () => {
  it("deletes the page, twice without harm, and a new page gets a new link", async () => {
    vi.stubEnv("WAITLIST_SHARED_SECRET", SECRET);
    const { backend, t, userId } = await owner();
    const { token } = await t.mutation(api.publicMaps.setPublicMapCities, {
      cities: ["Austin"],
    });
    await expect(
      t.mutation(api.publicMaps.turnOffPublicMap, {}),
    ).resolves.toBeNull();
    await expect(
      t.mutation(api.publicMaps.turnOffPublicMap, {}),
    ).resolves.toBeNull();
    expect(await pagesOf(backend, userId)).toEqual([]);
    expect((await readPage(backend, token)).status).toBe(404);

    const again = await t.mutation(api.publicMaps.setPublicMapCities, {
      cities: ["Austin"],
    });
    expect(again.token).toMatch(TOKEN);
    expect(again.token).not.toBe(token);
  });

  it("keeps a blocked page, so turning it off and on cannot undo the block", async () => {
    const { backend, t, userId } = await owner();
    const { token } = await t.mutation(api.publicMaps.setPublicMapCities, {
      cities: ["Austin"],
    });
    await block(backend, token);
    await t.mutation(api.publicMaps.turnOffPublicMap, {});
    expect(await pagesOf(backend, userId)).toHaveLength(1);
    await expect(
      t.mutation(api.publicMaps.setPublicMapCities, { cities: ["Austin"] }),
    ).rejects.toThrow("Map page blocked");
  });
});

describe("listPublicMapCities", () => {
  it("names the places each city's page would show", async () => {
    const { backend, t, userId } = await owner();
    const [contramar] = await seedSaves(backend, userId);
    await markVisited(backend, userId, contramar, "Contramar");

    await expect(
      t.query(api.publicMaps.listPublicMapCities, {}),
    ).resolves.toEqual([
      {
        city: "Mexico City",
        places: [
          { name: "Contramar", went: true },
          { name: "Panadería Rosetta", went: false },
          { name: "Taquería Orinoco", went: false },
        ],
      },
      { city: "Austin", places: [{ name: "Jo's Coffee", went: false }] },
    ]);
  });
});

describe("getPublicMap", () => {
  async function livePage() {
    const { backend, t, userId } = await owner();
    const ids = await seedSaves(backend, userId);
    await markVisited(backend, userId, ids[0], "Contramar");
    await backend.run(async (ctx) => {
      await ctx.db.patch(userId, { name: "Priya Sharma" });
      await ctx.db.insert("placeRemovals", {
        userId,
        name: "Taquería Orinoco",
        city: "mexico city",
        lat: 19.418,
        lng: -99.164,
      });
    });
    const { token } = await t.mutation(api.publicMaps.setPublicMapCities, {
      cities: ["Mexico City", "Austin", "Lisbon"],
    });
    return { backend, userId, ids, token };
  }

  it("shows the owner's first name and only the public fields of each place", async () => {
    const { backend, ids, token } = await livePage();
    const map = await backend.query(internal.publicMaps.getPublicMap, {
      token,
    });
    expect(map).toEqual({
      ownerName: "Priya",
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
            {
              name: "Panadería Rosetta",
              lat: 19.42,
              lng: -99.161,
              emoji: "🥐",
              went: false,
              post: { site: "youtube", url: "https://youtu.be/fixtureMx01" },
            },
          ],
        },
        {
          city: "Austin",
          places: [
            {
              name: "Jo's Coffee",
              lat: 30.25,
              lng: -97.75,
              emoji: "☕",
              went: false,
            },
          ],
        },
      ],
    });

    const json = JSON.stringify(map);
    for (const hidden of [
      ...TITLES,
      ...ids,
      "Frida museum",
      "Museo Frida Kahlo",
      "Calle Durango",
      "Taquería Orinoco",
      "El Moro",
      "igsh",
      "si=",
      "shelvrfixture",
      "is_from_webapp",
      "someone",
      "example.com",
      "apple-contramar",
      "travel",
      "museums",
    ]) {
      expect(json).not.toContain(hidden);
    }
  });

  it("leaves the name out when the owner has none", async () => {
    const { backend, t } = await owner();
    const { token } = await t.mutation(api.publicMaps.setPublicMapCities, {
      cities: ["Austin"],
    });
    await expect(
      backend.query(internal.publicMaps.getPublicMap, { token }),
    ).resolves.toEqual({ cities: [] });
  });

  it("serves nothing for an unknown, malformed or blocked link, or a deleting owner", async () => {
    const { backend, userId, token } = await livePage();
    for (const unknown of [UNKNOWN_TOKEN, "not-a-token", token.toUpperCase()]) {
      await expect(
        backend.query(internal.publicMaps.getPublicMap, { token: unknown }),
      ).resolves.toBeNull();
    }
    await block(backend, token);
    await expect(
      backend.query(internal.publicMaps.getPublicMap, { token }),
    ).resolves.toBeNull();
    await block(backend, token, false);
    await expect(
      backend.query(internal.publicMaps.getPublicMap, { token }),
    ).resolves.not.toBeNull();
    await backend.run((ctx) => ctx.db.patch(userId, { deleting: true }));
    await expect(
      backend.query(internal.publicMaps.getPublicMap, { token }),
    ).resolves.toBeNull();
  });
});

describe("claimPublicMapView", () => {
  it("answers whether a link can be served", async () => {
    const { backend, t } = await owner();
    const { token } = await t.mutation(api.publicMaps.setPublicMapCities, {
      cities: ["Austin"],
    });
    await expect(claim(backend, token, "203.0.113.7")).resolves.toBe(true);
    await expect(claim(backend, UNKNOWN_TOKEN)).resolves.toBe(false);
    await expect(claim(backend, "nope", "203.0.113.7")).resolves.toBe(false);
    await block(backend, token);
    await expect(claim(backend, token, "203.0.113.7")).resolves.toBe(false);
  });

  it(
    "caps one page's reads however many networks ask, without touching other pages",
    { timeout: 120_000 },
    async () => {
      vi.useFakeTimers();
      const { backend, t } = await owner();
      const { token } = await t.mutation(api.publicMaps.setPublicMapCities, {
        cities: ["Austin"],
      });
      const other = await owner(backend);
      const { token: otherToken } = await other.t.mutation(
        api.publicMaps.setPublicMapCities,
        { cities: ["Austin"] },
      );

      let refusedAt: number | undefined;
      for (let i = 1; i <= 601 && refusedAt === undefined; i++) {
        const ip = `10.0.${Math.floor(i / 256)}.${i % 256}`;
        const error = await refusal(claim(backend, token, ip));
        if (error !== undefined) {
          expect(isRateLimitError(error)).toBe(true);
          refusedAt = i;
        }
      }
      expect(refusedAt).toBeGreaterThan(500);
      expect(refusedAt).toBeLessThanOrEqual(601);
      await expect(claim(backend, otherToken, "192.0.2.200")).resolves.toBe(
        true,
      );
    },
  );

  it(
    "caps one visitor network, probing included, without touching another",
    { timeout: 60_000 },
    async () => {
      vi.useFakeTimers();
      const backend = newConvexTest();
      for (let i = 0; i < 120; i++) {
        await expect(
          claim(backend, UNKNOWN_TOKEN, "2001:db8:1::1"),
        ).resolves.toBe(false);
      }
      const error = await refusal(
        claim(backend, UNKNOWN_TOKEN, "2001:db8:1::2"),
      );
      expect(isRateLimitError(error)).toBe(true);
      await expect(
        claim(backend, UNKNOWN_TOKEN, "2001:db8:2::1"),
      ).resolves.toBe(false);
    },
  );
});

describe("setPublicMapBlocked", () => {
  it("blocks and unblocks a page by its link", async () => {
    const { backend, t } = await owner();
    await expect(block(backend, UNKNOWN_TOKEN)).resolves.toBe(false);
    const { token } = await t.mutation(api.publicMaps.setPublicMapCities, {
      cities: ["Austin"],
    });
    await expect(block(backend, token)).resolves.toBe(true);
    await expect(
      t.query(api.publicMaps.getMyPublicMap, {}),
    ).resolves.toMatchObject({ blocked: true });
    await expect(block(backend, token, false)).resolves.toBe(true);
    await expect(
      t.query(api.publicMaps.getMyPublicMap, {}),
    ).resolves.toMatchObject({ blocked: false });
  });
});

describe("account deletion", () => {
  it("stops the page at once and deletes it, blocked or not", async () => {
    const { backend, t, userId } = await owner();
    const { token } = await t.mutation(api.publicMaps.setPublicMapCities, {
      cities: ["Austin"],
    });
    await block(backend, token);
    await backend.run((ctx) =>
      ctx.db.insert("publicMaps", {
        userId,
        token: "f".repeat(32),
        cities: ["Lisbon"],
      }),
    );
    await t.mutation(api.users.deleteCurrentUserAccount, {});
    for (let pass = 0; pass < 10; pass++) {
      if ((await backend.run((ctx) => ctx.db.get(userId))) === null) break;
      await backend.mutation(internal.users.processAccountDeletion, {
        userId,
      });
    }
    expect(await pagesOf(backend, userId)).toEqual([]);
    await expect(
      backend.query(internal.publicMaps.getPublicMap, {
        token: "f".repeat(32),
      }),
    ).resolves.toBeNull();
  });
});

describe("GET /map/pages/<token>", () => {
  it("needs the configured secret", async () => {
    vi.stubEnv("WAITLIST_SHARED_SECRET", "");
    const backend = newConvexTest();
    const missing = await readPage(backend, UNKNOWN_TOKEN);
    expect(missing.status).toBe(500);
    expect(await missing.json()).toEqual({
      message: "Map page secret not configured.",
    });

    vi.stubEnv("WAITLIST_SHARED_SECRET", SECRET);
    const wrong = await readPage(backend, UNKNOWN_TOKEN, { secret: "wrong" });
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ message: "Unauthorized." });
  });

  it("serves a live page and 404s an unknown or blocked one", async () => {
    vi.stubEnv("WAITLIST_SHARED_SECRET", SECRET);
    const { backend, t, userId } = await owner();
    await seedSaves(backend, userId);
    const { token } = await t.mutation(api.publicMaps.setPublicMapCities, {
      cities: ["Austin"],
    });

    const found = await readPage(backend, token);
    expect(found.status).toBe(200);
    expect(await found.json()).toEqual({
      cities: [
        {
          city: "Austin",
          places: [
            {
              name: "Jo's Coffee",
              lat: 30.25,
              lng: -97.75,
              emoji: "☕",
              went: false,
            },
          ],
        },
      ],
    });

    const unknown = await readPage(backend, UNKNOWN_TOKEN);
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ message: "Not found." });
    await block(backend, token);
    expect((await readPage(backend, token)).status).toBe(404);
  });

  it("404s a deleting owner's page", async () => {
    vi.stubEnv("WAITLIST_SHARED_SECRET", SECRET);
    const { backend, t, userId } = await owner();
    const { token } = await t.mutation(api.publicMaps.setPublicMapCities, {
      cities: ["Austin"],
    });
    await backend.run((ctx) => ctx.db.patch(userId, { deleting: true }));
    expect((await readPage(backend, token)).status).toBe(404);
  });

  it(
    "answers 429 once a visitor network is spent, and not to another network",
    { timeout: 60_000 },
    async () => {
      vi.useFakeTimers();
      vi.stubEnv("WAITLIST_SHARED_SECRET", SECRET);
      const backend = newConvexTest();
      for (let i = 0; i < 120; i++) {
        const response = await readPage(backend, UNKNOWN_TOKEN, {
          ip: "2001:db8:1::1",
        });
        expect(response.status).toBe(404);
      }
      const limited = await readPage(backend, UNKNOWN_TOKEN, {
        ip: "2001:db8:1::1",
      });
      expect(limited.status).toBe(429);
      expect(await limited.json()).toEqual({ message: "Too many attempts." });
      expect(
        (await readPage(backend, UNKNOWN_TOKEN, { ip: "2001:db8:2::1" }))
          .status,
      ).toBe(404);
    },
  );
});
