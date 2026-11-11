// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import type { FunctionArgs, FunctionReference } from "convex/server";
import { describe, expect, expectTypeOf, it } from "vitest";

import { newConvexTest, signedInUser } from "./test.setup";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { rateLimiter } from "./model/rateLimiter";

const PARIS = { lat: 48.8566, lng: 2.3522 };
const NEXT_DOOR = { lat: 48.8576, lng: 2.3522 };
const LONDON = { lat: 51.5074, lng: -0.1278 };

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
    }),
  );
  const visits = () =>
    t.run(async (ctx) =>
      ctx.db
        .query("placeVisits")
        .withIndex("by_user_and_visited", (q) => q.eq("userId", userId))
        .collect(),
    );
  const mark = (
    name: string,
    visited: boolean,
    spot?: { lat: number; lng: number; appleId?: string },
  ) =>
    t.mutation(api.placeVisits.setVisited, {
      itemId,
      name,
      visited,
      ...(spot ? { spot } : {}),
    });
  return { backend, t, userId, itemId, visits, mark };
}

describe("setVisited", () => {
  it("still takes what installed apps send, and an optional spot", () => {
    expectTypeOf<{
      itemId: Id<"items">;
      name: string;
      visited: boolean;
    }>().toExtend<FunctionArgs<typeof api.placeVisits.setVisited>>();
    expectTypeOf(api.placeVisits.setVisited).toEqualTypeOf<
      FunctionReference<
        "mutation",
        "public",
        {
          itemId: Id<"items">;
          name: string;
          visited: boolean;
          spot?: { lat: number; lng: number; appleId?: string };
        },
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
    ).rejects.toMatchObject({ data: { code: "pro_required" } });
    expect(await visits()).toHaveLength(0);
  });

  it("lets someone whose Pro ended take a mark back, but not make one", async () => {
    const { t, userId, visits, mark } = await setup();
    await mark("Tigre", true, PARIS);
    await mark("Blend", true);
    await t.run(async (ctx) => {
      const subscription = await ctx.db
        .query("subscriptions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique();
      await ctx.db.delete(subscription!._id);
    });

    await mark("Tigre", false, PARIS);
    await mark("Blend", false);
    expect(await visits()).toEqual([]);
    await expect(mark("Tigre", true, PARIS)).rejects.toMatchObject({
      data: { code: "pro_required" },
    });
  });

  it("lets a person mark 25 places of one city in one sitting", async () => {
    const { visits, mark } = await setup();
    for (let index = 0; index < 25; index += 1) {
      await mark(`Place ${index}`, true, {
        lat: 30.26 + index / 1000,
        lng: -97.74,
      });
    }
    expect(await visits()).toHaveLength(25);
  });

  it("takes a mark back once the hour's marks are spent", async () => {
    const { t, userId, visits, mark } = await setup();
    await mark("Tigre", true, PARIS);
    await t.run((ctx) =>
      rateLimiter.limit(ctx, "placeVisit", { key: userId, count: 199 }),
    );

    await expect(mark("Blend", true, PARIS)).rejects.toMatchObject({
      data: { kind: "RateLimited", name: "placeVisit" },
    });
    await mark("Tigre", false, PARIS);
    expect(await visits()).toEqual([]);

    await t.run((ctx) =>
      rateLimiter.limit(ctx, "placeVisitClear", { key: userId, count: 199 }),
    );
    await expect(mark("Tigre", false, PARIS)).rejects.toMatchObject({
      data: { kind: "RateLimited", name: "placeVisitClear" },
    });
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

  it("records where a place was marked, once per spot, and a second city under its name", async () => {
    const { visits, mark } = await setup();

    await mark("Shake Shack", true, { ...PARIS, appleId: "P-1" });
    await mark("Shake Shack", true, { ...NEXT_DOOR, appleId: "P-1" });
    await mark("shake shack", true, { ...LONDON, appleId: " L-1 " });

    expect(await visits()).toMatchObject([
      {
        key: "shakeshack",
        name: "shake shack",
        spots: [
          { ...PARIS, appleId: "P-1" },
          { ...LONDON, appleId: "L-1" },
        ],
      },
    ]);
  });

  it("takes back one city's mark and keeps the other's", async () => {
    const { visits, mark } = await setup();
    await mark("Shake Shack", true, { ...PARIS, appleId: "P-1" });
    await mark("Shake Shack", true, { ...LONDON, appleId: "L-1" });

    await mark("Shake Shack", false, { ...PARIS, appleId: "P-1" });
    expect(await visits()).toMatchObject([
      { key: "shakeshack", spots: [{ ...LONDON, appleId: "L-1" }] },
    ]);

    await mark("Shake Shack", false, { ...LONDON, appleId: "L-1" });
    expect(await visits()).toEqual([]);
  });

  it("takes back a mark made without an Apple id from a few doors away", async () => {
    const { visits, mark } = await setup();
    await mark("Blend", true, PARIS);
    await mark("Blend", false, NEXT_DOOR);
    expect(await visits()).toEqual([]);
  });

  it("leaves another branch's mark when one branch is taken back", async () => {
    const { visits, mark } = await setup();
    await mark("Blue Bottle Coffee", true, { ...PARIS, appleId: "A" });
    await mark("Blue Bottle Coffee", true, { ...NEXT_DOOR, appleId: "B" });
    expect((await visits())[0]?.spots).toHaveLength(2);

    await mark("Blue Bottle Coffee", false, { ...NEXT_DOOR, appleId: "B" });
    expect(await visits()).toMatchObject([
      { spots: [{ ...PARIS, appleId: "A" }] },
    ]);
  });

  it("narrows a mark made by name alone to the spot it is marked again at", async () => {
    const { visits, mark } = await setup();
    await mark("Tigre", true);
    const [legacy] = await visits();
    expect(legacy).not.toHaveProperty("spots");

    await mark("Tigre", true, PARIS);
    const [refreshed] = await visits();
    expect(refreshed?.spots).toEqual([PARIS]);
    expect(refreshed?.visitedAt).toBeGreaterThanOrEqual(legacy!.visitedAt);

    await mark("Tigre", false, PARIS);
    expect(await visits()).toEqual([]);
  });

  it("reads where an installed app's mark was made from the save's pin", async () => {
    const { t, itemId, visits, mark } = await setup();
    await t.run((ctx) =>
      ctx.db.patch(itemId, {
        placePins: [{ name: "Shake Shack", ...PARIS, appleId: "P-1" }],
      }),
    );
    await mark("Shake Shack", true, LONDON);

    await mark("Shake Shack", true);
    expect((await visits())[0]?.spots).toEqual([
      LONDON,
      { ...PARIS, appleId: "P-1" },
    ]);

    await mark("Shake Shack", false);
    expect((await visits())[0]?.spots).toEqual([LONDON]);
  });

  it("lists a mark made by name alone at the places its save carries", async () => {
    const { t, userId, itemId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.patch(itemId, {
        placePins: [{ name: "Starbucks", ...PARIS }],
      });
      await ctx.db.insert("placeVisits", {
        userId,
        key: "starbucks",
        name: "Starbucks",
        itemId,
        visitedAt: 1,
      });
    });

    expect(await t.query(api.placeVisits.listVisits, {})).toEqual([
      { key: "starbucks", spots: [PARIS] },
    ]);
  });

  it("takes back a venue marked under another name, by its Apple id", async () => {
    const { visits, mark } = await setup();
    await mark("Franklin BBQ", true, { ...PARIS, appleId: "X" });
    await mark("Micho", true, { ...PARIS, appleId: "M" });

    await mark("Franklin Barbecue", false, { ...NEXT_DOOR, appleId: "X" });
    expect((await visits()).map((visit) => visit.key)).toEqual(["micho"]);
  });

  it("keeps marks made at places when an installed app takes back a name its save has no pin for", async () => {
    const { visits, mark } = await setup();
    await mark("Shake Shack", true, PARIS);
    await mark("Shake Shack", true, LONDON);
    await mark("Shake Shack", false);
    expect((await visits())[0]?.spots).toEqual([PARIS, LONDON]);

    await mark("Tigre", true);
    await mark("Tigre", false);
    expect((await visits()).map((visit) => visit.key)).toEqual(["shakeshack"]);
  });

  it("marks and takes back every pin of the name on an installed app's save", async () => {
    const { t, itemId, visits, mark } = await setup();
    await t.run((ctx) =>
      ctx.db.patch(itemId, {
        placePins: [
          { name: "Jo's Coffee", ...PARIS },
          { name: "Jo's Coffee", ...LONDON },
        ],
      }),
    );
    await mark("Jo's Coffee", true, { lat: 30.26, lng: -97.74 });

    await mark("Jo's Coffee", true);
    expect((await visits())[0]?.spots).toEqual([
      { lat: 30.26, lng: -97.74 },
      PARIS,
      LONDON,
    ]);

    await mark("Jo's Coffee", false);
    expect((await visits())[0]?.spots).toEqual([{ lat: 30.26, lng: -97.74 }]);
  });

  it("keeps one branch's mark when the branch next door is marked and taken back", async () => {
    const { visits, mark } = await setup();
    await mark("Blue Bottle", true, PARIS);
    await mark("Blue Bottle", true, { ...NEXT_DOOR, appleId: "B" });
    expect((await visits())[0]?.spots).toEqual([
      PARIS,
      { ...NEXT_DOOR, appleId: "B" },
    ]);

    await mark("Blue Bottle", false, { ...NEXT_DOOR, appleId: "B" });
    expect((await visits())[0]?.spots).toEqual([PARIS]);
  });

  it("marks and clears an unidentified branch without changing a nearby identified branch", async () => {
    const { visits, mark } = await setup();
    const identified = { ...PARIS, appleId: "A" };
    await mark("Tigre", true, identified);
    await mark("Tigre", true, NEXT_DOOR);
    expect((await visits())[0]?.spots).toEqual([identified, NEXT_DOOR]);

    await mark("Tigre", false, NEXT_DOOR);
    expect((await visits())[0]?.spots).toEqual([identified]);
  });

  it("preserves the location of a legacy mark when an older app marks a save without pins", async () => {
    const { t, userId, mark } = await setup();
    const spot = { ...PARIS, appleId: "A" };
    await t.run(async (ctx) => {
      const sourceId = await ctx.db.insert("items", {
        userId,
        type: "link",
        status: "ready",
        title: "Tigre",
        tags: [],
        searchText: "Tigre",
        placePins: [{ name: "Tigre", ...spot }],
      });
      await ctx.db.insert("placeVisits", {
        userId,
        key: "tigre",
        name: "Tigre",
        itemId: sourceId,
        visitedAt: 1,
      });
    });

    await mark("Tigre", true);
    await mark("Tigre", false);
    expect(await t.query(api.placeVisits.listVisits, {})).toEqual([
      { key: "tigre", spots: [spot] },
    ]);
  });

  it("narrows an ambiguous legacy visit when one of its pins is explicitly marked", async () => {
    const { t, userId, itemId, visits, mark } = await setup();
    const chosen = { ...PARIS, appleId: "A" };
    await t.run(async (ctx) => {
      await ctx.db.patch(itemId, {
        placePins: [
          { name: "Tigre", ...chosen },
          { name: "Tigre", ...LONDON },
        ],
      });
      await ctx.db.insert("placeVisits", {
        userId,
        key: "tigre",
        name: "Tigre",
        itemId,
        visitedAt: 1,
      });
    });
    await mark("Tigre", true, chosen);
    expect((await visits())[0]?.spots).toEqual([chosen]);
  });

  it("refuses an older app's first mark when it would record more than 20 spots", async () => {
    const { t, itemId, visits, mark } = await setup();
    await t.run((ctx) =>
      ctx.db.patch(itemId, {
        placePins: Array.from({ length: 21 }, (_, i) => ({
          name: "Tigre",
          lat: 20 + i * 0.1,
          lng: 0,
          appleId: String(i),
        })),
      }),
    );
    await expect(mark("Tigre", true)).rejects.toThrow(
      "Place has too many visited spots",
    );
    expect(await visits()).toEqual([]);
  });

  it("refuses a spot past the cap and keeps every earlier one", async () => {
    const { t, userId, itemId, visits, mark } = await setup();
    const spots = Array.from({ length: 20 }, (_, i) => ({
      lat: 10 + i,
      lng: 20,
    }));
    await t.run((ctx) =>
      ctx.db.insert("placeVisits", {
        userId,
        key: "starbucks",
        name: "Starbucks",
        itemId,
        visitedAt: 1,
        spots,
      }),
    );

    await expect(mark("Starbucks", true, LONDON)).rejects.toThrow(
      "Place has too many visited spots",
    );
    expect((await visits())[0]?.spots).toEqual(spots);
  });

  it("refuses a spot off the map", async () => {
    const { visits, mark } = await setup();
    await expect(mark("Tigre", true, { lat: 91, lng: 0 })).rejects.toThrow(
      "Place position is invalid",
    );
    await expect(
      mark("Tigre", true, { lat: 0, lng: Number.NaN }),
    ).rejects.toThrow("Place position is invalid");
    expect(await visits()).toEqual([]);
  });
});

describe("listVisits", () => {
  it("lists only the caller's marks, with where each was made", async () => {
    const { backend, t, mark } = await setup();
    await mark("Caffé Dante", true);
    await mark("Shake Shack", true, { ...PARIS, appleId: "P-1" });
    const other = await signedInUser(backend, { pro: true });

    expect(await t.query(api.placeVisits.listVisits, {})).toEqual([
      { key: "shakeshack", spots: [{ ...PARIS, appleId: "P-1" }] },
      { key: "caffedante" },
    ]);
    expect(await other.t.query(api.placeVisits.listVisits, {})).toEqual([]);
  });
});
