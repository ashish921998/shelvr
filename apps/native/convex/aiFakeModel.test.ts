// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { TestConvexForDataModel } from "convex-test";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { EMBEDDING_DIMENSIONS } from "./model/embedding";
import { FIXTURE_ORIGIN } from "./model/fakeAi";
import { newConvexTest, signedInUser } from "./test.setup";

vi.hoisted(() => {
  vi.stubEnv("E2E_FAKE_AI", "local-v1");
  vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "true");
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "ci-no-model");
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210");
});

const embedMany = vi.hoisted(() => vi.fn());
vi.mock("ai", async (original) => ({
  ...(await original<typeof import("ai")>()),
  embedMany,
}));

type T = TestConvexForDataModel<DataModel>;

beforeEach(() => {
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", "");
  embedMany.mockReset();
  embedMany.mockImplementation(async ({ values }: { values: string[] }) => ({
    embeddings: values.map(() =>
      Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === 0 ? 1 : 0)),
    ),
  }));
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected network request");
    }),
  );
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function processed(
  fields: Partial<Doc<"items">> & Pick<Doc<"items">, "type">,
  setup: (t: T, userId: Id<"users">) => Promise<unknown> = async () => {},
) {
  const { t, userId } = await signedInUser(newConvexTest());
  await setup(t, userId);
  const itemId = await t.run((ctx) =>
    ctx.db.insert("items", {
      userId,
      status: "processing",
      processingRunId: "run-1",
      processingStartedAt: Date.now(),
      tags: [],
      searchText: "",
      ...fields,
    }),
  );
  await t.action(internal.ai.processItem, { itemId, runId: "run-1" });
  return await t.run((ctx) => ctx.db.get(itemId));
}

describe("the e2e fake model behind processItem", () => {
  it("classifies a note from the real note prompt", async () => {
    const item = await processed({
      type: "note",
      note: "Pack the tent poles before Friday.\n\nAnd the stove.",
    });
    expect(item).toMatchObject({
      status: "ready",
      title: "Pack the tent poles before Friday",
      description: "Pack the tent poles before Friday.",
      tags: ["pack", "tent", "poles", "before", "friday", "stove"],
    });
  });

  it("still finds the note when the prompt lists spaces and a user title", async () => {
    const item = await processed(
      {
        type: "note",
        note: "Soak the chickpeas overnight.",
        title: "Hummus",
        titleSource: "user",
      },
      (t, userId) =>
        t.run((ctx) =>
          ctx.db.insert("spaces", {
            userId,
            name: "Recipes",
            description: "Food to cook",
            dynamic: true,
          }),
        ),
    );
    expect(item).toMatchObject({
      status: "ready",
      title: "Hummus",
      description: "Soak the chickpeas overnight.",
    });
  });

  it("classifies a fixture page from the real link prompt", async () => {
    const item = await processed({
      type: "link",
      url: `${FIXTURE_ORIGIN}/quince-paste`,
    });
    expect(item).toMatchObject({
      status: "ready",
      title: "Quince paste for beginners",
      description: "How to cook membrillo slowly until it sets.",
    });
    expect(item?.tags).toContain("membrillo");
  });
});

describe("the e2e fake model from a saved page to a date plan", () => {
  it("files the Lisbon fixture under Lisbon and plans its places", async () => {
    const { t, userId } = await signedInUser(newConvexTest(), { pro: true });
    const itemId = await t.run((ctx) =>
      ctx.db.insert("items", {
        userId,
        type: "link",
        url: `${FIXTURE_ORIGIN}/lisbon-date-night`,
        status: "processing",
        processingRunId: "run-1",
        processingStartedAt: Date.now(),
        tags: [],
        searchText: "",
      }),
    );
    await t.action(internal.ai.processItem, { itemId, runId: "run-1" });
    expect(await t.run((ctx) => ctx.db.get(itemId))).toMatchObject({
      status: "ready",
      title: "Date night in Lisbon",
      cities: ["Lisbon"],
    });
    const scheduled = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(scheduled.map((job) => job.name)).toContain("placePins:locateItem");

    const spaceId = await t.mutation(api.spaces.ensureCitySpace, {
      city: "Lisbon",
    });
    const plan = await t.action(api.plans.makePlan, { spaceId });
    expect(plan.places.map((place) => place.name)).toEqual([
      "Taberna da Rua das Flores",
      "Miradouro da Graça",
      "Manteigaria",
    ]);
  });
});

describe("the e2e fake model behind recommendForSpace", () => {
  it("suggests the saves that share a word with the new space's name", async () => {
    embedMany.mockRejectedValue(new Error("no embedding provider"));
    const { t, userId } = await signedInUser(newConvexTest());
    const spaceId = await t.run(async (ctx) => {
      for (const title of ["Weeknight Miso Ramen", "Belém Tower"]) {
        await ctx.db.insert("items", {
          userId,
          type: "link",
          status: "ready",
          title,
          tags: [],
          searchText: title.toLowerCase(),
        });
      }
      return await ctx.db.insert("spaces", {
        userId,
        name: "Ramen 1760",
        dynamic: true,
      });
    });
    await t.action(internal.aiRecommendForSpace.recommendForSpace, {
      spaceId,
    });
    const suggested = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("spaceItems")
        .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
        .collect();
      return await Promise.all(
        rows.map(async (row) => ({
          status: row.status,
          title: (await ctx.db.get(row.itemId))?.title,
        })),
      );
    });
    expect(suggested).toEqual([
      { status: "suggested", title: "Weeknight Miso Ramen" },
    ]);
  });
});
