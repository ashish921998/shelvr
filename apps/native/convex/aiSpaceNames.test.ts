// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "@convex/_generated/api";
import { spaceNameIds } from "./ai";
import type { Id } from "./_generated/dataModel";
import { newConvexTest } from "./test.setup";

const generateObject = vi.hoisted(() => vi.fn());

vi.mock("ai", async (original) => ({
  ...(await original<typeof import("ai")>()),
  generateObject,
}));

beforeEach(() => {
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", "");
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected network request");
    }),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  generateObject.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const lower = "spaces:lower" as Id<"spaces">;
const upper = "spaces:upper" as Id<"spaces">;
const other = "spaces:other" as Id<"spaces">;

describe("spaceNameIds", () => {
  const spaces = [
    { _id: lower, name: "travel" },
    { _id: upper, name: "Travel" },
    { _id: other, name: " Recipes " },
  ];

  it("prefers the exact trimmed match over a case-twin", () => {
    expect(spaceNameIds(["travel"], spaces)).toEqual([lower]);
    expect(spaceNameIds(["Travel"], spaces)).toEqual([upper]);
    expect(spaceNameIds([" Travel "], spaces)).toEqual([upper]);
  });

  it("falls back to a case-insensitive match, first listed on a tie", () => {
    expect(spaceNameIds(["TRAVEL"], spaces)).toEqual([lower]);
    expect(spaceNameIds(["recipes"], spaces)).toEqual([other]);
    expect(spaceNameIds(["TRAVEL"], [...spaces].reverse())).toEqual([upper]);
  });

  it("drops names that match no space", () => {
    expect(spaceNameIds(["Books", ""], spaces)).toEqual([]);
  });
});

describe("the classifier's space suggestions", () => {
  it("suggests into the space whose name the model gave, not its case-twin", async () => {
    const t = newConvexTest();
    const userId = await t.run((ctx) => ctx.db.insert("users", {}));
    const lowerId = await t.run((ctx) =>
      ctx.db.insert("spaces", { userId, name: "travel", dynamic: true }),
    );
    const upperId = await t.run((ctx) =>
      ctx.db.insert("spaces", { userId, name: "Travel", dynamic: true }),
    );
    const itemId: Id<"items"> = await t.run((ctx) =>
      ctx.db.insert("items", {
        userId,
        type: "note",
        note: "Pack the passports and the chargers",
        status: "processing",
        processingRunId: "run-1",
        processingStartedAt: Date.now(),
        tags: [],
        searchText: "",
      }),
    );
    generateObject.mockResolvedValue({
      object: {
        title: "Packing List",
        description: "What to pack.",
        tags: ["packing"],
        spaceNames: ["travel"],
        intents: [],
        cities: [],
      },
    });

    await t.action(internal.ai.processItem, { itemId, runId: "run-1" });

    const joins = await t.run((ctx) =>
      ctx.db
        .query("spaceItems")
        .withIndex("by_item", (q) => q.eq("itemId", itemId))
        .collect(),
    );
    expect(joins.map((j) => j.spaceId)).toEqual([lowerId]);
    expect(joins.map((j) => j.status)).toEqual(["suggested"]);
    expect(joins.map((j) => j.spaceId)).not.toContain(upperId);
  });
});
