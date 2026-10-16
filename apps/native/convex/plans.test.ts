// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { beforeEach, describe, expect, it, vi } from "vitest";

import { newConvexTest } from "./test.setup";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const generateObject = vi.hoisted(() => vi.fn());

// Only the provider call is replaced. `ai.ts` builds its language model at
// import, so wrapLanguageModel is stubbed as well.
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
  /** Classified cities; absent = never classified for cities. */
  cities?: string[];
};

async function setup(
  saves: Save[],
  options: { pro?: boolean; consent?: "declined" } = {},
) {
  const base = newConvexTest();
  const seeded = await base.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {});
    if (options.pro !== false) {
      await ctx.db.insert("subscriptions", {
        userId,
        status: "pro",
        expiresAt: Date.now() + 60_000,
        updatedAt: Date.now(),
      });
    }
    if (options.consent) {
      await ctx.db.insert("aiConsents", {
        userId,
        status: options.consent,
        version: 1,
        updatedAt: Date.now(),
      });
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
        intents: save.maps
          ? [{ kind: "open_maps", label: "Open in Maps", value: save.maps }]
          : undefined,
      });
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

function promptOf(call = 0): string {
  return (generateObject.mock.calls[call][0] as { prompt: string }).prompt;
}

beforeEach(() => {
  generateObject.mockReset();
});

