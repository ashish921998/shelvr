// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { beforeEach, describe, expect, it, vi } from "vitest";

import { newConvexTest, insertConsentingUser } from "./test.setup";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const embedMany = vi.hoisted(() => vi.fn());
const generateObject = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({
  embedMany,
  generateObject,
  wrapLanguageModel: vi.fn(() => ({})),
}));

let USER: string;

type SeedItem = {
  title: string;
  status?: "ready" | "failed" | "processing";
};

async function seed(items: SeedItem[]) {
  const t = newConvexTest();
  const ids = await t.run(async (ctx) => {
    USER = await insertConsentingUser(ctx);
    const spaceId = await ctx.db.insert("spaces", {
      userId: USER,
      name: "Pasta",
      description: "Recipes I want to cook",
      dynamic: true,
    });
    const itemIds: Record<string, Id<"items">> = {};
    for (const item of items) {
      itemIds[item.title] = await ctx.db.insert("items", {
        userId: USER,
        type: "link" as const,
        status: item.status ?? ("ready" as const),
        title: item.title,
        tags: [],
        searchText: item.title.toLowerCase(),
      });
    }
    return { spaceId, itemIds };
  });
  return { t, ...ids };
}

function promptedTitles(): string[] {
  const { prompt } = generateObject.mock.calls[0][0] as { prompt: string };
  return [...prompt.matchAll(/^\d+\. (.+)$/gm)].map((match) => match[1]);
}

async function suggestedTitles(t: Awaited<ReturnType<typeof seed>>["t"]) {
  return await t.run(async (ctx) => {
    const joins = await ctx.db.query("spaceItems").collect();
    const titles: string[] = [];
    for (const join of joins) {
      if (join.status !== "suggested") {
        continue;
      }
      const item = await ctx.db.get(join.itemId);
      titles.push(item?.title ?? "(missing)");
    }
    return titles.sort();
  });
}

beforeEach(() => {
  embedMany.mockReset();
  generateObject.mockReset();
  generateObject.mockResolvedValue({ object: { itemNumbers: [] } });
});

describe("recommendForSpace candidate selection", () => {
  it("never asks the embedding model", async () => {
    const { t, spaceId } = await seed([{ title: "Carbonara" }]);

    await t.action(internal.ai.recommendForSpace, { spaceId });

    expect(embedMany).not.toHaveBeenCalled();
    expect(generateObject).toHaveBeenCalledTimes(1);
  });

  it("offers the newest ready saves, newest first", async () => {
    const { t, spaceId } = await seed([
      { title: "Carbonara" },
      { title: "Pesto" },
      { title: "Kubernetes" },
    ]);

    await t.action(internal.ai.recommendForSpace, { spaceId });

    expect(promptedTitles()).toEqual(["Kubernetes", "Pesto", "Carbonara"]);
  });

  it("maps the model's numbers back onto the offered list", async () => {
    const { t, spaceId } = await seed([
      { title: "Carbonara" },
      { title: "Pesto" },
      { title: "Kubernetes" },
    ]);
    generateObject.mockResolvedValue({ object: { itemNumbers: [2] } });

    await t.action(internal.ai.recommendForSpace, { spaceId });

    expect(await suggestedTitles(t)).toEqual(["Pesto"]);
  });

  it("leaves items that are already in the space out of the candidates", async () => {
    const { t, spaceId, itemIds } = await seed([
      { title: "Carbonara" },
      { title: "Pesto" },
    ]);
    await t.run(async (ctx) => {
      await ctx.db.insert("spaceItems", {
        userId: USER,
        spaceId,
        itemId: itemIds.Carbonara,
        status: "saved" as const,
      });
    });

    await t.action(internal.ai.recommendForSpace, { spaceId });

    expect(promptedTitles()).toEqual(["Pesto"]);
  });

  it("leaves out saves that are not ready", async () => {
    const { t, spaceId } = await seed([
      { title: "Carbonara", status: "failed" },
      { title: "Risotto", status: "processing" },
      { title: "Pesto" },
    ]);

    await t.action(internal.ai.recommendForSpace, { spaceId });

    expect(promptedTitles()).toEqual(["Pesto"]);
  });

  it("suggests nothing when every save is already filed", async () => {
    const { t, spaceId, itemIds } = await seed([{ title: "Carbonara" }]);
    await t.run(async (ctx) => {
      await ctx.db.insert("spaceItems", {
        userId: USER,
        spaceId,
        itemId: itemIds.Carbonara,
        status: "dismissed" as const,
      });
    });

    await t.action(internal.ai.recommendForSpace, { spaceId });

    expect(generateObject).not.toHaveBeenCalled();
    expect(await suggestedTitles(t)).toEqual([]);
  });

  it("offers at most the 100 newest saves", async () => {
    const shelf = Array.from({ length: 101 }, (_, index) => ({
      title: `Save ${index}`,
    }));
    const { t, spaceId } = await seed(shelf);

    await t.action(internal.ai.recommendForSpace, { spaceId });

    const prompted = promptedTitles();
    expect(prompted).toHaveLength(100);
    expect(prompted[0]).toBe("Save 100");
    expect(prompted[99]).toBe("Save 1");
    expect(prompted).not.toContain("Save 0");
  });

  it("never reaches across accounts", async () => {
    const { t, spaceId } = await seed([{ title: "Carbonara" }]);
    await t.run(async (ctx) => {
      await ctx.db.insert("items", {
        userId: "someone-else",
        type: "link" as const,
        status: "ready" as const,
        title: "Somebody else's carbonara",
        tags: [],
        searchText: "somebody",
      });
    });

    await t.action(internal.ai.recommendForSpace, { spaceId });

    expect(promptedTitles()).toEqual(["Carbonara"]);
  });
});
