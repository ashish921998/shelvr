// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { badgeTotals, earnedBadges } from "./model/badges";
import { newConvexTest, signedInUser } from "./test.setup";

type Pin = {
  name: string;
  lat: number;
  lng: number;
  city?: string;
  category?: string;
  appleId?: string;
};

const CAFE: Pin = {
  name: "Copenhagen Coffee Lab",
  lat: 38.71,
  lng: -9.14,
  category: "Cafe",
};
const TASCA: Pin = {
  name: "Tasca",
  lat: 38.72,
  lng: -9.15,
  category: "Restaurant",
};
const VIEWPOINT: Pin = { name: "Miradouro", lat: 38.713, lng: -9.133 };
const BAR: Pin = {
  name: "Park",
  lat: 38.71,
  lng: -9.145,
  category: "Nightlife",
  appleId: "I-park",
};

async function setup() {
  const backend = newConvexTest();
  const { t, userId } = await signedInUser(backend, { pro: true });
  const save = (placePins: Pin[], tags: string[] = []) =>
    t.run((ctx) =>
      ctx.db.insert("items", {
        userId,
        type: "link",
        status: "ready",
        title: "Lisbon",
        tags,
        searchText: "",
        cities: ["Lisbon"],
        placePins,
      }),
    );
  const stamp = (itemId: Id<"items">, pin: Pin, visited = true) =>
    t.mutation(api.placeVisits.setVisited, {
      itemId,
      name: pin.name,
      visited,
      spot: {
        lat: pin.lat,
        lng: pin.lng,
        ...(pin.appleId ? { appleId: pin.appleId } : {}),
      },
    });
  const list = () => t.query(api.placeVisits.listBadgeStamps, {});
  return { t, save, stamp, list };
}

describe("listBadgeStamps", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refuses a signed-out caller", async () => {
    const backend = newConvexTest();
    await expect(
      backend.query(api.placeVisits.listBadgeStamps, {}),
    ).rejects.toThrow("Not authenticated");
  });

  it("is empty before the first stamp", async () => {
    const { list } = await setup();
    expect(await list()).toEqual([]);
  });

  it("gives each stamp the kinds of its own save's pin", async () => {
    const { save, stamp, list } = await setup();
    const itemId = await save([CAFE, TASCA, BAR]);
    await stamp(itemId, CAFE);
    vi.advanceTimersByTime(60_000);
    await stamp(itemId, TASCA);
    vi.advanceTimersByTime(60_000);
    await stamp(itemId, BAR);
    const rows = await list();
    expect(rows.map((row) => row.kinds).sort()).toEqual([
      ["coffee"],
      ["drinks"],
      ["food"],
    ]);
    expect(rows.every((row) => row.city === "Lisbon")).toBe(true);
  });

  it("falls back to the save's tags for a pin with no category", async () => {
    const { save, stamp, list } = await setup();
    const itemId = await save([VIEWPOINT], ["sightseeing"]);
    await stamp(itemId, VIEWPOINT);
    expect(await list()).toEqual([{ city: "Lisbon", kinds: ["activities"] }]);
  });

  it("leaves a place with no kind to the count badges", async () => {
    const { save, stamp, list } = await setup();
    const itemId = await save([VIEWPOINT]);
    await stamp(itemId, VIEWPOINT);
    const rows = await list();
    expect(rows).toEqual([{ city: "Lisbon", kinds: [] }]);
    expect(earnedBadges(badgeTotals(rows, []))).toEqual(["firstStamp"]);
  });

  it("drops a stamp's kinds when the stamp comes off", async () => {
    const { save, stamp, list } = await setup();
    const itemId = await save([CAFE, TASCA]);
    await stamp(itemId, CAFE);
    vi.advanceTimersByTime(60_000);
    await stamp(itemId, TASCA);
    vi.advanceTimersByTime(60_000);
    await stamp(itemId, CAFE, false);
    expect(await list()).toEqual([{ city: "Lisbon", kinds: ["food"] }]);
  });

  it("keeps a stamp whose save was deleted, with no kind", async () => {
    const { t, save, stamp, list } = await setup();
    const itemId = await save([CAFE]);
    await stamp(itemId, CAFE);
    await t.run((ctx) => ctx.db.delete(itemId));
    const rows = await list();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kinds).toEqual([]);
  });

  it("matches the passport's stamps one for one", async () => {
    const { t, save, stamp, list } = await setup();
    const itemId = await save([CAFE, TASCA, VIEWPOINT]);
    for (const pin of [CAFE, TASCA, VIEWPOINT]) {
      await stamp(itemId, pin);
      vi.advanceTimersByTime(60_000);
    }
    const passport = await t.query(api.placeVisits.getPassport, {});
    expect((await list()).length).toBe(passport.length);
  });
});
