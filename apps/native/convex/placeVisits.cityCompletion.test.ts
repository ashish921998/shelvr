// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cityPins } from "@/lib/city-pins";
import { cityProgress, visitedPinIds } from "@/lib/city-progress";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { newConvexTest, signedInUser } from "./test.setup";

const TIGRE = { name: "Tigre", lat: 38.71, lng: -9.14 };
const BLEND = { name: "Blend", lat: 38.72, lng: -9.15 };
const MANTEIGARIA = { name: "Manteigaria", lat: 38.711, lng: -9.143 };
const MAJESTIC = { name: "Majestic", lat: 41.15, lng: -8.61 };
const CERVEJARIA = { name: "Cervejaria", lat: 38.73, lng: -9.16 };

type Pin = { name: string; lat: number; lng: number; city?: string };

async function setup() {
  const backend = newConvexTest();
  const { t, userId } = await signedInUser(backend, { pro: true });
  const save = (cities: string[] | undefined, placePins: Pin[]) =>
    t.run((ctx) =>
      ctx.db.insert("items", {
        userId,
        type: "link",
        status: "ready",
        title: cities?.join(" and ") ?? "Somewhere",
        tags: [],
        searchText: "",
        ...(cities === undefined ? {} : { cities }),
        placePins,
      }),
    );
  const stamp = (itemId: Id<"items">, pin: Pin) =>
    t.mutation(api.placeVisits.setVisited, {
      itemId,
      name: pin.name,
      visited: true,
      spot: { lat: pin.lat, lng: pin.lng },
    });
  const rings = () => t.query(api.placeVisits.cityCompletion, {});
  return { backend, t, userId, save, stamp, rings };
}

