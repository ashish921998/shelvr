// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

import { newConvexTest } from "./test.setup";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

type Save = {
  title: string;
  cities?: string[];
  status?: "ready" | "processing" | "failed";
  heroImageUrl?: string;
};

async function setup(options: { pro?: boolean } = {}) {
  const base = newConvexTest();
  const seeded = await base.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {});
    const otherId = await ctx.db.insert("users", {});
    if (options.pro !== false) {
      await ctx.db.insert("subscriptions", {
        userId,
        status: "pro",
        expiresAt: Date.now() + 60_000,
        updatedAt: Date.now(),
      });
    }
    return { userId, otherId };
  });
  const t = base.withIdentity({ subject: `${seeded.userId}|session-1` });
  const save = (userId: string, s: Save): Promise<Id<"items">> =>
    base.run((ctx) =>
      ctx.db.insert("items", {
        userId,
        type: "link",
        status: s.status ?? "ready",
        title: s.title,
        cities: s.cities,
        heroImageUrl: s.heroImageUrl,
        tags: [],
        searchText: s.title,
      }),
    );
  return { base, t, save, ...seeded };
}

describe("listCities", () => {
  it("groups spellings, orders by count then name, and picks the newest cover", async () => {
    const { t, save, userId, otherId } = await setup();
    await save(userId, {
      title: "a",
      cities: ["Lisbon"],
      heroImageUrl: "https://img/old.jpg",
    });
    await save(userId, { title: "b", cities: [" lisbon "] });
    await save(userId, {
      title: "c",
      cities: ["Lisbon"],
      heroImageUrl: "https://img/new.jpg",
    });
    await save(userId, { title: "d", cities: ["Porto"] });
    await save(userId, { title: "e", cities: ["Faro"] });
    await save(userId, {
      title: "f",
      cities: ["Lisbon"],
      status: "processing",
    });
    await save(userId, { title: "g", cities: ["Lisbon"], status: "failed" });
    await save(userId, { title: "h", cities: ["Madrid", "Madrid"] });
    await save(otherId, { title: "x", cities: ["Rome", "Rome", "Lisbon"] });

    expect(await t.query(api.items.listCities, {})).toEqual([
      { city: "Lisbon", count: 3, cover: "https://img/new.jpg" },
      { city: "Faro", count: 1, cover: null },
      { city: "Madrid", count: 1, cover: null },
      { city: "Porto", count: 1, cover: null },
    ]);
  });

  it("refuses unauthenticated callers", async () => {
    const { base } = await setup();
    await expect(base.query(api.items.listCities, {})).rejects.toThrow();
  });
});

describe("listCityItems", () => {
  it("returns only the caller's ready saves in that city, newest first", async () => {
    const { t, save, userId, otherId } = await setup();
    const first = await save(userId, { title: "first", cities: ["Lisbon"] });
    const second = await save(userId, { title: "second", cities: ["lisbon"] });
    await save(userId, { title: "porto", cities: ["Porto"] });
    await save(userId, {
      title: "busy",
      cities: ["Lisbon"],
      status: "processing",
    });
    await save(otherId, { title: "theirs", cities: ["Lisbon"] });

    const items = await t.query(api.items.listCityItems, { city: "Lisbon" });
    expect(items.map((item) => item._id)).toEqual([second, first]);
  });
});

