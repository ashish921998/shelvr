// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "@convex/_generated/api";
import type { Id } from "./_generated/dataModel";
import { newConvexTest } from "./test.setup";

const generateObject = vi.hoisted(() => vi.fn());
vi.mock("ai", async (original) => ({
  ...(await original<typeof import("ai")>()),
  generateObject,
}));

const CLASSIFICATION = {
  title: "Grocery List",
  description: "Things to buy this week.",
  tags: ["groceries", "list"],
  spaceNames: [],
  intents: [],
};

beforeEach(() => {
  vi.useFakeTimers();
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
  generateObject.mockResolvedValue({ object: CLASSIFICATION });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A processing note (notes never touch the network) owned by `runId`. */
async function note(
  t: ReturnType<typeof newConvexTest>,
  runId: string,
): Promise<Id<"items">> {
  return t.run((ctx) =>
    ctx.db.insert("items", {
      userId: "note-user",
      type: "note",
      note: "eggs, milk, bread",
      status: "processing",
      processingRunId: runId,
      processingStartedAt: Date.now(),
      tags: [],
      searchText: "",
    }),
  );
}

describe("model call deadlines", () => {
  it("passes a timeout signal and a single retry to every classification call", async () => {
    const t = newConvexTest();
    const itemId = await note(t, "run-1");
    await t.action(internal.ai.processItem, { itemId, runId: "run-1" });
    const call = generateObject.mock.calls[0][0];
    expect(call.abortSignal).toBeInstanceOf(AbortSignal);
    expect(call.maxRetries).toBe(1);
  });

  it.each(["TimeoutError", "AbortError"])(
    "fails the item as retryable when the model call rejects with %s, without throwing",
    async (name) => {
      vi.stubEnv("POSTHOG_PROJECT_TOKEN", "test-token");
      vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 200 }));
      generateObject.mockRejectedValue(new DOMException("deadline", name));
      const t = newConvexTest();
      const itemId = await note(t, "run-1");

      await expect(
        t.action(internal.ai.processItem, { itemId, runId: "run-1" }),
      ).resolves.toBeNull();

      // Retryable: the client renders `error` with a Try again button, and
      // reprocessItem accepts it.
      expect(await t.run((ctx) => ctx.db.get(itemId))).toMatchObject({
        status: "failed",
        failureReason: "error",
      });
      // Provider slowness is an expected condition: warned, never paged as an
      // action fault.
      expect(console.error).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledTimes(1);
      // The outcome event still fires, with a stable category and nothing
      // from the request in it.
      const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
      expect(body.event).toBe("ai_categorization_failed");
      expect(body.properties.error_category).toBe("model_timeout");
      expect(JSON.stringify(body)).not.toContain("eggs");
    },
  );
});

describe("run fencing in processItem", () => {
  it("discards a superseded run's result instead of overwriting the current run", async () => {
    const t = newConvexTest();
    // The user retried while run-old was awaiting the model: the item now
    // belongs to run-new, whose action has not finished yet.
    const itemId = await note(t, "run-new");

    await expect(
      t.action(internal.ai.processItem, { itemId, runId: "run-old" }),
    ).resolves.toBeNull();

    const item = await t.run((ctx) => ctx.db.get(itemId));
    expect(item).toMatchObject({ status: "processing", processingRunId: "run-new" });
    expect(item?.title).toBeUndefined();
    // No steering jobs were queued for a result nobody will see.
    const scheduled = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(scheduled).toHaveLength(0);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("does not fail an item a newer run owns when a superseded run errors", async () => {
    // Telemetry is live so the assertion below proves the fence also covers
    // the outcome event, not only the status write.
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", "test-token");
    vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 200 }));
    generateObject.mockRejectedValue(new DOMException("deadline", "TimeoutError"));
    const t = newConvexTest();
    const itemId = await note(t, "run-new");

    await expect(
      t.action(internal.ai.processItem, { itemId, runId: "run-old" }),
    ).resolves.toBeNull();

    expect(await t.run((ctx) => ctx.db.get(itemId))).toMatchObject({
      status: "processing",
      processingRunId: "run-new",
    });
    // The newer run owns the outcome; this one records nothing.
    expect(fetch).not.toHaveBeenCalled();
  });

  it("finalizes normally when the run still owns the item", async () => {
    const t = newConvexTest();
    const itemId = await note(t, "run-1");
    await t.action(internal.ai.processItem, { itemId, runId: "run-1" });
    expect(await t.run((ctx) => ctx.db.get(itemId))).toMatchObject({
      status: "ready",
      title: "Grocery List",
      processingRunId: "run-1",
    });
  });
});
