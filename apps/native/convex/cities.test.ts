// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

import { newConvexTest } from "./test.setup";
import { api } from "./_generated/api";
import { toPlanSource } from "./tripData";
import type { Id } from "./_generated/dataModel";

type Save = {
  title: string;
  cities?: string[];
  status?: "ready" | "processing" | "failed";
  heroImageUrl?: string;
  placePins?: { name: string; lat: number; lng: number; city?: string }[];
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
        placePins: s.placePins ?? [{ name: s.title, lat: 38.7, lng: -9.1 }],
        tags: [],
        searchText: s.title,
      }),
    );
  return { base, t, save, ...seeded };
}

describe("listCities", () => {
  it("counts five mapped places in one reel, deduplicates repeat saves, and excludes unlocated saves", async () => {
    const { t, save, userId } = await setup();
    const placePins = ["PNY", "Blend", "Bomaye", "Micho", "El Nopal"].map(
      (name, i) => ({ name, lat: 48.86 + i / 1000, lng: 2.35 }),
    );
    await save(userId, {
      title: "Five restaurants",
      cities: ["Paris"],
      placePins,
    });
    await save(userId, {
      title: "Another reel",
      cities: ["Paris"],
      placePins: [placePins[0]],
    });
    await save(userId, {
      title: "No coordinates yet",
      cities: ["Paris"],
      placePins: [],
    });
    expect(await t.query(api.items.listCities, {})).toEqual([
      { city: "Paris", count: 3, placeCount: 5, cover: null },
    ]);
  });
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
      { city: "Lisbon", count: 3, placeCount: 3, cover: "https://img/new.jpg" },
      { city: "Faro", count: 1, placeCount: 1, cover: null },
      { city: "Madrid", count: 1, placeCount: 1, cover: null },
      { city: "Porto", count: 1, placeCount: 1, cover: null },
    ]);
  });

  it("gives two cities from one reel different covers when another photo exists", async () => {
    const { t, save, userId } = await setup();
    await save(userId, {
      title: "Sintra palace",
      cities: ["Sintra"],
      heroImageUrl: "https://img/sintra.jpg",
    });
    await save(userId, {
      title: "Lisbon and a day in Sintra",
      cities: ["Lisbon", "Sintra"],
      heroImageUrl: "https://img/both.jpg",
    });
    await save(userId, { title: "Alfama", cities: ["Lisbon"] });

    const covers = Object.fromEntries(
      (await t.query(api.items.listCities, {})).map((c) => [c.city, c.cover]),
    );
    expect(covers).toEqual({
      Lisbon: "https://img/both.jpg",
      Sintra: "https://img/sintra.jpg",
    });
  });

  it("prefers a photo no earlier city shows, and repeats one only when a city has no other", async () => {
    const { t, save, userId } = await setup();
    await save(userId, {
      title: "Day trip",
      cities: ["Lisbon", "Sintra"],
      heroImageUrl: "https://img/both.jpg",
    });
    await save(userId, {
      title: "Lisbon only",
      cities: ["Lisbon"],
      heroImageUrl: "https://img/lisbon.jpg",
      placePins: [
        { name: "A", lat: 38.7, lng: -9.1 },
        { name: "B", lat: 38.71, lng: -9.1 },
      ],
    });

    const covers = Object.fromEntries(
      (await t.query(api.items.listCities, {})).map((c) => [c.city, c.cover]),
    );
    expect(covers).toEqual({
      Lisbon: "https://img/lisbon.jpg",
      Sintra: "https://img/both.jpg",
    });
  });

  it("prefers a photo from a save naming only that city over a newer shared one", async () => {
    const { t, save, userId } = await setup();
    await save(userId, {
      title: "Sintra palace",
      cities: ["Sintra"],
      heroImageUrl: "https://img/sintra.jpg",
    });
    await save(userId, {
      title: "Day trip",
      cities: ["Lisbon", "Sintra"],
      heroImageUrl: "https://img/both.jpg",
    });
    await save(userId, {
      title: "Lisbon only",
      cities: ["Lisbon"],
      heroImageUrl: "https://img/lisbon.jpg",
    });

    const covers = Object.fromEntries(
      (await t.query(api.items.listCities, {})).map((c) => [c.city, c.cover]),
    );
    // Newest first alone would hand Sintra the unshown, newer both.jpg.
    expect(covers).toEqual({
      Lisbon: "https://img/lisbon.jpg",
      Sintra: "https://img/sintra.jpg",
    });
  });

  it("moves a later city to the next photo when an earlier city already shows the first", async () => {
    const { t, save, userId } = await setup();
    await save(userId, {
      title: "Older trip",
      cities: ["Lisbon", "Sintra", "Tomar"],
      heroImageUrl: "https://img/older.jpg",
    });
    await save(userId, {
      title: "Newer trip",
      cities: ["Lisbon", "Sintra"],
      heroImageUrl: "https://img/newer.jpg",
    });

    const covers = Object.fromEntries(
      (await t.query(api.items.listCities, {})).map((c) => [c.city, c.cover]),
    );
    // No pin carries a city, so all three tie and sort by name. Lisbon takes
    // the newer photo; Sintra, with the same two to choose from,
    // takes the one Lisbon doesn't show; Tomar has only an already-shown photo
    // and repeats it rather than go blank.
    expect(covers).toEqual({
      Lisbon: "https://img/newer.jpg",
      Sintra: "https://img/older.jpg",
      Tomar: "https://img/older.jpg",
    });
  });

  it("creates separate city entries for one reel and counts only each city's places", async () => {
    const { base, t, save, userId } = await setup();
    const lisbon = { name: "Cafe", lat: 38.72, lng: -9.1, city: "Lisbon" };
    const porto = { name: "Tower", lat: 41.15, lng: -8.6, city: "Porto" };
    const id = await save(userId, {
      title: "Portugal reel",
      cities: ["Lisbon", "Porto"],
      placePins: [lisbon, porto],
    });
    expect(await t.query(api.items.listCities, {})).toEqual([
      { city: "Lisbon", count: 1, placeCount: 1, cover: null },
      { city: "Porto", count: 1, placeCount: 1, cover: null },
    ]);
    for (const [city, pin] of [
      ["Lisbon", lisbon],
      ["Porto", porto],
    ] as const) {
      const items = await t.query(api.items.listCityItems, { city });
      expect(items).toHaveLength(1);
      expect(items[0].placePins).toEqual([pin]);
      const source = await base.run(async (ctx) => {
        const item = await ctx.db.get(id);
        if (!item) throw new Error("Missing fixture");
        return toPlanSource(item, undefined, city);
      });
      expect(source.pins).toEqual([
        { name: pin.name, lat: pin.lat, lng: pin.lng },
      ]);
      expect(source.places).toEqual([pin.name]);
    }
  });

  it("keeps legacy multi-city saves reachable without putting unknown-city pins in both cities", async () => {
    const { t, save, userId } = await setup();
    await save(userId, {
      title: "Old reel",
      cities: ["Lisbon", "Porto"],
      placePins: [{ name: "Unknown city", lat: 38.7, lng: -9.1 }],
    });
    expect(
      (await t.query(api.items.listCities, {})).map((city) => city.placeCount),
    ).toEqual([0, 0]);
    expect(
      (await t.query(api.items.listCityItems, { city: "Porto" }))[0].placePins,
    ).toEqual([]);
  });

  it("refuses unauthenticated callers", async () => {
    const { base } = await setup();
    await expect(base.query(api.items.listCities, {})).rejects.toThrow();
  });

  it("keeps the legacy save count positive before pins arrive and reports pins separately", async () => {
    const { base, t, save, userId } = await setup();
    const id = await save(userId, {
      title: "Paris reel",
      cities: ["Paris"],
      placePins: [],
    });
    expect(await t.query(api.items.listCities, {})).toEqual([
      { city: "Paris", count: 1, placeCount: 0, cover: null },
    ]);
    await base.run(async (ctx) =>
      ctx.db.patch(id, {
        placePins: [
          { name: "Micho", lat: 48.866, lng: 2.337 },
          { name: "PNY", lat: 48.864, lng: 2.363 },
        ],
      }),
    );
    expect(await t.query(api.items.listCities, {})).toEqual([
      { city: "Paris", count: 1, placeCount: 2, cover: null },
    ]);
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