describe("ensureCitySpace", () => {
  async function members(
    base: Awaited<ReturnType<typeof setup>>["base"],
    spaceId: Id<"spaces">,
  ) {
    return await base.run(async (ctx) => {
      const space = await ctx.db.get(spaceId);
      const joins = await ctx.db
        .query("spaceItems")
        .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
        .collect();
      return { space, joins };
    });
  }

  it("creates the space once and files every save in the city", async () => {
    const { base, t, save, userId } = await setup();
    const a = await save(userId, { title: "a", cities: ["Lisbon"] });
    const b = await save(userId, { title: "b", cities: ["Lisbon"] });
    await save(userId, { title: "c", cities: ["Porto"] });

    const spaceId = await t.mutation(api.spaces.ensureCitySpace, {
      city: "Lisbon",
    });
    const again = await t.mutation(api.spaces.ensureCitySpace, {
      city: "Lisbon",
    });
    expect(again).toBe(spaceId);

    const { space, joins } = await members(base, spaceId);
    expect(space).toMatchObject({
      name: "Lisbon",
      dynamic: false,
      savedCount: 2,
      suggestedCount: 0,
    });
    expect(space?.previewItemIds).toHaveLength(2);
    expect(joins.map((j) => j.itemId).sort()).toEqual([a, b].sort());
    expect(joins.every((j) => j.status === "saved")).toBe(true);
  });

  it("files saves oldest first", async () => {
    const { base, t, save, userId } = await setup();
    const older = await save(userId, { title: "a", cities: ["Lisbon"] });
    const newer = await save(userId, { title: "b", cities: ["Lisbon"] });
    const spaceId = await t.mutation(api.spaces.ensureCitySpace, {
      city: "Lisbon",
    });
    const { joins } = await members(base, spaceId);
    expect(joins.map((j) => j.itemId)).toEqual([older, newer]);
  });

  it("reuses the city's space whatever its spelling", async () => {
    const { base, t, save, userId } = await setup();
    await save(userId, { title: "a", cities: ["Lisbon"] });
    const spaceId = await base.run((ctx) =>
      ctx.db.insert("spaces", { userId, name: "lisbon", dynamic: false }),
    );
    expect(
      await t.mutation(api.spaces.ensureCitySpace, { city: " LISBON " }),
    ).toBe(spaceId);
    const spaces = await base.run((ctx) =>
      ctx.db
        .query("spaces")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    );
    expect(spaces).toHaveLength(1);
  });

  it("creates no space for a city with no ready saves", async () => {
    const { base, t, save, userId } = await setup();
    await save(userId, {
      title: "a",
      cities: ["Lisbon"],
      status: "processing",
    });
    await expect(
      t.mutation(api.spaces.ensureCitySpace, { city: "Lisbon" }),
    ).rejects.toThrow(/city_empty/);
    const spaces = await base.run((ctx) =>
      ctx.db
        .query("spaces")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    );
    expect(spaces).toHaveLength(0);
  });

  it("leaves dismissed and suggested memberships as they are", async () => {
    const { base, t, save, userId } = await setup();
    const dismissed = await save(userId, { title: "d", cities: ["Lisbon"] });
    const suggested = await save(userId, { title: "s", cities: ["Lisbon"] });
    const spaceId = await base.run((ctx) =>
      ctx.db.insert("spaces", { userId, name: "Lisbon", dynamic: false }),
    );
    await base.run(async (ctx) => {
      await ctx.db.insert("spaceItems", {
        userId,
        spaceId,
        itemId: dismissed,
        status: "dismissed",
      });
      await ctx.db.insert("spaceItems", {
        userId,
        spaceId,
        itemId: suggested,
        status: "suggested",
      });
    });

    expect(
      await t.mutation(api.spaces.ensureCitySpace, { city: "Lisbon" }),
    ).toBe(spaceId);
    const { joins } = await members(base, spaceId);
    expect(joins.map((j) => [j.itemId, j.status]).sort()).toEqual(
      [
        [dismissed, "dismissed"],
        [suggested, "suggested"],
      ].sort(),
    );
  });

  it("refuses a non-Pro caller", async () => {
    const { t, save, userId } = await setup({ pro: false });
    await save(userId, { title: "a", cities: ["Lisbon"] });
    await expect(
      t.mutation(api.spaces.ensureCitySpace, { city: "Lisbon" }),
    ).rejects.toThrow();
  });

  it("refuses unauthenticated callers", async () => {
    const { base } = await setup();
    await expect(
      base.mutation(api.spaces.ensureCitySpace, { city: "Lisbon" }),
    ).rejects.toThrow();
  });
});
