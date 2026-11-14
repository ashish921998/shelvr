// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import type { FunctionReference } from "convex/server";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { api } from "./_generated/api";
import {
  CITY_STAMP_CITIES,
  CITY_STAMP_IDS,
  MAX_ONBOARDING_CITY_STAMPS,
} from "./model/cityStamps";
import { badgeTotals } from "./model/badges";
import { newConvexTest, signedInUser, type TestBackend } from "./test.setup";

afterEach(() => {
  vi.restoreAllMocks();
});

async function account(backend: TestBackend, options: { pro?: boolean } = {}) {
  const { t, userId } = await signedInUser(backend, { pro: options.pro });
  const rows = () =>
    t.run(async (ctx) =>
      (
        await ctx.db
          .query("cityStamps")
          .withIndex("by_user_and_city", (q) => q.eq("userId", userId))
          .collect()
      ).map((row) => row.city),
    );
  const list = () => t.query(api.cityStamps.listCityStamps, {});
  const add = (city: string) =>
    t.mutation(api.cityStamps.addCityStamp, { city });
  const remove = (city: string) =>
    t.mutation(api.cityStamps.removeCityStamp, { city });
  const claim = (cities: string[]) =>
    t.mutation(api.cityStamps.claimOnboardingCityStamps, { cities });
  return { t, userId, rows, list, add, remove, claim };
}

async function setup(options: { pro?: boolean } = {}) {
  const backend = newConvexTest();
  return { backend, ...(await account(backend, options)) };
}

describe("the city list", () => {
  it("holds 25 unique kebab-case ids, each with a two-letter country", () => {
    expect(CITY_STAMP_IDS).toHaveLength(25);
    expect(new Set(CITY_STAMP_IDS).size).toBe(25);
    expect(
      CITY_STAMP_IDS.filter((id) => !/^[a-z]+(?:-[a-z]+)*$/.test(id)),
    ).toEqual([]);
    expect(
      Object.values(CITY_STAMP_CITIES).filter(
        ({ country }) => !/^[A-Z]{2}$/.test(country),
      ),
    ).toEqual([]);
  });
});

describe("the public api", () => {
  it("keeps the references installed apps compile against", () => {
    expectTypeOf(api.cityStamps.listCityStamps).toEqualTypeOf<
      FunctionReference<
        "query",
        "public",
        Record<never, never>,
        { city: string; country: string; stampedAt: number }[]
      >
    >();
    expectTypeOf(api.cityStamps.addCityStamp).toEqualTypeOf<
      FunctionReference<"mutation", "public", { city: string }, boolean>
    >();
    expectTypeOf(api.cityStamps.removeCityStamp).toEqualTypeOf<
      FunctionReference<"mutation", "public", { city: string }, boolean>
    >();
    expectTypeOf(api.cityStamps.claimOnboardingCityStamps).toEqualTypeOf<
      FunctionReference<"mutation", "public", { cities: string[] }, number>
    >();
  });

  it("refuses a signed-out caller and writes nothing", async () => {
    const backend = newConvexTest();
    await expect(
      backend.query(api.cityStamps.listCityStamps, {}),
    ).rejects.toThrow("Not authenticated");
    await expect(
      backend.mutation(api.cityStamps.addCityStamp, { city: "lisbon" }),
    ).rejects.toThrow("Not authenticated");
    await expect(
      backend.mutation(api.cityStamps.claimOnboardingCityStamps, {
        cities: ["lisbon"],
      }),
    ).rejects.toThrow("Not authenticated");
    expect(
      await backend.run((ctx) => ctx.db.query("cityStamps").collect()),
    ).toEqual([]);
  });

  it("refuses an account that has begun deleting", async () => {
    const { t, userId, rows, list, add, remove, claim } = await setup({
      pro: true,
    });
    await add("lisbon");
    await t.run((ctx) => ctx.db.patch(userId, { deleting: true }));

    await expect(list()).rejects.toThrow("Not authenticated");
    await expect(add("madrid")).rejects.toThrow("Not authenticated");
    await expect(remove("lisbon")).rejects.toThrow("Not authenticated");
    await expect(claim(["tokyo"])).rejects.toThrow("Not authenticated");
    expect(await rows()).toEqual(["lisbon"]);
  });
});

