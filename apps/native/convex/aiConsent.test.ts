// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { TestConvexForDataModel } from "convex-test";
import type { DataModel, Id } from "./_generated/dataModel";
import { AI_CONSENT_VERSION, isAiConsentRequired } from "./model/aiConsent";
import {
  CURRENT_EMBEDDING_VERSION,
  EMBEDDING_DIMENSIONS,
} from "./model/embedding";
import { newConvexTest } from "./test.setup";

const embedMany = vi.hoisted(() => vi.fn());
const generateObject = vi.hoisted(() => vi.fn());
const safeFetch = vi.hoisted(() => vi.fn());

// Every provider call is replaced, so a test can assert that none was made.
vi.mock("ai", () => ({
  embedMany,
  generateObject,
  wrapLanguageModel: vi.fn(() => ({})),
}));

vi.mock("./model/safeFetch", async (original) => ({
  ...(await original<typeof import("./model/safeFetch")>()),
  safeFetch,
}));

const USER = "consent-user";
const VECTOR = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) =>
  i === 0 ? 1 : 0,
);

type T = TestConvexForDataModel<DataModel>;

function signedIn(backend = newConvexTest()): T {
  return backend.withIdentity({ subject: `${USER}|session-1` });
}

async function expectNoThirdPartyCall() {
  expect(generateObject).not.toHaveBeenCalled();
  expect(embedMany).not.toHaveBeenCalled();
  const hosts = safeFetch.mock.calls.map(([url]) => new URL(url).hostname);
  expect(hosts).not.toContain("serpapi.com");
}

async function seedPro(t: T) {
  await t.run((ctx) =>
    ctx.db.insert("subscriptions", {
      userId: USER,
      status: "pro",
      expiresAt: Date.now() + 86_400_000,
      updatedAt: Date.now(),
    }),
  );
}

async function processing(
  t: T,
  fields: { type: "link"; url: string } | { type: "note"; note: string },
): Promise<Id<"items">> {
  return await t.run((ctx) =>
    ctx.db.insert("items", {
      userId: USER,
      status: "processing",
      processingRunId: "run-1",
      processingStartedAt: Date.now(),
      tags: [],
      searchText: "",
      ...fields,
    }),
  );
}

