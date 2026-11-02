// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import type { FunctionReference } from "convex/server";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { newConvexTest, setTestConsent, signedInUser } from "./test.setup";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
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
  return { backend, t, userId, itemId, visits };
}

describe("setVisited", () => {
  it("keeps the api reference installed apps compiled against", () => {
    expectTypeOf(api.placeVisits.setVisited).toEqualTypeOf<
      FunctionReference<
        "mutation",
        "public",
        { itemId: Id<"items">; name: string; visited: boolean },
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
    ).rejects.toThrow();
    expect(await visits()).toHaveLength(0);
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
});

async function settle(
  t: Awaited<ReturnType<typeof setup>>["t"],
  run: () => Promise<unknown>,
) {
  vi.useFakeTimers();
  try {
    await run();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  } finally {
    vi.useRealTimers();
  }
}

describe("the passport", () => {
  it("keeps the pin, city and country of a place marked I went", async () => {
    const lookups = await withMaps();
    const { backend, t, itemId, visits } = await setup();
    await settle(backend, () =>
      t.mutation(api.placeVisits.setVisited, {
        itemId,
        name: "Tigre",
        visited: true,
      }),
    );
    expect(await visits()).toMatchObject([
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
    expect(await visits()).toMatchObject([{ countryCode: "PT" }]);
  });

  it("tries a failed country lookup again, and gives up after three", async () => {
    const lookups = await withMaps(1);
    const { backend, t, itemId, visits } = await setup();
    await settle(backend, () =>
      t.mutation(api.placeVisits.setVisited, {
        itemId,
        name: "Tigre",
        visited: true,
      }),
    );
    expect(lookups()).toBe(2);
    expect(await visits()).toMatchObject([{ countryCode: "PT" }]);

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
    const { backend, t, userId, itemId, visits } = await setup();
    await backend.run((ctx) => setTestConsent(ctx, userId, "declined"));
    await settle(backend, () =>
      t.mutation(api.placeVisits.setVisited, {
        itemId,
        name: "Tigre",
        visited: true,
      }),
    );
    expect(lookups()).toBe(0);
    expect(await visits()).toMatchObject([{ city: "Lisbon" }]);
    expect((await visits())[0]?.countryCode).toBeUndefined();
  });

  it("drops a country found for a point the visit no longer has", async () => {
    const { t, itemId, visits } = await setup();
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
    expect((await visits())[0]?.countryCode).toBeUndefined();
  });

  it("marks places from before Shelvr without a date, in one go, past the single-mark limit", async () => {
    const { t, itemId, visits } = await setup();
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

  it("refuses a batch over another user's save, and marks nothing", async () => {
    const { backend, itemId } = await setup();
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
    const { backend, t, userId, itemId, visits } = await setup();
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
    expect(await visits()).toMatchObject([
      { itemId: bare, lat: PIN.lat, city: "Lisbon", countryCode: "PT" },
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
    const { backend, t, itemId, visits } = await setup();
    await settle(backend, () =>
      t.mutation(api.placeVisits.setVisited, {
        itemId,
        name: "Tigre",
        visited: true,
      }),
    );
    expect(await visits()).toMatchObject([{ countryCode: "PT" }]);
  });

  it("lists stamps newest first with covers, and pins old plan marks from their save", async () => {
    const { t, userId, itemId } = await setup();
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
});
