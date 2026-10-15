// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { internal } from "./_generated/api";
import type { TestConvexForDataModel } from "convex-test";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { EMBEDDING_DIMENSIONS } from "./model/embedding";
import { FIXTURE_ORIGIN } from "./model/fakeAi";
import { newConvexTest, signedInUser } from "./test.setup";

// The e2e backend's settings, in place before ai.ts and its model load. Unlike
// fakeAi.test.ts, nothing here hands the fake a prompt: processItem builds its
// own and sends it through the real generateObject, so a change to a prompt or
// a schema that the fake no longer recognizes fails here, not on the
// simulator.
vi.hoisted(() => {
  vi.stubEnv("E2E_FAKE_AI", "local-v1");
  vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "true");
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "ci-no-model");
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210");
});

// Embeddings are a separate provider the fake does not stand in for.
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
  // Every page read and model call is answered locally.
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
