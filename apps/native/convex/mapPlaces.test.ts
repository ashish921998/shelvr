// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

import { newConvexTest } from "./test.setup";
import { api } from "./_generated/api";

type Pin = {
  name: string;
  lat: number;
  lng: number;
  city?: string;
  appleId?: string;
  category?: string;
};

async function setup() {
  const base = newConvexTest();
  const { userId, otherId } = await base.run(async (ctx) => ({
    userId: await ctx.db.insert("users", {}),
    otherId: await ctx.db.insert("users", {}),
  }));
  const t = base.withIdentity({ subject: `${userId}|session-1` });
  const save = (
    owner: string,
    placePins: Pin[],
    options: { tags?: string[]; status?: "ready" | "processing" } = {},
  ) =>
    base.run((ctx) =>
      ctx.db.insert("items", {
        userId: owner,
        type: "link",
        status: options.status ?? "ready",
        title: "A reel",
        placePins,
        tags: options.tags ?? [],
        searchText: "A reel",
      }),
    );
  return { t, save, userId, otherId };
}

describe("listMapPlaces", () => {
  it("returns every pin across cities with its kinds, and only the caller's ready saves", async () => {
    const { t, save, userId, otherId } = await setup();
    const austin = await save(
      userId,
      [
        {
          name: "Tiny Pies",
          lat: 30.26,
          lng: -97.74,
          city: "Austin",
          appleId: "I1",
          category: "Bakery",
        },
        { name: "Zilker Park", lat: 30.27, lng: -97.77, category: "Park" },
      ],
      { tags: ["date night"] },
    );
    const paris = await save(userId, [
      { name: "Le Bar", lat: 48.86, lng: 2.35, category: "Nightlife" },
    ]);
    await save(userId, [{ name: "Unread", lat: 1, lng: 1 }], {
      status: "processing",
    });
    await save(otherId, [{ name: "Not mine", lat: 2, lng: 2 }]);

    const places = await t.query(api.mapPlaces.listMapPlaces, {});
    expect(places).toEqual([
      {
        itemId: paris,
        name: "Le Bar",
        lat: 48.86,
        lng: 2.35,
        kinds: ["drinks"],
      },
      {
        itemId: austin,
        name: "Tiny Pies",
        lat: 30.26,
        lng: -97.74,
        city: "Austin",
        appleId: "I1",
        kinds: ["dessert", "dateNight"],
      },
      {
        itemId: austin,
        name: "Zilker Park",
        lat: 30.27,
        lng: -97.77,
        kinds: ["dateNight", "activities"],
      },
    ]);
  });

  it("shows a spot saved twice once, with the newest save and both saves' kinds", async () => {
    const { t, save, userId } = await setup();
    const pin = { name: "Café Uno", lat: 40.7, lng: -74 };
    await save(userId, [pin], { tags: ["coffee"] });
    const newer = await save(userId, [pin], { tags: ["dessert"] });
    expect(await t.query(api.mapPlaces.listMapPlaces, {})).toEqual([
      { ...pin, itemId: newer, kinds: ["coffee", "dessert"] },
    ]);
  });

  it("merges one venue saved under two names, and keeps two branches of one name apart", async () => {
    const { t, save, userId } = await setup();
    await save(userId, [
      { name: "Cloud Gate", lat: 41.8827, lng: -87.6233, appleId: "BEAN" },
      { name: "Joe's", lat: 41.89, lng: -87.63, appleId: "JOE1" },
    ]);
    const newer = await save(
      userId,
      [
        { name: "The Bean", lat: 41.8829, lng: -87.6235, appleId: "BEAN" },
        { name: "Joe's", lat: 41.8902, lng: -87.6302, appleId: "JOE2" },
      ],
      { tags: ["date night"] },
    );
    const places = await t.query(api.mapPlaces.listMapPlaces, {});
    expect(places.map((place) => [place.name, place.itemId])).toEqual([
      ["The Bean", newer],
      ["Joe's", newer],
      ["Joe's", expect.any(String)],
    ]);
    expect(places[0].kinds).toEqual(["dateNight"]);
  });

  it("joins a later pin under a venue's other name even without an Apple id", async () => {
    const { t, save, userId } = await setup();
    await save(userId, [{ name: "The Bean", lat: 41.8829, lng: -87.6235 }]);
    await save(userId, [
      { name: "The Bean", lat: 41.8827, lng: -87.6233, appleId: "BEAN" },
    ]);
    await save(userId, [
      { name: "Cloud Gate", lat: 41.8827, lng: -87.6233, appleId: "BEAN" },
    ]);
    const places = await t.query(api.mapPlaces.listMapPlaces, {});
    expect(places.map((place) => place.name)).toEqual(["Cloud Gate"]);
  });
});