describe("addCityStamp", () => {
  it("stamps a city once, with its country and a time, for a Pro account", async () => {
    vi.useFakeTimers({ now: 1_700_000_000_000 });
    try {
      const { list, add } = await setup({ pro: true });
      expect(await add("lisbon")).toBe(true);
      expect(await add("lisbon")).toBe(false);
      expect(await list()).toEqual([
        { city: "lisbon", country: "PT", stampedAt: 1_700_000_000_000 },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("needs Pro, like any stamp, and writes nothing without it", async () => {
    const { rows, add } = await setup({ pro: false });
    await expect(add("lisbon")).rejects.toThrow("pro_required");
    expect(await rows()).toEqual([]);
  });

  it("refuses a city that is not on the list", async () => {
    const { rows, add } = await setup({ pro: true });
    await expect(add("atlantis")).rejects.toThrow("Unknown city");
    await expect(add("__proto__")).rejects.toThrow("Unknown city");
    expect(await rows()).toEqual([]);
  });

  it("stops a burst at the 61st edit, for that account only", async () => {
    const { backend, rows, add, remove } = await setup({ pro: true });
    for (let call = 0; call < 30; call++) {
      await add("lisbon");
      await remove("lisbon");
    }
    await expect(add("madrid")).rejects.toThrow(/RateLimited/);
    expect(await rows()).toEqual([]);

    const other = await account(backend, { pro: true });
    expect(await other.add("madrid")).toBe(true);
  });
});

describe("removeCityStamp", () => {
  it("takes a stamp off without Pro, and ignores a city it does not hold", async () => {
    const { t, userId, rows, remove } = await setup({ pro: false });
    await t.run((ctx) =>
      ctx.db.insert("cityStamps", {
        userId,
        city: "lisbon",
        country: "PT",
        stampedAt: 1,
      }),
    );
    expect(await remove("paris")).toBe(false);
    expect(await remove("lisbon")).toBe(true);
    expect(await rows()).toEqual([]);
  });

  it("never touches another account's stamps", async () => {
    const a = await setup({ pro: true });
    const b = await account(a.backend, { pro: true });
    await b.add("lisbon");
    expect(await a.remove("lisbon")).toBe(false);
    expect(await b.rows()).toEqual(["lisbon"]);
  });
});

describe("listCityStamps", () => {
  it("leaves out a stored city that is no longer on the list", async () => {
    const { t, userId, list, add } = await setup({ pro: true });
    await add("madrid");
    await t.run((ctx) =>
      ctx.db.insert("cityStamps", {
        userId,
        city: "aaa-retired",
        country: "XX",
        stampedAt: 1,
      }),
    );
    expect((await list()).map((stamp) => stamp.city)).toEqual(["madrid"]);
  });
});

describe("claimOnboardingCityStamps", () => {
  it("stamps a free account's onboarding picks once, dropping repeats and unknown ids", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { rows, claim } = await setup({ pro: false });
    expect(await claim(["tokyo", "lisbon", "lisbon", "atlantis"])).toBe(2);
    expect(await rows()).toEqual(["lisbon", "tokyo"]);
    const line = warn.mock.calls
      .map(([text]) => String(text))
      .find((text) => text.includes("city_stamp_unknown"));
    expect(line).toBeDefined();
    expect(line).not.toMatch(/atlantis/);
  });

  it("refuses a free account that already holds a city stamp", async () => {
    const { t, userId, rows, claim } = await setup({ pro: false });
    await t.run((ctx) =>
      ctx.db.insert("cityStamps", {
        userId,
        city: "paris",
        country: "FR",
        stampedAt: 1,
      }),
    );
    expect(await claim(["tokyo"])).toBe(0);
    expect(await rows()).toEqual(["paris"]);
  });

  it("refuses a second claim from a free account, even after its stamps are removed", async () => {
    const { rows, claim, remove } = await setup({ pro: false });
    expect(await claim(["tokyo"])).toBe(1);
    await remove("tokyo");
    expect(await claim(["lisbon", "paris"])).toBe(0);
    expect(await rows()).toEqual([]);
  });

  it("refuses more cities than the list holds and writes nothing", async () => {
    const { rows, claim } = await setup({ pro: false });
    const tooMany = [...CITY_STAMP_IDS, "lisbon"];
    expect(tooMany.length).toBeGreaterThan(MAX_ONBOARDING_CITY_STAMPS);
    await expect(claim(tooMany)).rejects.toThrow("Too many cities");
    expect(await rows()).toEqual([]);
    expect(await claim(CITY_STAMP_IDS)).toBe(25);
  });

  it("writes nothing and keeps the claim open when no pick is on the list", async () => {
    const { rows, claim } = await setup({ pro: false });
    expect(await claim(["atlantis"])).toBe(0);
    expect(await claim([])).toBe(0);
    expect(await claim(["rome"])).toBe(1);
    expect(await rows()).toEqual(["rome"]);
  });

  it("adds a Pro account's picks to the stamps it already has", async () => {
    const { rows, add, claim } = await setup({ pro: true });
    await add("paris");
    expect(await claim(["paris", "rome"])).toBe(1);
    expect(await claim(["seoul"])).toBe(1);
    expect(await rows()).toEqual(["paris", "rome", "seoul"]);
  });

  it("keeps a free account's claimed stamps, which still need Pro to add more", async () => {
    const { list, add, claim } = await setup({ pro: false });
    await claim(["tokyo", "lisbon"]);
    await expect(add("rome")).rejects.toThrow("pro_required");
    expect((await list()).map((stamp) => stamp.city)).toEqual([
      "lisbon",
      "tokyo",
    ]);
  });
});

describe("city stamps in the passport totals", () => {
  it("count toward cities, countries and their badges, but never places or rings", async () => {
    const { t, userId, list, claim } = await setup({ pro: false });
    await claim(["tokyo", "lisbon", "paris", "rome", "seoul"]);
    const itemId = await t.run((ctx) =>
      ctx.db.insert("items", {
        userId,
        type: "link",
        status: "ready",
        title: "Lisbon",
        tags: [],
        searchText: "",
        cities: ["Lisbon"],
        placePins: [{ name: "Tasca", lat: 38.72, lng: -9.15 }],
      }),
    );
    expect(itemId).toBeDefined();
    const completion = await t.query(api.placeVisits.cityCompletion, {});
    expect(completion).toEqual([
      expect.objectContaining({ city: "Lisbon", stamped: 0, total: 1 }),
    ]);
    const stamps = await t.query(api.placeVisits.listBadgeStamps, {});
    const totals = badgeTotals(stamps, completion, await list());
    expect(totals).toMatchObject({
      places: 0,
      cities: 5,
      countries: 5,
      completeCities: 0,
    });
  });
});
