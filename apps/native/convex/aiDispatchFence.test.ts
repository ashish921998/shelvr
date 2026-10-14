// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getFunctionName,
  type DefaultFunctionArgs,
  type RegisteredAction,
} from "convex/server";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { findProductLinks, processItem, steerItemForSpace } from "./ai";
import { recommendForSpace } from "./aiRecommendForSpace";
import { sweepItemEmbeddings } from "./aiEmbeddingSweep";
import {
  CURRENT_EMBEDDING_VERSION,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_SWEEP_PAGE,
} from "./model/embedding";
import { newConvexTest } from "./test.setup";
import { aiAllowed } from "./aiConsent";

const generateObject = vi.hoisted(() => vi.fn());
const embedMany = vi.hoisted(() => vi.fn());
const readPage = vi.hoisted(() => vi.fn());
const readStoredImage = vi.hoisted(() => vi.fn());
const safeFetch = vi.hoisted(() => vi.fn());
vi.mock("ai", async (original) => ({
  ...(await original<typeof import("ai")>()),
  generateObject,
  embedMany,
}));
vi.mock("./model/pageRead", async (original) => ({
  ...(await original<typeof import("./model/pageRead")>()),
  readPage,
}));
vi.mock("./model/storedImage", async (original) => ({
  ...(await original<typeof import("./model/storedImage")>()),
  readStoredImage,
}));
vi.mock("./model/safeFetch", async (original) => ({
  ...(await original<typeof import("./model/safeFetch")>()),
  safeFetch,
}));

const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) =>
  i === 0 ? 1 : 0,
);
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", "");
  vi.stubEnv("SERPAPI_KEY", "unit-test");
  generateObject.mockReset().mockResolvedValue({
    object: {
      title: "Synthetic title",
      description: "Synthetic description",
      tags: [],
      spaceNames: [],
      intents: [],
      itemNumbers: [1],
      query: "synthetic product",
    },
  });
  embedMany
    .mockReset()
    .mockImplementation(async ({ values }: { values: string[] }) => ({
      embeddings: values.map(() => vector),
    }));
  readPage.mockReset().mockResolvedValue({
    status: "ok",
    page: { title: "Synthetic page", content: "Synthetic body" },
  });
  readStoredImage.mockReset().mockResolvedValue({
    bytes: new Uint8Array([1]),
    mediaType: "image/png",
  });
  safeFetch.mockReset().mockResolvedValue({ ok: false, code: "http_error" });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Convex registrations retain their original handler at runtime. Only the
 * action context is wrapped; all nested queries/mutations remain real. */
function handler<Args extends DefaultFunctionArgs, Result>(
  action: RegisteredAction<"internal", Args, Result>,
) {
  return (
    action as typeof action & {
      _handler: (ctx: ActionCtx, args: Args) => Result;
    }
  )._handler;
}

type PausedQuery = { name: string; args: unknown; result: unknown };

/** Pause after a real DB query completes, never replace its authorization. */
function queryBarrier(
  ctx: ActionCtx,
  name: string,
  occurrence = 1,
  before = false,
) {
  const reached = deferred();
  const resume = deferred();
  let pausedQuery: PausedQuery | undefined;
  let calls = 0;
  const runQuery: ActionCtx["runQuery"] = async (ref, ...args) => {
    const shouldPause = getFunctionName(ref) === name && ++calls === occurrence;
    if (before && shouldPause) {
      reached.resolve();
      await resume.promise;
    }
    const value = await ctx.runQuery(ref, ...args);
    if (!before && shouldPause) {
      pausedQuery = {
        name: getFunctionName(ref),
        args: args[0],
        result: value,
      };
      reached.resolve();
      await resume.promise;
    }
    return value;
  };
  return {
    ctx: { ...ctx, runQuery },
    reached,
    resume,
    get pausedQuery() {
      return pausedQuery;
    },
  };
}