async function ready(t: T, fields: { embedding?: number[] } = {}) {
  return await t.run((ctx) =>
    ctx.db.insert("items", {
      userId: USER,
      type: "note",
      status: "ready",
      title: "Lentil soup",
      description: "A weeknight soup",
      note: "Lentils, stock, lemon",
      tags: ["food"],
      searchText: "lentil soup",
      ...(fields.embedding
        ? {
            embedding: fields.embedding,
            embeddingVersion: CURRENT_EMBEDDING_VERSION,
          }
        : {}),
    }),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", "");
  vi.stubEnv("SERPAPI_KEY", "unit-test-only");
  embedMany.mockReset();
  embedMany.mockImplementation(async ({ values }: { values: string[] }) => ({
    embeddings: values.map(() => VECTOR),
  }));
  generateObject.mockReset();
  generateObject.mockResolvedValue({
    object: {
      title: "Model title",
      description: "Model description.",
      tags: ["model"],
      spaceNames: ["Recipes"],
      intents: [],
      query: "lentils",
    },
  });
  safeFetch.mockReset();
  safeFetch.mockResolvedValue({ ok: false, code: "http_error", status: 599 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("getStatus and setConsent", () => {
  it("reads unset until the user answers, then their answer", async () => {
    const t = signedIn();
    const unset = { status: "unset", version: AI_CONSENT_VERSION };
    expect(await t.query(api.aiConsent.getStatus, {})).toEqual(unset);

    await t.mutation(api.aiConsent.setConsent, { granted: true });
    expect(await t.query(api.aiConsent.getStatus, {})).toEqual({
      status: "granted",
      version: AI_CONSENT_VERSION,
    });

    await t.mutation(api.aiConsent.setConsent, { granted: false });
    expect(await t.query(api.aiConsent.getStatus, {})).toEqual({
      status: "declined",
      version: AI_CONSENT_VERSION,
    });
    const rows = await t.run((ctx) => ctx.db.query("aiConsents").collect());
    expect(rows).toHaveLength(1);
  });

  it("asks again when the answer was to an older disclosure", async () => {
    const t = signedIn();
    await t.run((ctx) =>
      ctx.db.insert("aiConsents", {
        userId: USER,
        status: "granted",
        version: AI_CONSENT_VERSION - 1,
        updatedAt: 1,
      }),
    );
    expect((await t.query(api.aiConsent.getStatus, {})).status).toBe("unset");
  });

  it("keeps one user's answer away from another", async () => {
    const backend = newConvexTest();
    await signedIn(backend).mutation(api.aiConsent.setConsent, {
      granted: false,
    });
    const other = backend.withIdentity({ subject: "someone-else|session-1" });
    expect((await other.query(api.aiConsent.getStatus, {})).status).toBe(
      "unset",
    );
    expect(
      await backend.query(internal.aiConsent.isAllowed, {
        userId: "someone-else",
      }),
    ).toBe(true);
  });

  it("requires a signed-in user", async () => {
    const t = newConvexTest();
    await expect(t.query(api.aiConsent.getStatus, {})).rejects.toThrow();
    await expect(
      t.mutation(api.aiConsent.setConsent, { granted: true }),
    ).rejects.toThrow();
  });
});

describe("a user who has not answered", () => {
  it("is still classified, so builds without the consent card keep working", async () => {
    const t = signedIn();
    const itemId = await processing(t, { type: "note", note: "Buy lentils" });
    await t.action(internal.ai.processItem, { itemId, runId: "run-1" });
    expect(generateObject).toHaveBeenCalledTimes(1);
    expect(embedMany).toHaveBeenCalledTimes(1);
    expect(await t.run((ctx) => ctx.db.get(itemId))).toMatchObject({
      status: "ready",
      title: "Model title",
      tags: ["model"],
    });
  });
});

describe("a save that is gone", () => {
  it("is not allowed to be sent, whatever the consent answer", async () => {
    const t = signedIn();
    const itemId = await processing(t, { type: "note", note: "Buy lentils" });
    expect(
      await t.query(internal.aiConsent.isAllowed, { userId: USER, itemId }),
    ).toBe(true);

    await t.run((ctx) => ctx.db.delete(itemId));

    expect(
      await t.query(internal.aiConsent.isAllowed, { userId: USER, itemId }),
    ).toBe(false);
    expect(await t.query(internal.aiConsent.isAllowed, { userId: USER })).toBe(
      true,
    );
  });
});

describe("a user who declined", () => {
  async function declined() {
    const t = signedIn();
    await t.mutation(api.aiConsent.setConsent, { granted: false });
    return t;
  }

  it("saves a link from what the page itself says, with no tags or suggestions", async () => {
    const t = await declined();
    const spaceId = await t.run((ctx) =>
      ctx.db.insert("spaces", { userId: USER, name: "Recipes", dynamic: true }),
    );
    safeFetch.mockResolvedValue({
      ok: true,
      finalUrl: "https://example.com/soup",
      status: 200,
      contentType: "text/html; charset=utf-8",
      bytes: new TextEncoder().encode(
        `<html><head><title>Lentil soup</title>
         <meta property="og:description" content="A weeknight soup">
         <meta property="og:site_name" content="Example Kitchen"></head>
         <body><article><p>${"Simmer the lentils. ".repeat(40)}</p></article></body></html>`,
      ),
    });
    const itemId = await processing(t, {
      type: "link",
      url: "https://example.com/soup",
    });

    await t.action(internal.ai.processItem, { itemId, runId: "run-1" });

    const item = await t.run((ctx) => ctx.db.get(itemId));
    expect(item).toMatchObject({
      status: "ready",
      title: "Lentil soup",
      description: "A weeknight soup",
      siteName: "Example Kitchen",
      tags: [],
      intents: [],
    });
    expect(item?.content).toContain("Simmer the lentils.");
    expect(item?.embedding).toBeUndefined();
    const memberships = await t.run((ctx) =>
      ctx.db
        .query("spaceItems")
        .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
        .collect(),
    );
    expect(memberships).toEqual([]);
    await expectNoThirdPartyCall();
  });

  it("still saves a link whose page could not be read", async () => {
    const t = await declined();
    const itemId = await processing(t, {
      type: "link",
      url: "https://example.com/blocked",
    });
    await t.action(internal.ai.processItem, { itemId, runId: "run-1" });
    const item = await t.run((ctx) => ctx.db.get(itemId));
    expect(item).toMatchObject({ status: "ready", enrichment: "partial" });
    expect(item?.title).toBeUndefined();
    await expectNoThirdPartyCall();
  });

  it("titles a note from its first line and keeps its text", async () => {
    const t = await declined();
    const itemId = await processing(t, {
      type: "note",
      note: "\n  Buy lentils  \nand a lemon",
    });
    await t.action(internal.ai.processItem, { itemId, runId: "run-1" });
    expect(await t.run((ctx) => ctx.db.get(itemId))).toMatchObject({
      status: "ready",
      title: "Buy lentils",
      note: "\n  Buy lentils  \nand a lemon",
      tags: [],
    });
    await expectNoThirdPartyCall();
  });

  it("keeps the tags and description an earlier, allowed run wrote", async () => {
    const t = await declined();
    const itemId = await processing(t, {
      type: "note",
      note: "Buy lentils and a lemon",
    });
    await t.run((ctx) =>
      ctx.db.patch(itemId, {
        status: "ready",
        tags: ["groceries"],
        description: "A short shopping list",
      }),
    );
    await t.action(internal.ai.processItem, {
      itemId,
      runId: "run-1",
      refresh: true,
    });
    expect(await t.run((ctx) => ctx.db.get(itemId))).toMatchObject({
      status: "ready",
      tags: ["groceries"],
      description: "A short shopping list",
    });
    await expectNoThirdPartyCall();
  });

  it("saves a photo untitled, without sending the image anywhere", async () => {
    const t = await declined();
    const itemId = await t.run(async (ctx) =>
      ctx.db.insert("items", {
        userId: USER,
        type: "image",
        status: "processing",
        processingRunId: "run-1",
        storageId: await ctx.storage.store(
          new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }),
        ),
        aspectRatio: 1.5,
        tags: [],
        searchText: "",
      }),
    );
    await t.action(internal.ai.processItem, { itemId, runId: "run-1" });
    const item = await t.run((ctx) => ctx.db.get(itemId));
    expect(item).toMatchObject({ status: "ready", tags: [], aspectRatio: 1.5 });
    expect(item?.title).toBeUndefined();
    await expectNoThirdPartyCall();
  });

  it("gets no recommendations for a new space", async () => {
    const t = await declined();
    await ready(t);
    const spaceId = await t.run((ctx) =>
      ctx.db.insert("spaces", { userId: USER, name: "Recipes", dynamic: true }),
    );
    await t.action(internal.ai.recommendForSpace, { spaceId });
    await expectNoThirdPartyCall();
  });

  it("gets no steering when filing an item into a space", async () => {
    // Steering only runs for a real, entitled account, so this one is seeded
    // in full and steered once before the decline to prove the setup reaches
    // the model.
    const t = newConvexTest();
    const { itemId, spaceId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {});
      await ctx.db.insert("subscriptions", {
        userId,
        status: "pro",
        expiresAt: Date.now() + 86_400_000,
        updatedAt: Date.now(),
      });
      const itemId = await ctx.db.insert("items", {
        userId,
        type: "note",
        status: "ready",
        title: "Lentil soup",
        note: "Lentils, stock, lemon",
        tags: [],
        searchText: "lentil soup",
      });
      const spaceId = await ctx.db.insert("spaces", { userId, name: "Food" });
      await ctx.db.insert("spaceItems", {
        userId,
        itemId,
        spaceId,
        status: "saved",
      });
      return { itemId, spaceId, userId };
    });
    const steer = { itemId, spaceId, budgetCharged: true };

    await t.action(internal.ai.steerItemForSpace, steer);
    expect(generateObject).toHaveBeenCalledTimes(1);

    await t
      .withIdentity({ subject: `${userId}|session-1` })
      .mutation(api.aiConsent.setConsent, { granted: false });
    await t.action(internal.ai.steerItemForSpace, steer);
    expect(generateObject).toHaveBeenCalledTimes(1);
  });

  it("is refused a product search with a code the client can show", async () => {
    const t = await declined();
    await seedPro(t);
    const itemId = await ready(t);
    const refusal = await t
      .mutation(api.items.findLinks, { id: itemId })
      .catch((error: unknown) => error);
    expect(isAiConsentRequired(refusal)).toBe(true);
    expect(isAiConsentRequired(new Error("ai_consent_required"))).toBe(false);
    expect(
      (await t.run((ctx) => ctx.db.get(itemId)))?.productsStatus,
    ).toBeUndefined();
  });

  it("fails a product search that was already scheduled", async () => {
    const t = signedIn();
    const itemId = await ready(t);
    await t.run((ctx) => ctx.db.patch(itemId, { productsStatus: "searching" }));
    await t.mutation(api.aiConsent.setConsent, { granted: false });
    await t.action(internal.ai.findProductLinks, { itemId });
    expect((await t.run((ctx) => ctx.db.get(itemId)))?.productsStatus).toBe(
      "failed",
    );
    await expectNoThirdPartyCall();
  });

  it("has stored vectors removed, and the sweep leaves the items alone", async () => {
    const t = signedIn();
    const embedded = await ready(t, { embedding: VECTOR });
    const neverEmbedded = await ready(t);

    await t.mutation(api.aiConsent.setConsent, { granted: false });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    for (const id of [embedded, neverEmbedded]) {
      const item = await t.run((ctx) => ctx.db.get(id));
      expect(item?.embedding).toBeUndefined();
    }
    expect(await t.action(internal.ai.sweepItemEmbeddings, {})).toEqual({
      scanned: 0,
      written: 0,
    });
    await expectNoThirdPartyCall();
  });

  it("is skipped by a sweep that reaches an item before the cleanup does", async () => {
    const t = signedIn();
    const itemId = await ready(t);
    await t.run((ctx) =>
      ctx.db.insert("aiConsents", {
        userId: USER,
        status: "declined",
        version: AI_CONSENT_VERSION,
        updatedAt: 1,
      }),
    );
    expect(await t.action(internal.ai.sweepItemEmbeddings, {})).toEqual({
      scanned: 1,
      written: 0,
    });
    expect(await t.run((ctx) => ctx.db.get(itemId))).toMatchObject({
      embeddingVersion: CURRENT_EMBEDDING_VERSION,
    });
    await expectNoThirdPartyCall();
  });

  it("is embedded again after changing their mind", async () => {
    const t = signedIn();
    const itemId = await ready(t, { embedding: VECTOR });
    await t.mutation(api.aiConsent.setConsent, { granted: false });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await t.mutation(api.aiConsent.setConsent, { granted: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    await t.action(internal.ai.sweepItemEmbeddings, {});
    expect(embedMany).toHaveBeenCalledTimes(1);
    expect((await t.run((ctx) => ctx.db.get(itemId)))?.embedding).toHaveLength(
      EMBEDDING_DIMENSIONS,
    );
  });
});

describe("the onboarding demo save", () => {
  it("finishes without the model for a user who declined", async () => {
    const t = signedIn();
    await t.mutation(api.aiConsent.setConsent, { granted: false });
    const { itemId } = await t.mutation(api.demo.createDemoItem, {
      url: "https://example.com/blocked",
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run((ctx) => ctx.db.get(itemId)))?.status).toBe("ready");
    await expectNoThirdPartyCall();
  });
});

describe("account deletion", () => {
  it("removes the consent row", async () => {
    const t = signedIn();
    await t.mutation(api.aiConsent.setConsent, { granted: false });
    await t.mutation(api.users.deleteCurrentUserAccount, {});
    expect(await t.run((ctx) => ctx.db.query("aiConsents").collect())).toEqual(
      [],
    );
  });
});

describe("a decline that lands while a run is still out", () => {
  it("keeps the save's title, tags and description when the model's result arrives late", async () => {
    const t = signedIn();
    const itemId = await ready(t);
    await t.mutation(api.aiConsent.setConsent, { granted: false });

    await t.mutation(internal.items.finalizeItem, {
      itemId,
      title: "Model title",
      description: "Model description.",
      tags: ["model"],
      classified: true,
      status: "ready",
    });

    expect(await t.run((ctx) => ctx.db.get(itemId))).toMatchObject({
      title: "Lentil soup",
      description: "A weeknight soup",
      tags: ["food"],
    });
  });

  it("keeps an existing title when a run without the model has none to offer", async () => {
    const t = signedIn();
    await t.mutation(api.aiConsent.setConsent, { granted: false });
    const itemId = await ready(t);

    await t.mutation(internal.items.finalizeItem, {
      itemId,
      description: "",
      tags: ["food"],
      status: "ready",
    });

    expect((await t.run((ctx) => ctx.db.get(itemId)))?.title).toBe(
      "Lentil soup",
    );
  });

  it("discards the model's answer and skips the embedding when AI goes off mid-save", async () => {
    const t = signedIn();
    const itemId = await processing(t, { type: "note", note: "Buy lentils" });
    generateObject.mockImplementationOnce(async () => {
      await t.mutation(api.aiConsent.setConsent, { granted: false });
      return {
        object: {
          title: "Model title",
          description: "Model description.",
          tags: ["model"],
          spaceNames: [],
          intents: [],
        },
      };
    });

    await t.action(internal.ai.processItem, { itemId, runId: "run-1" });

    expect(embedMany).not.toHaveBeenCalled();
    const item = await t.run((ctx) => ctx.db.get(itemId));
    expect(item).toMatchObject({
      status: "ready",
      title: "Buy lentils",
      description: "",
      tags: [],
    });
    expect(item?.embedding).toBeUndefined();
    expect(await t.run((ctx) => ctx.db.query("spaceItems").collect())).toEqual(
      [],
    );
  });

  it("discards the model's answer when AI goes off during the embedding call", async () => {
    const t = signedIn();
    const itemId = await processing(t, { type: "note", note: "Buy lentils" });
    embedMany.mockImplementationOnce(async () => {
      await t.mutation(api.aiConsent.setConsent, { granted: false });
      return { embeddings: [VECTOR] };
    });

    await t.action(internal.ai.processItem, { itemId, runId: "run-1" });

    const item = await t.run((ctx) => ctx.db.get(itemId));
    expect(item).toMatchObject({ status: "ready", tags: [] });
    expect(item?.title).not.toBe("Model title");
    expect(item?.embedding).toBeUndefined();
  });

  it("sends no saves for a new space when AI goes off while candidates are picked", async () => {
    const t = signedIn();
    await ready(t, { embedding: VECTOR });
    const spaceId = await t.run((ctx) =>
      ctx.db.insert("spaces", { userId: USER, name: "Recipes", dynamic: true }),
    );
    embedMany.mockImplementationOnce(async () => {
      await t.mutation(api.aiConsent.setConsent, { granted: false });
      return { embeddings: [VECTOR] };
    });

    await t.action(internal.ai.recommendForSpace, { spaceId });

    expect(generateObject).not.toHaveBeenCalled();
  });

  it("drops suggestions the model made for a new space", async () => {
    const t = signedIn();
    const itemId = await ready(t);
    const spaceId = await t.run((ctx) =>
      ctx.db.insert("spaces", { userId: USER, name: "Recipes" }),
    );
    await t.mutation(api.aiConsent.setConsent, { granted: false });

    await t.mutation(internal.items.suggestItemsForSpace, {
      spaceId,
      itemIds: [itemId],
    });

    expect(await t.run((ctx) => ctx.db.query("spaceItems").collect())).toEqual(
      [],
    );
  });
});
