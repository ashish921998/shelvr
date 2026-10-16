// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "@convex/_generated/api";
import type { Id } from "./_generated/dataModel";
import { newConvexTest } from "./test.setup";

// A classifier answer whose `title` is empty or whitespace must not be stored
// as is: the feed card would render a blank title.

const generateObject = vi.hoisted(() => vi.fn());
const safeFetch = vi.hoisted(() => vi.fn());

vi.mock("ai", async (original) => ({
  ...(await original<typeof import("ai")>()),
  generateObject,
}));

vi.mock("./model/safeFetch", async (original) => ({
  ...(await original<typeof import("./model/safeFetch")>()),
  safeFetch,
}));

const CLASSIFICATION = {
  title: "Grocery List",
  description: "Things to buy this week.",
  tags: ["groceries", "list"],
  spaceNames: [],
  intents: [],
  cities: [],
};

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
  safeFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function processing(
  t: ReturnType<typeof newConvexTest>,
  fields: { type: "note"; note: string } | { type: "link"; url: string },
): Promise<Id<"items">> {
  const userId = await t.run((ctx) => ctx.db.insert("users", {}));
  return t.run((ctx) =>
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
}

describe("a classifier answer with no usable title", () => {
  it.each(["", "   ", "\n"])(
    "never stores %j as a note's title: the note's first line names it instead",
    async (blank) => {
      generateObject.mockResolvedValue({
        object: { ...CLASSIFICATION, title: blank },
      });
      const t = newConvexTest();
      const itemId = await processing(t, {
        type: "note",
        note: "eggs, milk, bread\nand butter",
      });

      await t.action(internal.ai.processItem, { itemId, runId: "run-1" });

      const item = await t.run((ctx) => ctx.db.get(itemId));
      expect(item?.status).toBe("ready");
      // Either no title (the card then shows the note) or a visible one; a
      // blank string is neither.
      expect(item?.title === undefined || item.title.trim() !== "").toBe(true);
    },
  );

  it("keeps the page's own title when the model hands back an empty one for a link", async () => {
    generateObject.mockResolvedValue({
      object: { ...CLASSIFICATION, title: "" },
    });
    safeFetch.mockResolvedValue({
      ok: true,
      finalUrl: "https://example.com/soup",
      status: 200,
      contentType: "text/html; charset=utf-8",
      bytes: new TextEncoder().encode(
        `<html><head><title>Lentil soup</title>
         <meta property="og:description" content="A weeknight soup"></head>
         <body><article><p>${"Simmer the lentils. ".repeat(40)}</p></article></body></html>`,
      ),
    });
    const t = newConvexTest();
    const itemId = await processing(t, {
      type: "link",
      url: "https://example.com/soup",
    });

    await t.action(internal.ai.processItem, { itemId, runId: "run-1" });

    const item = await t.run((ctx) => ctx.db.get(itemId));
    expect(item?.status).toBe("ready");
    expect(item?.title).toBe("Lentil soup");
  });

  it("trims the whitespace around a title the model padded", async () => {
    generateObject.mockResolvedValue({
      object: { ...CLASSIFICATION, title: "  Grocery List \n" },
    });
    const t = newConvexTest();
    const itemId = await processing(t, {
      type: "note",
      note: "eggs, milk, bread",
    });

    await t.action(internal.ai.processItem, { itemId, runId: "run-1" });

    const item = await t.run((ctx) => ctx.db.get(itemId));
    expect(item?.title).toBe("Grocery List");
  });
});