async function fixture(type: "note" | "link" | "image" = "note") {
  const t = newConvexTest();
  const userId = await t.run((ctx) => ctx.db.insert("users", {}));
  const foreignId = await t.run((ctx) => ctx.db.insert("users", {}));
  const itemId = await t.run(async (ctx) =>
    ctx.db.insert("items", {
      userId,
      type,
      status: "ready",
      title: "Synthetic save",
      description: "Synthetic description",
      note: type === "note" ? "Synthetic note" : undefined,
      url: type === "link" ? "https://example.com/synthetic" : undefined,
      storageId:
        type === "image"
          ? await ctx.storage.store(new Blob(["synthetic"]))
          : undefined,
      tags: [],
      searchText: "",
    }),
  );
  const spaceId = await t.run((ctx) =>
    ctx.db.insert("spaces", {
      userId,
      name: "Synthetic space",
      description: "Synthetic purpose",
      dynamic: true,
    }),
  );
  return { t, userId, foreignId, itemId, spaceId };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
type Invalidation =
  | "removed owner"
  | "deleting owner"
  | "deleted item"
  | "foreign item"
  | "declined";
async function invalidate(f: Fixture, kind: Invalidation) {
  await f.t.run(async (ctx) => {
    if (kind === "removed owner") await ctx.db.delete(f.userId);
    else if (kind === "deleting owner")
      await ctx.db.patch(f.userId, { deleting: true });
    else if (kind === "deleted item") await ctx.db.delete(f.itemId);
    else if (kind === "foreign item")
      await ctx.db.patch(f.itemId, { userId: f.foreignId });
    else
      await ctx.db.insert("aiConsents", {
        userId: f.userId,
        status: "declined",
        version: 1,
        updatedAt: 0,
      });
  });
}

async function paused(
  f: Fixture,
  name: string,
  run: (ctx: ActionCtx) => Promise<unknown>,
  change: (query: PausedQuery | undefined) => Promise<void>,
  occurrence = 1,
  before = false,
) {
  await f.t.action(async (ctx) => {
    const barrier = queryBarrier(ctx, name, occurrence, before);
    const running = run(barrier.ctx);
    await barrier.reached.promise;
    await change(barrier.pausedQuery);
    barrier.resume.resolve();
    await running;
  });
}

describe("AI dispatch uses fresh live ownership", () => {
  it("revalidates a mixed sweep in one query and maps distinct vectors around empty and gone slots", async () => {
    const f = await fixture();
    const [declinedId, goneId, secondId] = await f.t.run(async (ctx) => {
      await ctx.db.insert("aiConsents", {
        userId: f.foreignId,
        status: "declined",
        version: 1,
        updatedAt: 0,
      });
      const insert = (userId: string, title: string) =>
        ctx.db.insert("items", {
          userId,
          title,
          type: "note",
          status: "ready",
          tags: [],
          searchText: "",
        });
      return [
        await insert(f.foreignId, "Declined synthetic"),
        await insert(f.userId, "Gone synthetic"),
        await insert(f.userId, "Second allowed"),
      ];
    });
    const secondVector = vector.map((value, i) =>
      i === 1 ? 1 : value === 1 ? 0 : value,
    );
    embedMany.mockResolvedValue({ embeddings: [vector, secondVector] });
    await f.t.action(async (ctx) => {
      let batches = 0;
      const runQuery: ActionCtx["runQuery"] = async (ref, ...args) => {
        const name = getFunctionName(ref);
        expect(["aiConsent:isAllowed", "items:getItemInternal"]).not.toContain(
          name,
        );
        if (name === "aiConsent:revalidateEmbeddingBatch") batches++;
        const result = await ctx.runQuery(ref, ...args);
        if (name === "items:listItemsNeedingEmbeddingInternal")
          await f.t.run((db) => db.db.delete(goneId));
        return result;
      };
      await handler(sweepItemEmbeddings)({ ...ctx, runQuery }, {});
      expect(batches).toBe(1);
    });
    expect(embedMany.mock.calls[0][0].values).toEqual([
      expect.stringContaining("Synthetic save"),
      "Second allowed",
    ]);
    expect(await f.t.run((ctx) => ctx.db.get(f.itemId))).toMatchObject({
      embedding: vector,
    });
    expect(await f.t.run((ctx) => ctx.db.get(secondId))).toMatchObject({
      embedding: secondVector,
    });
    expect(await f.t.run((ctx) => ctx.db.get(declinedId))).toMatchObject({
      embeddingVersion: CURRENT_EMBEDDING_VERSION,
    });
    expect(
      (await f.t.run((ctx) => ctx.db.get(declinedId)))?.embedding,
    ).toBeUndefined();
  });

  it("reads recommendation context once before embedding and survivors once after hydration", async () => {
    const f = await fixture();
    const calls: string[] = [];
    embedMany.mockImplementation(async ({ values }: { values: string[] }) => {
      expect(calls).toEqual(["spaces:recommendationContext"]);
      return { embeddings: values.map(() => vector) };
    });
    generateObject.mockImplementation(async () => {
      expect(
        calls.filter((name) => name === "spaces:survivingCandidates"),
      ).toHaveLength(1);
      expect(calls.indexOf("spaces:survivingCandidates")).toBeGreaterThan(
        calls.indexOf("items:listReadyItemsInternal"),
      );
      return { object: { itemNumbers: [] } };
    });
    await f.t.action(async (ctx) => {
      const runQuery: ActionCtx["runQuery"] = async (ref, ...args) => {
        calls.push(getFunctionName(ref));
        return await ctx.runQuery(ref, ...args);
      };
      await handler(recommendForSpace)(
        { ...ctx, runQuery },
        { spaceId: f.spaceId },
      );
    });
    expect(
      calls.filter((name) => name === "spaces:recommendationContext"),
    ).toHaveLength(1);
    expect(generateObject).toHaveBeenCalledOnce();
  });

  it("rejects oversized sweep batches and empty recommendation validation", async () => {
    const f = await fixture();
    await expect(
      f.t.query(internal.aiConsent.revalidateEmbeddingBatch, {
        entries: Array.from({ length: EMBEDDING_SWEEP_PAGE + 1 }, () => ({
          itemId: f.itemId,
          userId: f.userId,
        })),
      }),
    ).rejects.toThrow("Too many embedding entries");
    await expect(
      f.t.query(internal.spaces.survivingCandidates, {
        spaceId: f.spaceId,
        userId: f.userId,
        itemIds: [],
      }),
    ).rejects.toThrow("No candidates");
  });

  it.each(["note", "text product"] as const)(
    "uses one consent query before the %s model call",
    async (path) => {
      const f = await fixture();
      let checks = 0;
      generateObject.mockImplementation(async () => {
        expect(checks).toBe(1);
        return {
          object: {
            title: "Synthetic title",
            description: "",
            tags: [],
            spaceNames: [],
            intents: [],
            query: "",
          },
        };
      });
      await f.t.action(async (ctx) => {
        const runQuery: ActionCtx["runQuery"] = async (ref, ...args) => {
          if (getFunctionName(ref) === "aiConsent:isAllowed") checks++;
          return await ctx.runQuery(ref, ...args);
        };
        const action = path === "note" ? processItem : findProductLinks;
        await handler(action)({ ...ctx, runQuery }, { itemId: f.itemId });
      });
      expect(generateObject).toHaveBeenCalledOnce();
    },
  );

  it("excludes declined sweep text after consent removal following fresh denial", async () => {
    const f = await fixture();
    const consentId = await f.t.run((ctx) =>
      ctx.db.insert("aiConsents", {
        userId: f.userId,
        status: "declined",
        version: 1,
        updatedAt: 0,
      }),
    );
    await f.t.run((ctx) =>
      ctx.db.insert("items", {
        userId: f.foreignId,
        type: "note",
        status: "ready",
        title: "Allowed synthetic save",
        note: "Allowed synthetic note",
        tags: [],
        searchText: "",
      }),
    );
    await paused(
      f,
      "aiConsent:revalidateEmbeddingBatch",
      (ctx) => handler(sweepItemEmbeddings)(ctx, {}),
      async (query) => {
        expect(query?.name).toBe("aiConsent:revalidateEmbeddingBatch");
        expect(query?.args).toMatchObject({
          entries: expect.arrayContaining([
            { userId: f.userId, itemId: f.itemId },
          ]),
        });
        expect(query?.result).toEqual(
          expect.arrayContaining([
            { itemId: f.itemId, disposition: "declined" },
          ]),
        );
        expect(
          await f.t.query(internal.aiConsent.isAllowed, {
            userId: f.userId,
            itemId: f.itemId,
          }),
        ).toBe(false);
        await f.t.run((ctx) => ctx.db.delete(consentId));
        expect(
          await f.t.run(
            async (ctx) => (await ctx.db.get(f.userId))?.deleting !== true,
          ),
        ).toBe(true);
      },
    );
    expect(embedMany).toHaveBeenCalledOnce();
    expect(embedMany.mock.calls[0][0].values).toEqual([
      expect.stringContaining("Allowed synthetic note"),
    ]);
    expect(embedMany.mock.calls[0][0].values).not.toEqual(
      expect.arrayContaining([expect.stringContaining("Synthetic note")]),
    );
  });
  it.each(["removed owner", "deleting owner", "declined"] as const)(
    "rejects %s even without an item identity",
    async (kind) => {
      const f = await fixture();
      await invalidate(f, kind);
      expect(await f.t.run((ctx) => aiAllowed(ctx, f.userId))).toBe(false);
    },
  );
  it.each(["deleted item", "foreign item"] as const)(
    "rejects %s for a live unset-consent owner",
    async (kind) => {
      const f = await fixture();
      await invalidate(f, kind);
      expect(
        await f.t.query(internal.aiConsent.isAllowed, {
          userId: f.userId,
          itemId: f.itemId,
        }),
      ).toBe(false);
    },
  );
  it("allows live unset and granted consent", async () => {
    const f = await fixture();
    expect(
      await f.t.query(internal.aiConsent.isAllowed, {
        userId: f.userId,
        itemId: f.itemId,
      }),
    ).toBe(true);
    await f.t.run((ctx) =>
      ctx.db.insert("aiConsents", {
        userId: f.userId,
        status: "granted",
        version: 1,
        updatedAt: 0,
      }),
    );
    expect(await f.t.run((ctx) => aiAllowed(ctx, f.userId))).toBe(true);
  });

  it.each([
    "removed owner",
    "deleting owner",
    "deleted item",
    "foreign item",
    "declined",
  ] as const)("does not classify a hydrated note after %s", async (kind) => {
    const f = await fixture();
    await paused(
      f,
      "aiConsent:isAllowed",
      (ctx) => handler(processItem)(ctx, { itemId: f.itemId }),
      () => invalidate(f, kind),
      1,
      true,
    );
    expect(generateObject).not.toHaveBeenCalled();
    expect(embedMany).not.toHaveBeenCalled();
  });

  it.each(["note", "image", "link"] as const)(
    "keeps successful live %s processing",
    async (type) => {
      const f = await fixture(type);
      await f.t.action(internal.ai.processItem, { itemId: f.itemId });
      expect(generateObject).toHaveBeenCalledOnce();
      expect(await f.t.run((ctx) => ctx.db.get(f.itemId))).toMatchObject({
        title: "Synthetic title",
        status: "ready",
      });
    },
  );

  it.each([
    ["link", "deleting owner"],
    ["image", "deleting owner"],
    ["link", "deleted item"],
    ["image", "deleted item"],
  ] as const)("blocks hydrated %s content after %s", async (type, kind) => {
    const f = await fixture(type);
    const reached = deferred();
    const resume = deferred();
    const providerRead = type === "link" ? readPage : readStoredImage;
    const loaded = await providerRead();
    providerRead.mockImplementationOnce(async () => {
      reached.resolve();
      await resume.promise;
      return loaded;
    });
    const running = f.t.action(internal.ai.processItem, { itemId: f.itemId });
    await reached.promise;
    await invalidate(f, kind);
    resume.resolve();
    await running;
    expect(generateObject).not.toHaveBeenCalled();
    expect(embedMany).not.toHaveBeenCalled();
  });

  it("blocks a hydrated text product query before its single consent check", async () => {
    const f = await fixture();
    await paused(
      f,
      "aiConsent:isAllowed",
      (ctx) => handler(findProductLinks)(ctx, { itemId: f.itemId }),
      () => invalidate(f, "deleted item"),
      1,
      true,
    );
    expect(generateObject).not.toHaveBeenCalled();
    expect(safeFetch).not.toHaveBeenCalled();
  });

  it("preserves a live text product search", async () => {
    const f = await fixture();
    generateObject.mockResolvedValue({ object: { query: "" } });
    await f.t.action(internal.ai.findProductLinks, { itemId: f.itemId });
    expect(generateObject).toHaveBeenCalledOnce();
    expect(await f.t.run((ctx) => ctx.db.get(f.itemId))).toMatchObject({
      productsStatus: "ready",
      products: [],
    });
  });

  it.each(["deleted item", "deleting owner", "foreign item"] as const)(
    "blocks steering after hydrated %s",
    async (kind) => {
      const f = await fixture();
      await f.t.run((ctx) =>
        ctx.db.insert("subscriptions", {
          userId: f.userId,
          status: "pro",
          expiresAt: Date.now() + 86400000,
          updatedAt: Date.now(),
        }),
      );
      await f.t.run((ctx) =>
        ctx.db.insert("spaceItems", {
          userId: f.userId,
          itemId: f.itemId,
          spaceId: f.spaceId,
          status: "saved",
        }),
      );
      await paused(
        f,
        "items:getItemInternal",
        (ctx) =>
          handler(steerItemForSpace)(ctx, {
            itemId: f.itemId,
            spaceId: f.spaceId,
            budgetCharged: true,
          }),
        () => invalidate(f, kind),
      );
      expect(generateObject).not.toHaveBeenCalled();
    },
  );

  it.each([
    "removed owner",
    "deleting owner",
    "deleted item",
    "foreign item",
    "declined",
  ] as const)("omits sweep input after %s", async (kind) => {
    const f = await fixture();
    await paused(
      f,
      "items:listItemsNeedingEmbeddingInternal",
      (ctx) => handler(sweepItemEmbeddings)(ctx, {}),
      () => invalidate(f, kind),
    );
    expect(embedMany).not.toHaveBeenCalled();
  });

  it("maps mixed sweep vectors to only surviving items", async () => {
    const f = await fixture();
    const survivingId = await f.t.run((ctx) =>
      ctx.db.insert("items", {
        userId: f.userId,
        type: "note",
        status: "ready",
        title: "Surviving synthetic",
        tags: [],
        searchText: "",
      }),
    );
    await paused(
      f,
      "items:listItemsNeedingEmbeddingInternal",
      (ctx) => handler(sweepItemEmbeddings)(ctx, {}),
      () => invalidate(f, "deleted item"),
    );
    expect(embedMany.mock.calls[0][0].values).toEqual(["Surviving synthetic"]);
    expect(await f.t.run((ctx) => ctx.db.get(survivingId))).toMatchObject({
      embedding: vector,
    });
  });

  it.each([
    "removed owner",
    "deleting owner",
    "deleted item",
    "foreign item",
  ] as const)(
    "does not classify recommendations after hydrated %s",
    async (kind) => {
      const f = await fixture();
      await paused(
        f,
        "items:listReadyItemsInternal",
        (ctx) => handler(recommendForSpace)(ctx, { spaceId: f.spaceId }),
        () => invalidate(f, kind),
      );
      expect(generateObject).not.toHaveBeenCalled();
      // The earlier authorized space embedding is not recalled.
      expect(embedMany).toHaveBeenCalledOnce();
    },
  );

  it("drops a deleted candidate and renumbers surviving recommendations", async () => {
    const f = await fixture();
    const survivingId = await f.t.run((ctx) =>
      ctx.db.insert("items", {
        userId: f.userId,
        type: "note",
        status: "ready",
        title: "Surviving synthetic",
        tags: [],
        searchText: "",
      }),
    );
    await paused(
      f,
      "items:listReadyItemsInternal",
      (ctx) => handler(recommendForSpace)(ctx, { spaceId: f.spaceId }),
      () => invalidate(f, "deleted item"),
    );
    expect(generateObject.mock.calls[0][0].prompt).not.toContain(
      "Synthetic save",
    );
    expect(generateObject.mock.calls[0][0].prompt).toContain(
      "1. Surviving synthetic",
    );
    expect(
      await f.t.run((ctx) => ctx.db.query("spaceItems").collect()),
    ).toMatchObject([{ itemId: survivingId, status: "suggested" }]);
  });

  it.each(["removed", "foreign"] as const)(
    "does not classify a %s space after candidate hydration",
    async (kind) => {
      const f = await fixture();
      await paused(
        f,
        "items:listReadyItemsInternal",
        (ctx) => handler(recommendForSpace)(ctx, { spaceId: f.spaceId }),
        () =>
          f.t.run(async (ctx) => {
            if (kind === "removed") await ctx.db.delete(f.spaceId);
            else await ctx.db.patch(f.spaceId, { userId: f.foreignId });
          }),
      );
      expect(generateObject).not.toHaveBeenCalled();
    },
  );

  it("bounds recommendation validation to 100 identities", async () => {
    const f = await fixture();
    await expect(
      f.t.query(internal.spaces.survivingCandidates, {
        userId: f.userId,
        spaceId: f.spaceId,
        itemIds: Array.from({ length: 101 }, () => f.itemId),
      }),
    ).rejects.toThrow("Too many candidates");
  });

  it.each(["removed owner", "deleting owner", "space removed"] as const)(
    "does not embed a cached space after %s",
    async (kind) => {
      const f = await fixture();
      await paused(
        f,
        "spaces:recommendationContext",
        (ctx) => handler(recommendForSpace)(ctx, { spaceId: f.spaceId }),
        async () => {
          if (kind === "space removed")
            await f.t.run((ctx) => ctx.db.delete(f.spaceId));
          else await invalidate(f, kind);
        },
        1,
        true,
      );
      expect(embedMany).not.toHaveBeenCalled();
      expect(generateObject).not.toHaveBeenCalled();
    },
  );
});
