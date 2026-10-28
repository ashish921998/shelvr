// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { DatePlanResult } from "./model/datePlan";
import {
  insertConsentingUser,
  newConvexTest,
  setTestConsent,
  type TestBackend,
} from "./test.setup";

type Save = {
  title: string;
  places: string[];
  pins?: { name: string; lat: number; lng: number; category?: string }[];
  tags?: string[];
};

// Lisbon's Chiado; each 0.001 of latitude is about 111 m.
const CHIADO = { lat: 38.711, lng: -9.142 };
const near = (steps: number) => ({
  lat: CHIADO.lat + steps * 0.001,
  lng: CHIADO.lng,
});

const DINNER: Save = {
  title: "Best ramen in town",
  places: ["Ramen Shop"],
  pins: [{ name: "Ramen Shop", ...CHIADO, category: "Restaurant" }],
  tags: ["ramen", "date night"],
};
const BAR: Save = {
  title: "Hidden speakeasy",
  places: ["Red Frog"],
  pins: [{ name: "Red Frog", ...near(4), category: "Nightlife" }],
  tags: ["speakeasy"],
};
const CAFE: Save = {
  title: "Morning coffee",
  places: ["Fábrica"],
  pins: [{ name: "Fábrica", ...near(30), category: "Cafe" }],
  tags: ["coffee"],
};
const UNPINNED: Save = {
  title: "Tiles museum",
  places: ["Museu do Azulejo"],
  tags: ["museum"],
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
}

/** Apple stand-in: each search answers a place of its category near where it was asked, a chain and a far one. */
function fakeApple() {
  let n = 0;
  return vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.pathname === "/v1/token") {
      return Response.json({ accessToken: "maps", expiresInSeconds: 1800 });
    }
    const category = (url.searchParams.get("includePoiCategories") ?? "").split(
      ",",
    )[0];
    const [lat, lng] = (url.searchParams.get("searchLocation") ?? "0,0")
      .split(",")
      .map(Number);
    n++;
    const place = (name: string, dLat: number, id: string) => ({
      name,
      id,
      poiCategory: category,
      structuredAddress: { locality: "Lisbon", subLocality: "Chiado" },
      coordinate: { latitude: lat + dLat, longitude: lng },
    });
    return Response.json({
      results: [
        place(`Near ${category} ${n}`, 0.002, `near-${n}`),
        place("Starbucks", 0.001, `sb-${n}`),
        place(`Far ${category} ${n}`, 0.05, `far-${n}`),
      ],
    });
  });
}

async function setup(
  saves: Save[],
  options: { pro?: boolean } = {},
): Promise<{
  base: TestBackend;
  t: ReturnType<TestBackend["withIdentity"]>;
  userId: Id<"users">;
  itemIds: Id<"items">[];
}> {
  const base = newConvexTest();
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
          cities: ["Lisbon"],
          places: save.places,
          placePins: save.pins?.map((pin) => ({ ...pin, city: "Lisbon" })),
          url: "https://www.tiktok.com/@someone/video/1",
          tags: save.tags ?? [],
          searchText: save.title,
        }),
      );
    }
    return { userId, itemIds };
  });
  const t = base.withIdentity({ subject: `${seeded.userId}|session-1` });
  return { base, t, ...seeded };
}