describe("cityCompletion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refuses a signed-out caller", async () => {
    const backend = newConvexTest();
    await expect(
      backend.query(api.placeVisits.cityCompletion, {}),
    ).rejects.toThrow("Not authenticated");
  });

  it("has no rows for someone with nothing saved", async () => {
    const { rings } = await setup();
    expect(await rings()).toEqual([]);
  });

  it("counts a partly stamped city", async () => {
    const { save, stamp, rings } = await setup();
    const itemId = await save(["Lisbon"], [TIGRE, BLEND, MANTEIGARIA]);
    await stamp(itemId, TIGRE);
    expect(await rings()).toEqual([{ city: "Lisbon", stamped: 1, total: 3 }]);
  });

  it("fills a city once each of its places is stamped", async () => {
    const { save, stamp, rings } = await setup();
    const first = await save(["Lisbon"], [TIGRE, BLEND]);
    const second = await save(["Lisbon"], [MANTEIGARIA, TIGRE]);
    await stamp(first, TIGRE);
    await stamp(first, BLEND);
    await stamp(second, MANTEIGARIA);
    expect(await rings()).toEqual([{ city: "Lisbon", stamped: 3, total: 3 }]);
  });

  it("keeps a stamp after its save drops the pin or is deleted", async () => {
    const { t, save, stamp, rings } = await setup();
    const kept = await save(["Lisbon"], [TIGRE, BLEND]);
    const gone = await save(["Porto"], [MAJESTIC]);
    await stamp(kept, TIGRE);
    vi.advanceTimersByTime(60_000);
    await stamp(gone, MAJESTIC);
    await t.run(async (ctx) => {
      await ctx.db.patch(kept, { placePins: [BLEND] });
      await ctx.db.delete(gone);
    });
    expect(await rings()).toEqual([
      { city: "Porto", stamped: 1, total: 1 },
      { city: "Lisbon", stamped: 1, total: 2 },
    ]);
  });

  it("leaves out a pin with no city", async () => {
    const { save, rings } = await setup();
    await save(["Lisbon", "Porto"], [TIGRE]);
    await save(undefined, [BLEND]);
    expect(await rings()).toEqual([]);
  });

  it("merges cities that differ in case, and keeps accented spellings apart", async () => {
    const { save, stamp, rings } = await setup();
    const upper = await save(["Lisbon"], [TIGRE]);
    await save(["lisbon"], [BLEND]);
    await save(["Lisbon"], [MANTEIGARIA]);
    await save(["São Paulo"], [{ name: "Bráz", lat: -23.55, lng: -46.63 }]);
    await save(["Sao Paulo"], [{ name: "Mocotó", lat: -23.5, lng: -46.6 }]);
    await stamp(upper, TIGRE);
    expect(await rings()).toEqual([
      { city: "Lisbon", stamped: 1, total: 3 },
      { city: "Sao Paulo", stamped: 0, total: 1 },
      { city: "São Paulo", stamped: 0, total: 1 },
    ]);
  });

  it("lists the city stamped last first, then undated stamps, then unstamped cities by size", async () => {
    const { t, save, stamp, rings } = await setup();
    const lisbon = await save(["Lisbon"], [TIGRE]);
    const porto = await save(["Porto"], [MAJESTIC]);
    const faro = await save(
      ["Faro"],
      [{ name: "Gelo", lat: 37.02, lng: -7.93 }],
    );
    await save(["Madrid"], [{ name: "Sobrino", lat: 40.41, lng: -3.7 }]);
    await save(
      ["Rome"],
      [
        { name: "Roscioli", lat: 41.89, lng: 12.47 },
        { name: "Armando", lat: 41.9, lng: 12.48 },
      ],
    );
    await stamp(porto, MAJESTIC);
    vi.advanceTimersByTime(60_000);
    await stamp(lisbon, TIGRE);
    vi.advanceTimersByTime(60_000);
    await t.mutation(api.placeVisits.markVisitedBefore, {
      places: [{ itemId: faro, name: "Gelo" }],
    });
    expect((await rings()).map(({ city }) => city)).toEqual([
      "Lisbon",
      "Porto",
      "Faro",
      "Rome",
      "Madrid",
    ]);
  });

  it("counts one place once when two stamps tick it", async () => {
    const { save, stamp, rings } = await setup();
    const nextDoor = { ...TIGRE, lat: TIGRE.lat + 0.0005 };
    const first = await save(["Lisbon"], [TIGRE]);
    const second = await save(["Lisbon"], [nextDoor]);
    await stamp(first, TIGRE);
    await stamp(second, { ...nextDoor, name: "Tigre, Lisbon" });
    await stamp(second, nextDoor);
    expect(await rings()).toEqual([{ city: "Lisbon", stamped: 1, total: 1 }]);
  });

  it("agrees with the city page's progress for the same saves", async () => {
    const { t, userId, save, stamp, rings } = await setup();
    const both = await save(
      ["Lisbon", "Porto"],
      [
        { ...TIGRE, city: "Lisbon" },
        { ...MAJESTIC, city: "Porto" },
        { name: "Somewhere", lat: 40, lng: -8 },
      ],
    );
    const nextDoor = { ...TIGRE, lat: TIGRE.lat + 0.0005 };
    const lisbon = await save(
      ["Lisbon"],
      [nextDoor, BLEND, MANTEIGARIA, CERVEJARIA],
    );
    await stamp(both, { ...TIGRE, city: "Lisbon" });
    await stamp(lisbon, nextDoor);
    await stamp(lisbon, { ...nextDoor, name: "Tigre, Lisbon" });
    await stamp(lisbon, BLEND);
    await t.run((ctx) =>
      ctx.db.insert("placeVisits", {
        userId,
        key: "cervejaria",
        name: "Cervejaria",
        itemId: both,
        visitedAt: Date.now(),
      }),
    );
    await t.mutation(api.placeRemovals.removePlace, {
      itemId: lisbon,
      ...MANTEIGARIA,
    });

    const visits = await t.query(api.placeVisits.listVisits, {});
    const page = async (city: string) => {
      const pins = cityPins(await t.query(api.items.listCityItems, { city }));
      const { visited, total } = cityProgress(
        pins,
        visitedPinIds(pins, visits),
      );
      return { city, stamped: visited, total };
    };
    expect(await rings()).toEqual([await page("Lisbon"), await page("Porto")]);
    expect(await page("Lisbon")).toEqual({
      city: "Lisbon",
      stamped: 3,
      total: 3,
    });
    expect(
      (await t.query(api.placeVisits.getPassport, {})).filter(
        (row) => row.city === "Lisbon",
      ),
    ).toHaveLength(4);
  });
});

