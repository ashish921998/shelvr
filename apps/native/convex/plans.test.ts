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
        intents: save.maps
          ? [{ kind: "open_maps", label: "Open in Maps", value: save.maps }]
          : undefined,
      });
      await ctx.db.insert("spaceItems", {
        userId,
        spaceId,
        itemId,
        status: save.status ?? "saved",
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
          area: "SoHo, NYC",
          why: "The vodka pasta",
          itemId: itemIds[0],
        },
        { name: "Bar Lola", why: "Wine bar vibe", itemId: itemIds[1] },
      ],
    });
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