function evenings(result: DatePlanResult): string[][] {
  return result.evenings.map((evening) => [
    result.stops[evening.first].name,
    result.stops[evening.second].name,
  ]);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("makeDatePlan", () => {
  it("refuses an account without Pro and a signed-out caller", async () => {
    const { base, t } = await setup([DINNER, BAR], { pro: false });
    await expect(
      t.action(api.datePlans.makeDatePlan, { city: "Lisbon", kind: "classic" }),
    ).rejects.toMatchObject({ data: { code: "pro_required" } });
    await expect(
      base.action(api.datePlans.makeDatePlan, {
        city: "Lisbon",
        kind: "classic",
      }),
    ).rejects.toThrow("Not authenticated");
  });

  it("spends the plan rate limit before it reads anything", async () => {
    const { t } = await setup([]);
    const claim = () =>
      t.mutation(internal.datePlanData.claimDatePlanInternal, {
        city: "Lisbon",
      });
    for (let i = 0; i < 8; i++) await claim();
    await expect(claim()).rejects.toThrow();
  });

  it("plans dinner then drinks from two saves a walk apart, ranked ahead of Apple's fill", async () => {
    await stubMaps();
    const fetchMock = fakeApple();
    vi.stubGlobal("fetch", fetchMock);
    const { t, itemIds } = await setup([DINNER, BAR, UNPINNED]);
    const result = await t.action(api.datePlans.makeDatePlan, {
      city: " lisbon ",
      kind: "classic",
    });
    expect(result).toMatchObject({ status: "ready", kind: "classic" });
    expect(evenings(result)[0]).toEqual(["Ramen Shop", "Red Frog"]);
    const first = result.stops[result.evenings[0].first];
    expect(first).toMatchObject({
      slot: "first",
      source: "save",
      itemId: itemIds[0],
      category: "Restaurant",
    });
    // Saves alone made too few evenings, so Apple was asked for more around them.
    expect(fetchMock).toHaveBeenCalled();
  });

  it("fills a missing stop near a saved one from Apple Maps, without chains or far places", async () => {
    await stubMaps();
    vi.stubGlobal("fetch", fakeApple());
    const { t } = await setup([DINNER]);
    const result = await t.action(api.datePlans.makeDatePlan, {
      city: "Lisbon",
      kind: "classic",
    });
    expect(result.status).toBe("ready");
    const names = result.stops.map((stop) => stop.name);
    expect(names).toContain("Ramen Shop");
    expect(names.some((name) => name.startsWith("Near Nightlife"))).toBe(true);
    expect(names).not.toContain("Starbucks");
    expect(names.some((name) => name.startsWith("Far"))).toBe(false);
    for (const evening of result.evenings) {
      expect(result.stops[evening.first].source).toBe("save");
    }
  });

  it("makes no Apple call for an account that declined AI", async () => {
    await stubMaps();
    const fetchMock = fakeApple();
    vi.stubGlobal("fetch", fetchMock);
    const { base, t, userId } = await setup([DINNER]);
    await base.run((ctx) => setTestConsent(ctx, userId, "declined"));
    const result = await t.action(api.datePlans.makeDatePlan, {
      city: "Lisbon",
      kind: "classic",
    });
    expect(result).toMatchObject({ status: "no_pair", evenings: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still plans from the saves when Apple fails", async () => {
    await stubMaps();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    const { t } = await setup([DINNER, BAR]);
    const result = await t.action(api.datePlans.makeDatePlan, {
      city: "Lisbon",
      kind: "classic",
    });
    expect(evenings(result)).toEqual([["Ramen Shop", "Red Frog"]]);
  });

  it("stops waiting on Apple at the deadline and aborts its searches", async () => {
    await stubMaps();
    const aborted: boolean[] = [];
    let started = 0;
    let searching: () => void = () => undefined;
    const searchStarted = new Promise<void>((resolve) => {
      searching = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: RequestInit) => {
        if (new URL(input).pathname === "/v1/token") {
          return Response.json({ accessToken: "maps" });
        }
        started++;
        searching();
        // A search that never answers until something aborts it.
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            aborted.push(true);
            reject(new DOMException("aborted", "AbortError"));
          });
        });
      }),
    );
    const { t } = await setup([DINNER, BAR]);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const planned = t.action(api.datePlans.makeDatePlan, {
        city: "Lisbon",
        kind: "classic",
      });
      await searchStarted;
      await vi.advanceTimersByTimeAsync(10_000);
      const result = await planned;
      expect(evenings(result)).toEqual([["Ramen Shop", "Red Frog"]]);
      expect(started).toBeGreaterThan(0);
      expect(aborted).toHaveLength(started);
    } finally {
      vi.useRealTimers();
    }
  });

  it("says when no saved place fits the kind of date", async () => {
    const { t } = await setup([DINNER, BAR, UNPINNED]);
    const result = await t.action(api.datePlans.makeDatePlan, {
      city: "Lisbon",
      kind: "lowkey",
    });
    expect(result).toMatchObject({
      status: "no_anchor",
      kind: "lowkey",
      stops: [],
      evenings: [],
    });
  });

  it("leaves out places marked visited", async () => {
    const { base, t, userId, itemIds } = await setup([DINNER, BAR]);
    await base.run(async (ctx) => {
      await ctx.db.insert("placeVisits", {
        userId,
        key: "redfrog",
        name: "Red Frog",
        itemId: itemIds[1],
        visitedAt: Date.now(),
      });
    });
    const result = await t.action(api.datePlans.makeDatePlan, {
      city: "Lisbon",
      kind: "classic",
    });
    expect(result.stops.map((stop) => stop.name)).toEqual(["Ramen Shop"]);
    expect(result.status).toBe("no_pair");
  });

  it("picks a kind the saves can make when asked to surprise", async () => {
    const { t } = await setup([DINNER, BAR, CAFE]);
    for (let i = 0; i < 4; i++) {
      const result = await t.action(api.datePlans.makeDatePlan, {
        city: "Lisbon",
        kind: "surprise",
      });
      expect(result).toMatchObject({ status: "ready", kind: "classic" });
    }
  });

  it("reads a single-place save's tags even when the place is also its pin", async () => {
    // Apple files most gelato shops as restaurants; the save's tags say it is dessert.
    const gelato: Save = {
      title: "Gelato worth the queue",
      places: ["Gelato Lab, Chiado"],
      pins: [{ name: "Gelato Lab", ...near(3), category: "Restaurant" }],
      tags: ["gelato"],
    };
    const { t } = await setup([DINNER, gelato]);
    const result = await t.action(api.datePlans.makeDatePlan, {
      city: "Lisbon",
      kind: "classic",
    });
    expect(evenings(result)).toEqual([["Ramen Shop", "Gelato Lab"]]);
  });

  it("keeps a single-place coffee save Apple gave no category", async () => {
    const coffee: Save = {
      title: "Best flat white",
      places: ["Fábrica"],
      pins: [{ name: "Fábrica", ...CHIADO }],
      tags: ["coffee"],
    };
    const { t } = await setup([coffee]);
    const result = await t.action(api.datePlans.makeDatePlan, {
      city: "Lisbon",
      kind: "lowkey",
    });
    expect(result.stops).toMatchObject([{ name: "Fábrica", slot: "first" }]);
  });

  it("does not read a save's tags as its places' when it names two", async () => {
    const guide: Save = {
      title: "Two coffee spots",
      places: ["Fábrica", "Copenhagen Coffee Lab"],
      pins: [
        { name: "Fábrica", ...CHIADO },
        { name: "Copenhagen Coffee Lab", ...near(2) },
      ],
      tags: ["coffee"],
    };
    const { t } = await setup([guide]);
    const result = await t.action(api.datePlans.makeDatePlan, {
      city: "Lisbon",
      kind: "lowkey",
    });
    expect(result.status).toBe("no_anchor");
  });

  it("never plans from another account's saves", async () => {
    const { base } = await setup([DINNER, BAR]);
    const other = await base.run(async (ctx) => {
      const userId = await insertConsentingUser(ctx);
      await ctx.db.insert("subscriptions", {
        userId,
        status: "pro",
        expiresAt: Date.now() + 60_000,
        updatedAt: Date.now(),
      });
      return userId;
    });
    const result = await base
      .withIdentity({ subject: `${other}|session-2` })
      .action(api.datePlans.makeDatePlan, { city: "Lisbon", kind: "classic" });
    expect(result.status).toBe("no_anchor");
  });
});
