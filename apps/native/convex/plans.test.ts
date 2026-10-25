// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  newConvexTest,
  insertConsentingUser,
  setTestConsent,
} from "./test.setup";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const generateObject = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({
  embedMany: vi.fn(),
  generateObject,
  wrapLanguageModel: vi.fn(() => ({})),
}));

type Save = {
  title: string;
  content?: string;
  note?: string;
  status?: "saved" | "suggested" | "dismissed";
  itemStatus?: "ready" | "processing";
  maps?: string;
  spaceMaps?: string;
  cities?: string[];
  places?: string[];
  /** False leaves the save out of the space. */
  member?: boolean;
};

async function setup(
  saves: Save[],
  options: { pro?: boolean; consent?: "declined" } = {},
) {
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
    if (options.consent) {
      await setTestConsent(ctx, userId, options.consent);
    }
    const spaceId = await ctx.db.insert("spaces", {
      userId,
      name: "Date night",
      dynamic: false,
    });
    const itemIds: Id<"items">[] = [];
    for (const save of saves) {
      const itemId = await ctx.db.insert("items", {
        userId,
        type: "link",
        status: save.itemStatus ?? "ready",
        title: save.title,
        content: save.content,
        note: save.note,
        url: "https://www.tiktok.com/@someone/video/1",
        tags: [],
        searchText: save.title,
        cities: save.cities,
        places: save.places,
        intents: save.maps
          ? [{ kind: "open_maps", label: "Open in Maps", value: save.maps }]
          : undefined,
      });
      if (save.member === false) {
        itemIds.push(itemId);
        continue;
      }
      await ctx.db.insert("spaceItems", {
        userId,
        spaceId,
        itemId,
        status: save.status ?? "saved",
        intents: save.spaceMaps
          ? [
              {
                kind: "open_maps",
                label: "Open in Maps",
                value: save.spaceMaps,
              },
            ]
          : undefined,
      });
      itemIds.push(itemId);
    }
    return { userId, spaceId, itemIds };
  });
  const t = base.withIdentity({ subject: `${seeded.userId}|session-1` });
  return { base, t, ...seeded };
}

beforeEach(() => {
  generateObject
    .mockReset()
    .mockRejectedValue(new Error("Planning must not call AI"));
});

