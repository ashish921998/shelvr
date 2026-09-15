// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { newConvexTest } from "./test.setup";

const generateObject = vi.hoisted(() => vi.fn());
vi.mock("ai", async (original) => ({
  ...(await original<typeof import("ai")>()),
  generateObject,
}));

const OLD_CLASSIFICATION = {
  title: "Travel Plans",
  description: "Plans for a trip",
  tags: ["travel"],
  spaceNames: [],
  intents: [],
};
const NEW_CLASSIFICATION = {
  title: "Grocery List",
  description: "Groceries to buy",
  tags: ["groceries"],
  spaceNames: [],
  intents: [],
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", "");
  generateObject.mockReset();
  generateObject.mockResolvedValue({ object: NEW_CLASSIFICATION });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function setup(status: "ready" | "processing") {
  const t = newConvexTest();
  const itemId = await t.run(async (ctx) => {
    await ctx.db.insert("subscriptions", {
      userId: "audit-owner",
      status: "pro",
      expiresAt: Date.now() + 86_400_000,
      updatedAt: Date.now(),
    });
    return ctx.db.insert("items", {
      userId: "audit-owner",
      type: "note",
      status,
      note: "Plan a trip to Paris",
      title: "Travel Plans",
      tags: ["travel"],
      searchText: "travel plans",
      processingRunId: "initial-run",
      processingStartedAt: Date.now(),
    });
  });
  return {
    t,
    owner: t.withIdentity({ subject: "audit-owner|session" }),
    itemId,
  };
}

describe("merged note refresh regression audit", () => {
  it("withdraws old suggestions when edited text has no matching spaces", async () => {
    const { t, owner, itemId } = await setup("ready");
    const spaceId = await t.run((ctx) =>
      ctx.db.insert("spaces", {
        userId: "audit-owner",
        name: "Travel",
        dynamic: true,
      }),
    );
    await t.mutation(internal.items.setSpacesForItem, {
      itemId,
      spaceIds: [spaceId],
    });
    await owner.mutation(api.items.updateNoteItem, {
      id: itemId,
      title: "",
      text: "Buy milk and eggs",
    });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(generateObject).toHaveBeenCalledTimes(1);
    expect(await t.run((ctx) => ctx.db.get(itemId))).toMatchObject({
      status: "ready",
      description: NEW_CLASSIFICATION.description,
    });
    const suggestions = await t.run((ctx) =>
      ctx.db
        .query("spaceItems")
        .withIndex("by_item", (q) => q.eq("itemId", itemId))
        .collect(),
    );
    expect(suggestions).toEqual([]);
  });

  it("eventually classifies the latest text edited during the first model call", async () => {
    const { t, owner, itemId } = await setup("processing");
    let markStarted = () => {};
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    let releaseModel = () => {};
    const heldModel = new Promise<void>((resolve) => {
      releaseModel = resolve;
    });
    generateObject.mockImplementationOnce(async () => {
      markStarted();
      await heldModel;
      return { object: OLD_CLASSIFICATION };
    });
    const firstRun = t.action(internal.ai.processItem, {
      itemId,
      runId: "initial-run",
    });
    await started;
    expect(generateObject.mock.calls[0][0].prompt).toContain(
      "Plan a trip to Paris",
    );
    await owner.mutation(api.items.updateNoteItem, {
      id: itemId,
      title: "",
      text: "Buy milk and eggs",
    });
    releaseModel();
    await firstRun;
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const item = await t.run((ctx) => ctx.db.get(itemId));
    expect(item?.note).toBe("Buy milk and eggs");
    expect(item).toMatchObject({
      status: "ready",
      description: NEW_CLASSIFICATION.description,
      tags: NEW_CLASSIFICATION.tags,
    });
  });
});
