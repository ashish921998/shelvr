// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import type { FunctionReference } from "convex/server";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { api } from "./_generated/api";
import { BEEN_CITY_IDS, BEEN_CITY_POINTS } from "./model/beenCities";
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
          .query("beenCities")
          .withIndex("by_user_and_city", (q) => q.eq("userId", userId))
          .collect()
      ).map((row) => row.cityId),
    );
  const list = () => t.query(api.beenCities.listBeenCities, {});
  const update = (args: { add?: string[]; remove?: string[] }) =>
    t.mutation(api.beenCities.updateBeenCities, args);
  return { t, userId, rows, list, update };
}

async function setup(options: { pro?: boolean } = {}) {
  const backend = newConvexTest();
  return { backend, ...(await account(backend, options)) };
}

function unknownCityLines(warn: { mock: { calls: unknown[][] } }): string[] {
  return warn.mock.calls
    .map(([line]) => String(line))
    .filter((line) => line.includes("been_city_unknown"));
}

describe("the city list", () => {
  it("holds 25 unique kebab-case ids, each a point on the globe", () => {
    expect(BEEN_CITY_IDS).toHaveLength(25);
    expect(new Set(BEEN_CITY_IDS).size).toBe(25);
    expect(
      BEEN_CITY_IDS.filter((id) => !/^[a-z]+(?:-[a-z]+)*$/.test(id)),
    ).toEqual([]);
    expect(
      Object.entries(BEEN_CITY_POINTS).filter(
        ([, { lat, lng }]) =>
          !(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180),
      ),
    ).toEqual([]);
  });
});

describe("listBeenCities and updateBeenCities", () => {
  it("keep the api references installed apps compile against", () => {
    expectTypeOf(api.beenCities.listBeenCities).toEqualTypeOf<
      FunctionReference<"query", "public", Record<never, never>, string[]>
    >();
    expectTypeOf(api.beenCities.updateBeenCities).toEqualTypeOf<
      FunctionReference<
        "mutation",
        "public",
        { add?: string[]; remove?: string[] },
        null
      >
    >();
  });

  it("refuse a signed-out caller and write nothing", async () => {
    const backend = newConvexTest();
    await expect(
      backend.query(api.beenCities.listBeenCities, {}),
    ).rejects.toThrow("Not authenticated");
    await expect(
      backend.mutation(api.beenCities.updateBeenCities, { add: ["lisbon"] }),
    ).rejects.toThrow("Not authenticated");
    expect(
      await backend.run((ctx) => ctx.db.query("beenCities").collect()),
    ).toEqual([]);
  });

  it("refuse an account that has begun deleting", async () => {
    const { t, userId, rows, list, update } = await setup();
    await update({ add: ["lisbon"] });
    await t.run((ctx) => ctx.db.patch(userId, { deleting: true }));

    await expect(list()).rejects.toThrow("Not authenticated");
    await expect(update({ add: ["madrid"] })).rejects.toThrow(
      "Not authenticated",
    );
    expect(await rows()).toEqual(["lisbon"]);
  });

  it("let an account without Pro add and list its cities", async () => {
    const { list, update } = await setup({ pro: false });
    await update({ add: ["lisbon"] });
    expect(await list()).toEqual(["lisbon"]);
  });
});

describe("updateBeenCities", () => {
  it("keeps one row per city however often it is added", async () => {
    const { rows, list, update } = await setup();
    await update({ add: ["lisbon", "lisbon", "madrid"] });
    await update({ add: ["lisbon", "lisbon", "madrid"] });

    expect(await rows()).toEqual(["lisbon", "madrid"]);
    expect(await list()).toEqual(["lisbon", "madrid"]);
  });

  it("removes a city it holds and ignores one it does not", async () => {
    const { rows, update } = await setup();
    await update({ add: ["lisbon", "madrid"] });

    await update({ remove: ["paris"] });
    expect(await rows()).toEqual(["lisbon", "madrid"]);

    await update({ remove: ["lisbon"] });
    expect(await rows()).toEqual(["madrid"]);
  });

  it("leaves a city out when one call both adds and removes it", async () => {
    const { rows, update } = await setup();
    await update({ add: ["lisbon", "paris"], remove: ["paris"] });
    expect(await rows()).toEqual(["lisbon"]);

    await update({ add: ["lisbon"], remove: ["lisbon"] });
    expect(await rows()).toEqual([]);
  });

  it("drops ids it does not know, saves the rest, and logs only their count", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { rows, update } = await setup();

    await update({ add: ["madrid"] });
    expect(unknownCityLines(warn)).toEqual([]);

    await update({
      add: ["atlantis", "lisbon", "__proto__"],
      remove: ["toString"],
    });
    expect(await rows()).toEqual(["lisbon", "madrid"]);
    const lines = unknownCityLines(warn);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      level: "warn",
      event: "been_city_unknown",
      count: 3,
    });
    expect(lines[0]).not.toMatch(/atlantis|__proto__|toString/);
  });

  it("refuses more than 50 changes in one call and writes nothing", async () => {
    const { rows, update } = await setup();
    const twice = [...BEEN_CITY_IDS, ...BEEN_CITY_IDS];

    await expect(
      update({ add: twice.slice(0, 26), remove: twice.slice(0, 25) }),
    ).rejects.toThrow("Too many cities");
    expect(await rows()).toEqual([]);

    await update({ add: twice });
    expect(await rows()).toEqual(BEEN_CITY_IDS);
  });

  it("stops a burst at the 61st call, for that account only", async () => {
    const { backend, rows, update } = await setup();
    for (let call = 0; call < 60; call++) await update({ add: ["lisbon"] });

    await expect(update({ add: ["madrid"] })).rejects.toThrow(/RateLimited/);
    expect(await rows()).toEqual(["lisbon"]);

    const other = await account(backend);
    await other.update({ add: ["madrid"] });
    expect(await other.rows()).toEqual(["madrid"]);
  });

  it("never touches another account's cities", async () => {
    const a = await setup();
    const b = await account(a.backend);
    await b.update({ add: ["lisbon", "tokyo"] });

    await a.update({ add: ["lisbon"] });
    await a.update({ remove: ["lisbon", "tokyo"] });

    expect(await a.list()).toEqual([]);
    expect(await b.list()).toEqual(["lisbon", "tokyo"]);
    await a.update({ add: ["paris"] });
    expect(await b.list()).toEqual(["lisbon", "tokyo"]);
    expect(await a.list()).toEqual(["paris"]);
  });
});

describe("listBeenCities", () => {
  it("leaves out a stored id that is not on the list", async () => {
    const { t, userId, list, update } = await setup();
    await update({ add: ["madrid"] });
    await t.run((ctx) =>
      ctx.db.insert("beenCities", { userId, cityId: "atlantis" }),
    );

    expect(await list()).toEqual(["madrid"]);
  });

  it("still lists every city when a retired id sorts before them all", async () => {
    const { t, userId, rows, list, update } = await setup();
    await update({ add: BEEN_CITY_IDS });
    await t.run((ctx) =>
      ctx.db.insert("beenCities", { userId, cityId: "aaa-retired" }),
    );

    const listed = await list();
    expect(listed).toEqual(BEEN_CITY_IDS);
    expect(listed).toContain("vancouver");

    await update({ remove: ["aaa-retired"] });
    expect(await rows()).toContain("aaa-retired");
  });
});