describe("makePlan", () => {
  it("returns the model's places that a save actually names", async () => {
    const { t, spaceId, itemIds } = await setup([
      { title: "Best vodka pasta in SoHo", content: "Go to Balthazar tonight" },
      { title: "Cutest wine bar", content: "@barlola_nyc is a vibe" },
      { title: "Pasta night", content: "no place named here" },
    ]);
    // The prompt numbers saves newest filed first: pasta night is 1.
    generateObject.mockResolvedValue({
      object: {
        places: [
          {
            saveNumber: 3,
            name: "Balthazar",
            area: "SoHo, NYC",
            why: "The vodka pasta",
          },
          // Invented: pasta night names no place.
          { saveNumber: 1, name: "Carbone", area: "", why: "Famous pasta" },
          { saveNumber: 2, name: "Bar Lola", area: "", why: "Wine bar vibe" },
          // Repeat and out-of-range picks are dropped.
          { saveNumber: 3, name: "balthazar", area: "", why: "Again" },
          { saveNumber: 9, name: "Nowhere", area: "", why: "Nope" },
        ],
      },
    });

    const plan = await t.action(api.plans.makePlan, { spaceId });

    expect(plan).toEqual({
      considered: 3,
      places: [
        {
          name: "Balthazar",
          area: "SoHo",
          why: "The vodka pasta",
          itemId: itemIds[0],
        },
        { name: "Bar Lola", why: "Wine bar vibe", itemId: itemIds[1] },
      ],
    });
  });

  it("ranks a place the user marked We went last, tagged been", async () => {
    const { t, spaceId, itemIds } = await setup([
      { title: "Tigre is the moodiest bar in town" },
      { title: "Sweet Linda for natural wine" },
      { title: "Third save" },
    ]);
    await t.mutation(api.placeVisits.setVisited, {
      itemId: itemIds[0],
      name: "Tigre",
      visited: true,
    });
    // Newest filed first: Sweet Linda is save 2, Tigre save 3.
    generateObject.mockResolvedValue({
      object: {
        places: [
          { saveNumber: 3, name: "TIGRE", area: "", why: "Moody" },
          { saveNumber: 2, name: "Sweet Linda", area: "", why: "Wine" },
        ],
      },
    });

    const plan = await t.action(api.plans.makePlan, { spaceId });

    expect(promptOf()).toContain(
      "They have already been to the places inside <visited>Tigre</visited>.",
    );
    expect(plan.places).toEqual([
      { name: "Sweet Linda", why: "Wine", itemId: itemIds[1] },
      { name: "TIGRE", why: "Moody", itemId: itemIds[0], been: true },
    ]);
  });

  it("asks for reasons in the app's language", async () => {
    const { t, spaceId } = await setup([{ title: "Reel" }]);
    generateObject.mockResolvedValue({ object: { places: [] } });

    await t.action(api.plans.makePlan, { spaceId, locale: "ja" });
    await t.action(api.plans.makePlan, { spaceId, locale: "xx" });

    expect(promptOf(0)).toContain('Write each "why" in Japanese');
    expect(promptOf(1)).toContain('Write each "why" in English');
  });

  it("reads only saved, ready items, with their map places", async () => {
    const { t, spaceId } = await setup([
      { title: "Filed reel", maps: "Par Ici Café, Chicago" },
      { title: "Suggested reel", status: "suggested" },
      { title: "Dismissed reel", status: "dismissed" },
      { title: "Still reading", itemStatus: "processing" },
    ]);
    generateObject.mockResolvedValue({ object: { places: [] } });

    const plan = await t.action(api.plans.makePlan, { spaceId });

    expect(plan).toEqual({ places: [], considered: 1 });
    const prompt = promptOf();
    expect(prompt).toContain("Filed reel");
    expect(prompt).toContain("Places: Par Ici Café, Chicago");
    expect(prompt).not.toContain("Suggested reel");
    expect(prompt).not.toContain("Dismissed reel");
    expect(prompt).not.toContain("Still reading");
  });

  it("reads only the saves filed in the chosen city", async () => {
    const { t, spaceId } = await setup([
      { title: "Bastian reel", cities: ["Mumbai"] },
      { title: "Thalassa reel", cities: ["Goa"] },
      { title: "Two-city reel", cities: ["Goa", "mumbai"] },
      { title: "No city reel", cities: [] },
      { title: "Never classified reel" },
    ]);
    generateObject.mockResolvedValue({ object: { places: [] } });

    const plan = await t.action(api.plans.makePlan, {
      spaceId,
      city: "Mumbai",
    });

    expect(plan).toEqual({ places: [], considered: 2 });
    const prompt = promptOf();
    expect(prompt).toContain("Bastian reel");
    expect(prompt).toContain("Two-city reel");
    expect(prompt).not.toContain("Thalassa reel");
    expect(prompt).not.toContain("No city reel");
    expect(prompt).not.toContain("Never classified reel");
    expect(prompt).toContain("They are going out in Mumbai.");
  });

  it("spends no token on a city with no saves", async () => {
    const { t, spaceId } = await setup([{ title: "Reel", cities: ["Goa"] }]);

    const plan = await t.action(api.plans.makePlan, { spaceId, city: "Oslo" });

    expect(plan).toEqual({ places: [], considered: 0 });
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("reads a place steered for this space", async () => {
    const { t, spaceId } = await setup([
      { title: "Date idea", spaceMaps: "Tigre, Brooklyn" },
    ]);
    generateObject.mockResolvedValue({ object: { places: [] } });

    await t.action(api.plans.makePlan, { spaceId });

    expect(promptOf()).toContain("Places: Tigre, Brooklyn");
  });

  it("reads a note's own text", async () => {
    const { t, spaceId, itemIds } = await setup([
      { title: "Anniversary ideas", note: "Book Le Coucou for Friday" },
    ]);
    generateObject.mockResolvedValue({
      object: {
        places: [
          { saveNumber: 1, name: "Le Coucou", area: "", why: "Our pick" },
        ],
      },
    });

    const plan = await t.action(api.plans.makePlan, { spaceId });

    expect(promptOf()).toContain("Book Le Coucou for Friday");
    expect(plan.places).toEqual([
      { name: "Le Coucou", why: "Our pick", itemId: itemIds[0] },
    ]);
  });

  it("skips the model for a space with nothing saved", async () => {
    const { t, spaceId } = await setup([
      { title: "Only a suggestion", status: "suggested" },
    ]);

    expect(await t.action(api.plans.makePlan, { spaceId })).toEqual({
      places: [],
      considered: 0,
    });
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("requires Pro", async () => {
    const { t, spaceId } = await setup([{ title: "Reel" }], { pro: false });

    await expect(
      t.action(api.plans.makePlan, { spaceId }),
    ).rejects.toMatchObject({ data: { code: "pro_required" } });
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("sends nothing after the user declined AI processing", async () => {
    const { t, spaceId } = await setup([{ title: "Reel" }], {
      consent: "declined",
    });

    await expect(
      t.action(api.plans.makePlan, { spaceId }),
    ).rejects.toMatchObject({ data: { code: "ai_consent_required" } });
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("refuses a space the caller does not own", async () => {
    const { base, spaceId } = await setup([{ title: "Reel" }]);
    const strangerId = await base.run((ctx) => ctx.db.insert("users", {}));
    const stranger = base.withIdentity({
      subject: `${strangerId}|session-1`,
    });

    await expect(
      stranger.action(api.plans.makePlan, { spaceId }),
    ).rejects.toThrow("Space not found");
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("reports a model failure as plan_failed", async () => {
    const { t, spaceId } = await setup([{ title: "Reel" }]);
    generateObject.mockRejectedValue(new Error("provider down"));

    await expect(
      t.action(api.plans.makePlan, { spaceId }),
    ).rejects.toMatchObject({ data: { code: "plan_failed" } });
  });

  it("is rate limited", async () => {
    const { t, spaceId } = await setup([{ title: "Reel" }]);
    generateObject.mockResolvedValue({ object: { places: [] } });

    for (let i = 0; i < 8; i++) {
      await t.action(api.plans.makePlan, { spaceId });
    }
    await expect(t.action(api.plans.makePlan, { spaceId })).rejects.toThrow();
    expect(generateObject).toHaveBeenCalledTimes(8);
  });
});

describe("classifyCities", () => {
  async function citiesOf(base: ReturnType<typeof newConvexTest>) {
    return base.run(async (ctx) =>
      (await ctx.db.query("items").collect()).map(
        (item) => item.cities ?? null,
      ),
    );
  }

  it("fills in cities for saves that were never classified for them", async () => {
    const { base, t, spaceId } = await setup([
      { title: "Bastian reel", content: "Bastian in Bandra, Mumbai" },
      { title: "Already read", cities: ["Goa"] },
      { title: "Classified, no city", cities: [] },
      { title: "Still reading", itemStatus: "processing" },
      { title: "Suggested reel", status: "suggested" },
    ]);
    generateObject.mockResolvedValue({
      object: { cities: ["Mumbai", " mumbai ", "unknown"] },
    });

    const written = await t.action(api.plans.classifyCities, { spaceId });

    expect(written).toBe(1);
    expect(generateObject).toHaveBeenCalledTimes(1);
    expect(promptOf()).toContain("Bastian in Bandra, Mumbai");
    expect(promptOf()).not.toContain("Already read");
    expect(await citiesOf(base)).toEqual([["Mumbai"], ["Goa"], [], null, null]);
  });

  it("keeps going when one save's call fails", async () => {
    const { base, t, spaceId } = await setup([
      { title: "First" },
      { title: "Second" },
    ]);
    generateObject
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({ object: { cities: ["Goa"] } });

    expect(await t.action(api.plans.classifyCities, { spaceId })).toBe(1);
    // Newest filed first: Second is read first and fails.
    expect(await citiesOf(base)).toEqual([["Goa"], null]);
  });

  it("sends nothing after the user declined AI processing", async () => {
    const { t, spaceId } = await setup([{ title: "Reel" }], {
      consent: "declined",
    });

    await expect(
      t.action(api.plans.classifyCities, { spaceId }),
    ).rejects.toThrow();
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("requires Pro", async () => {
    const { t, spaceId } = await setup([{ title: "Reel" }], { pro: false });

    await expect(
      t.action(api.plans.classifyCities, { spaceId }),
    ).rejects.toThrow();
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("reads at most ten saves a pass and is rate limited per save", async () => {
    const { t, spaceId } = await setup(
      Array.from({ length: 12 }, (_, i) => ({ title: `Reel ${i}` })),
    );
    generateObject.mockResolvedValue({ object: { cities: [] } });

    expect(await t.action(api.plans.classifyCities, { spaceId })).toBe(10);
    expect(await t.action(api.plans.classifyCities, { spaceId })).toBe(2);
    expect(generateObject).toHaveBeenCalledTimes(12);
  });

  it("stops at the user's hourly budget without spending a call", async () => {
    const { t, spaceId } = await setup(
      Array.from({ length: 40 }, (_, i) => ({ title: `Reel ${i}` })),
    );
    generateObject.mockResolvedValue({ object: { cities: [] } });

    for (let i = 0; i < 3; i++) {
      expect(await t.action(api.plans.classifyCities, { spaceId })).toBe(10);
    }
    // 30 tokens spent: the fourth pass claims nothing.
    expect(await t.action(api.plans.classifyCities, { spaceId })).toBe(0);
    expect(generateObject).toHaveBeenCalledTimes(30);
  });

  it("does not overwrite cities classified while the call was out", async () => {
    const { base, t, spaceId, itemIds } = await setup([{ title: "Reel" }]);
    generateObject.mockImplementation(async () => {
      await base.run(async (ctx) => {
        await ctx.db.patch(itemIds[0], { cities: ["Goa"] });
      });
      return { object: { cities: ["Mumbai"] } };
    });

    expect(await t.action(api.plans.classifyCities, { spaceId })).toBe(0);
    expect(await citiesOf(base)).toEqual([["Goa"]]);
  });
});