describe("makePlan", () => {
  it("suggests only stored places from the selected city's ready saves", async () => {
    const { t, spaceId, itemIds } = await setup([
      {
        title: "Lisbon tasca",
        places: ["Taberna"],
        cities: ["Lisbon"],
        member: false,
      },
      { title: "Paris bistro", places: ["Micho"], cities: ["Paris"] },
      {
        title: "Graça rooftop",
        maps: "Graça Rooftop, Lisbon",
        cities: ["lisbon"],
        status: "dismissed",
      },
      {
        title: "Still processing",
        places: ["Not ready"],
        cities: ["Lisbon"],
        itemStatus: "processing",
      },
    ]);
    const result = await t.action(api.plans.makePlan, {
      spaceId,
      city: "Lisbon",
    });
    expect(result.considered).toBe(2);
    expect(result.places.map((place) => place.name).sort()).toEqual([
      "Graça Rooftop",
      "Taberna",
    ]);
    expect(result.places.map((place) => place.itemId).sort()).toEqual(
      [itemIds[0], itemIds[2]].sort(),
    );
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("does not guess places from unstructured text", async () => {
    const { t, spaceId } = await setup([
      { title: "Book Le Coucou", content: "Restaurant ideas" },
    ]);
    expect(await t.action(api.plans.makePlan, { spaceId })).toEqual({
      places: [],
      considered: 1,
    });
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("deduplicates stored places and caps the shortlist at five", async () => {
    const { t, spaceId } = await setup([
      {
        title: "List",
        places: Array.from({ length: 10 }, (_, i) => `Place${i}`),
      },
      { title: "Another save", places: ["PLACE0"] },
    ]);
    const result = await t.action(api.plans.makePlan, { spaceId });
    expect(result.places).toHaveLength(5);
    expect(
      new Set(result.places.map((place) => place.name.toLowerCase())).size,
    ).toBe(5);
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("excludes visited places even if all places have been visited", async () => {
    const { t, spaceId, itemIds } = await setup([
      { title: "Tigre", places: ["Tigre, Lisbon"] },
    ]);
    await t.mutation(api.placeVisits.setVisited, {
      itemId: itemIds[0],
      name: "Tigre",
      visited: true,
    });
    expect(await t.action(api.plans.makePlan, { spaceId })).toEqual({
      places: [],
      considered: 1,
    });
    await t.mutation(api.placeVisits.setVisited, {
      itemId: itemIds[0],
      name: "Tigre",
      visited: false,
    });
    expect(
      (await t.action(api.plans.makePlan, { spaceId })).places[0].name,
    ).toBe("Tigre");
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("recognizes a visit recorded with a city-qualified name even if another save has the bare name", async () => {
    const { t, spaceId, itemIds } = await setup([
      { title: "Places", places: ["Taberna", "Taberna, Lisbon"] },
    ]);
    await t.mutation(api.placeVisits.setVisited, {
      itemId: itemIds[0],
      name: "Taberna, Lisbon",
      visited: true,
    });
    expect((await t.action(api.plans.makePlan, { spaceId })).places).toEqual(
      [],
    );
  });

  it("checks visits beyond the last 100 marks", async () => {
    const { t, spaceId, userId, itemIds } = await setup([
      { title: "Tigre", places: ["Tigre"] },
    ]);
    await t.mutation(api.placeVisits.setVisited, {
      itemId: itemIds[0],
      name: "Tigre",
      visited: true,
    });
    await t.run(async (ctx) => {
      for (let i = 0; i < 101; i++)
        await ctx.db.insert("placeVisits", {
          userId,
          itemId: itemIds[0],
          key: `other${i}`,
          name: `Other${i}`,
          visitedAt: Date.now() + i + 1000,
        });
    });
    expect((await t.action(api.plans.makePlan, { spaceId })).places).toEqual(
      [],
    );
  });

  it("keeps only explicitly city-labelled places from a multi-city save", async () => {
    const { t, spaceId } = await setup([
      {
        title: "Two cities",
        cities: ["Paris", "Lisbon"],
        places: ["Micho, Paris", "Taberna, Lisbon", "Unassigned Cafe"],
      },
    ]);
    expect(
      (
        await t.action(api.plans.makePlan, { spaceId, city: "Lisbon" })
      ).places.map((p) => p.name),
    ).toEqual(["Taberna"]);
  });

  it("uses a saved map label filed for the space", async () => {
    const { t, spaceId } = await setup([
      { title: "Date idea", spaceMaps: "Tigre, Brooklyn" },
    ]);
    expect(
      (await t.action(api.plans.makePlan, { spaceId })).places[0],
    ).toMatchObject({ name: "Tigre", area: "Brooklyn", why: "Date idea" });
  });

  it("works with AI disabled because planning sends nothing to a model", async () => {
    const { t, spaceId } = await setup(
      [{ title: "Tigre", places: ["Tigre"] }],
      { consent: "declined" },
    );
    expect(
      (await t.action(api.plans.makePlan, { spaceId })).places,
    ).toHaveLength(1);
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("requires Pro", async () => {
    const { t, spaceId } = await setup([{ title: "Reel", places: ["Tigre"] }], {
      pro: false,
    });
    await expect(
      t.action(api.plans.makePlan, { spaceId }),
    ).rejects.toMatchObject({ data: { code: "pro_required" } });
  });

  it("refuses another account's space", async () => {
    const { base, spaceId } = await setup([
      { title: "Tigre", places: ["Tigre"] },
    ]);
    const stranger = await base.run((ctx) => insertConsentingUser(ctx));
    await expect(
      base
        .withIdentity({ subject: `${stranger}|session-1` })
        .action(api.plans.makePlan, { spaceId }),
    ).rejects.toThrow("Space not found");
  });

  it("remains rate limited", async () => {
    const { t, spaceId } = await setup([{ title: "Reel", places: ["Tigre"] }]);
    for (let i = 0; i < 8; i++) await t.action(api.plans.makePlan, { spaceId });
    await expect(t.action(api.plans.makePlan, { spaceId })).rejects.toThrow();
    expect(generateObject).not.toHaveBeenCalled();
  });
});