describe("listUnstampedPlacesInCity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const spots = (city: string, count: number, lat: number, lng: number) =>
    Array.from({ length: count }, (_, index) => ({
      name: `${city} spot ${index}`,
      lat: lat + index * 0.01,
      lng,
    }));

  it("refuses a signed-out caller", async () => {
    const backend = newConvexTest();
    await expect(
      backend.query(api.placeVisits.listUnstampedPlacesInCity, {
        city: "Tokyo",
      }),
    ).rejects.toThrow("Not authenticated");
  });

  it("lists an older city's places when newer cities hold more than 200", async () => {
    const { t, save, stamp, rings } = await setup();
    const tokyo = spots("Tokyo", 100, 35, 139.7);
    const tokyoSaves: Id<"items">[] = [];
    for (let at = 0; at < tokyo.length; at += 10) {
      tokyoSaves.push(await save(["Tokyo"], tokyo.slice(at, at + 10)));
      vi.advanceTimersByTime(1_000);
    }
    const paris = spots("Paris", 150, 48, 2.35);
    for (let at = 0; at < paris.length; at += 10) {
      await save(["Paris"], paris.slice(at, at + 10));
      vi.advanceTimersByTime(1_000);
    }
    const york = spots("New York", 60, 40, -74);
    for (let at = 0; at < york.length; at += 10) {
      await save(["New York"], york.slice(at, at + 10));
      vi.advanceTimersByTime(1_000);
    }
    await stamp(tokyoSaves[0], tokyo[0]);
    await stamp(tokyoSaves[3], tokyo[35]);
    await stamp(tokyoSaves[9], tokyo[99]);

    const everywhere = await t.query(api.placeVisits.listUnstampedPlaces, {});
    expect(everywhere.filter((place) => place.city === "Tokyo")).toEqual([]);

    const left = await t.query(api.placeVisits.listUnstampedPlacesInCity, {
      city: "tokyo",
    });
    const ring = (await rings()).find((row) => row.city === "Tokyo");
    expect(ring).toEqual({ city: "Tokyo", stamped: 3, total: 100 });
    expect(left).toHaveLength(97);
    expect(left).toHaveLength((ring?.total ?? 0) - (ring?.stamped ?? 0));
    expect(new Set(left.map((place) => place.city))).toEqual(
      new Set(["Tokyo"]),
    );
    expect(left.map((place) => place.name)).not.toContain(tokyo[35].name);
    expect(left[0]).toMatchObject({
      itemId: tokyoSaves[9],
      name: tokyo[90].name,
      spot: { lat: tokyo[90].lat, lng: tokyo[90].lng },
      title: "Tokyo",
      cover: null,
    });
    expect(
      await t.query(api.placeVisits.listUnstampedPlacesInCity, { city: " " }),
    ).toEqual([]);
  });

  it("agrees with the ring after removals, a name-only mark and a repeat pin", async () => {
    const { t, userId, save, stamp, rings } = await setup();
    const both = await save(
      ["Lisbon", "Porto"],
      [
        { ...TIGRE, city: "Lisbon" },
        { ...MAJESTIC, city: "Porto" },
      ],
    );
    const nextDoor = { ...TIGRE, lat: TIGRE.lat + 0.0005 };
    const lisbon = await save(
      ["Lisbon"],
      [nextDoor, BLEND, MANTEIGARIA, CERVEJARIA],
    );
    await stamp(lisbon, BLEND);
    await t.run((ctx) =>
      ctx.db.insert("placeVisits", {
        userId,
        key: "cervejaria",
        name: "Cervejaria",
        itemId: both,
        visitedAt: Date.now(),
      }),
    );
    await t.mutation(api.placeRemovals.removePlace, {
      itemId: lisbon,
      ...MANTEIGARIA,
    });

    const ringFor = async (city: string) =>
      (await rings()).find((row) => row.city === city);
    for (const city of ["Lisbon", "Porto"]) {
      const ring = await ringFor(city);
      const left = await t.query(api.placeVisits.listUnstampedPlacesInCity, {
        city,
      });
      expect(left).toHaveLength((ring?.total ?? 0) - (ring?.stamped ?? 0));
    }
    expect(
      (
        await t.query(api.placeVisits.listUnstampedPlacesInCity, {
          city: "Lisbon",
        })
      ).map((place) => place.name),
    ).toEqual(["Tigre"]);
  });
});
