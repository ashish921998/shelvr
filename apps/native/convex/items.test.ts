// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TestConvexForDataModel } from "convex-test";
import { newConvexTest } from "./test.setup";

import { api, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { pageGone } from "./ai";
import { rateLimiter } from "./model/rateLimiter";
import {
  IMPORT_STAGGER_MS,
  LIST_PAGE_MAX,
  PROCESSING_STALE_MS,
  RECENT_ITEMS_MAX,
  STALE_IMPORT_CUTOFF_MS,
} from "./items";
import {
  MAX_PHOTOS_PER_ACCOUNT,
  PHOTO_LIMIT_MESSAGE,
} from "./model/imagePolicy";

// The accessor returned by withIdentity (no further withIdentity/registerComponent).
// Used as the shared param type for helpers that drive either a base or
// identity-scoped test backend.
type TestCtx = TestConvexForDataModel<DataModel>;

// A representative operation id (UUID-shaped, within the 8–200 char bound).
const OP_ID = "image:11111111-1111-4111-8111-111111111111";
const OP_ID_2 = "image:22222222-2222-4222-8222-222222222222";

// convex-test runs `runAfter(0, ...)` jobs via a real `setTimeout`, so the AI
// action would fire during worker teardown (`EnvironmentTeardownError`). Fake
// timers keep the jobs queued: `_scheduled_functions` rows are still written
// and assertable, but nothing executes. Leave Date and other clocks real.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

/** Seeds `count` ready link items for `userId`, oldest first, each carrying an
 * article body so a leak into the card shape is detectable. Returns ids in
 * insertion order (convex-test gives strictly increasing creation times). */
async function seedFeed(
  t: TestCtx,
  userId: string,
  count: number,
  overrides: Partial<{ status: "processing" | "ready" | "failed" }> = {},
): Promise<Id<"items">[]> {
  return await t.run(async (ctx) => {
    const ids: Id<"items">[] = [];
    for (let i = 0; i < count; i++) {
      ids.push(
        await ctx.db.insert("items", {
          userId,
          type: "link",
          status: overrides.status ?? "ready",
          title: `Save ${i}`,
          url: `https://example.com/${i}`,
          content: `Article body ${i} `.repeat(20),
          products: [{ title: "Chair", url: "https://shop.example.com/chair" }],
          productsStatus: "ready",
          tags: ["tag"],
          searchText: `save ${i}`,
        }),
      );
    }
    return ids;
  });
}

describe("listItems (installed builds)", () => {
  it("still returns every item as a full row, newest first", async () => {
    const t = await as("feed-user");
    const ids = await seedFeed(t, "feed-user", 3);

    const items = await t.query(api.items.listItems, {});
    expect(items.map((item) => item._id)).toEqual([...ids].reverse());
    // The pre-pagination detail screen read the article body off this row.
    expect(items[0].content).toContain("Article body 2");
    expect(items[0]).toHaveProperty("imageUrl");
  });

  it("only returns the caller's items", async () => {
    const backend = newConvexTest();
    const ta = backend.withIdentity({ subject: "feed-a|session-1" });
    const tb = backend.withIdentity({ subject: "feed-b|session-1" });
    const aIds = await seedFeed(ta, "feed-a", 2);
    await seedFeed(tb, "feed-b", 1);

    const mine = await ta.query(api.items.listItems, {});
    expect(mine.map((item) => item._id)).toEqual([...aIds].reverse());
  });

  it("searchItems keeps the article body on the row those builds open from", async () => {
    const t = await as("feed-user");
    const [id] = await seedFeed(t, "feed-user", 1);

    const results = await t.query(api.items.searchItems, { query: "save" });
    expect(results.map((item) => item._id)).toEqual([id]);
    // The pre-pagination detail screen renders `content` straight off this
    // row; without it, search → open shows a link with no article.
    expect(results[0].content).toContain("Article body 0");
    expect(results[0]).toHaveProperty("imageUrl");
  });
});

describe("listItemsPage", () => {
  it("pages newest-first with a working cursor and isDone on the last page", async () => {
    const t = await as("feed-user");
    const ids = await seedFeed(t, "feed-user", 5);
    const newestFirst = [...ids].reverse();

    const first = await t.query(api.items.listItemsPage, {
      paginationOpts: { numItems: 2, cursor: null },
    });
    expect(first.page.map((item) => item._id)).toEqual(newestFirst.slice(0, 2));
    expect(first.isDone).toBe(false);

    const second = await t.query(api.items.listItemsPage, {
      paginationOpts: { numItems: 2, cursor: first.continueCursor },
    });
    expect(second.page.map((item) => item._id)).toEqual(
      newestFirst.slice(2, 4),
    );
    expect(second.isDone).toBe(false);

    const third = await t.query(api.items.listItemsPage, {
      paginationOpts: { numItems: 2, cursor: second.continueCursor },
    });
    expect(third.page.map((item) => item._id)).toEqual(newestFirst.slice(4));
    expect(third.isDone).toBe(true);
  });

  it("caps the page size a client can ask for and keeps the rest reachable", async () => {
    const t = await as("feed-user");
    const ids = await seedFeed(t, "feed-user", LIST_PAGE_MAX + 3);
    const newestFirst = [...ids].reverse();

    const first = await t.query(api.items.listItemsPage, {
      paginationOpts: { numItems: 100_000, cursor: null },
    });
    expect(first.page.map((item) => item._id)).toEqual(
      newestFirst.slice(0, LIST_PAGE_MAX),
    );
    expect(first.isDone).toBe(false);

    const second = await t.query(api.items.listItemsPage, {
      paginationOpts: { numItems: 100_000, cursor: first.continueCursor },
    });
    expect(second.page.map((item) => item._id)).toEqual(
      newestFirst.slice(LIST_PAGE_MAX),
    );
    expect(second.isDone).toBe(true);
  });

  it("returns the card shape without article bodies or shopping results", async () => {
    const t = await as("feed-user");
    const [id] = await seedFeed(t, "feed-user", 1);

    const { page } = await t.query(api.items.listItemsPage, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page).toHaveLength(1);
    const row = page[0];
    expect(row._id).toBe(id);
    for (const dropped of [
      "content",
      "searchText",
      "products",
      "productsStatus",
      "userId",
    ]) {
      expect(row).not.toHaveProperty(dropped);
    }
    // What the card and the detail pager's first paint still need.
    expect(row).toMatchObject({
      type: "link",
      status: "ready",
      title: "Save 0",
      url: "https://example.com/0",
      tags: ["tag"],
      imageUrl: null,
    });
    expect(typeof row._creationTime).toBe("number");

    // The full document is still one getItem away.
    const full = await t.query(api.items.getItem, { id });
    expect(full?.content).toContain("Article body 0");
    expect(full?.products).toHaveLength(1);
  });

  it("only returns the caller's items", async () => {
    // One shared backend, so the userId scope — not database isolation — is
    // what keeps the two feeds apart.
    const backend = newConvexTest();
    const ta = backend.withIdentity({ subject: "feed-a|session-1" });
    const tb = backend.withIdentity({ subject: "feed-b|session-1" });
    const aIds = await seedFeed(ta, "feed-a", 2);
    const bIds = await seedFeed(tb, "feed-b", 3);

    const mine = await ta.query(api.items.listItemsPage, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(mine.page.map((item) => item._id)).toEqual([...aIds].reverse());
    expect(mine.isDone).toBe(true);

    const theirs = await tb.query(api.items.listItemsPage, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(theirs.page.map((item) => item._id)).toEqual([...bIds].reverse());
  });

  it("rejects unauthenticated callers", async () => {
    const t = newConvexTest();
    await expect(
      t.query(api.items.listItemsPage, {
        paginationOpts: { numItems: 10, cursor: null },
      }),
    ).rejects.toThrow("Not authenticated");
  });
});

describe("listRecentItems", () => {
  it("returns the newest ready items up to the limit, skipping unready ones", async () => {
    const t = await as("recent-user");
    const older = await seedFeed(t, "recent-user", 3);
    const pending = await seedFeed(t, "recent-user", 1, {
      status: "processing",
    });
    const failed = await seedFeed(t, "recent-user", 1, { status: "failed" });

    const recent = await t.query(api.items.listRecentItems, { limit: 2 });
    expect(recent.map((item) => item._id)).toEqual([older[2], older[1]]);
    expect(recent.map((item) => item._id)).not.toContain(pending[0]);
    expect(recent.map((item) => item._id)).not.toContain(failed[0]);
    expect(recent[0]).not.toHaveProperty("content");
  });

  it("finds older ready items behind a burst of newer processing ones", async () => {
    const t = await as("recent-user");
    const ready = await seedFeed(t, "recent-user", 3);
    // A bulk photo import: far more fresh processing rows than any fixed
    // window would cover. The widget must still show the older ready saves.
    await seedFeed(t, "recent-user", 30, { status: "processing" });

    const recent = await t.query(api.items.listRecentItems, { limit: 5 });
    expect(recent.map((item) => item._id)).toEqual([
      ready[2],
      ready[1],
      ready[0],
    ]);
  });

  it("finds a ready item behind any number of newer failed ones", async () => {
    const t = await as("recent-user");
    const ready = await seedFeed(t, "recent-user", 1);
    await seedFeed(t, "recent-user", 200, { status: "failed" });

    const recent = await t.query(api.items.listRecentItems, { limit: 5 });
    expect(recent.map((item) => item._id)).toEqual([ready[0]]);
  });

  it("caps the limit and scopes to the caller", async () => {
    const t = await as("recent-user");
    await seedFeed(t, "recent-user", RECENT_ITEMS_MAX + 5);
    await seedFeed(t, "someone-else", 2);

    const capped = await t.query(api.items.listRecentItems, { limit: 1000 });
    expect(capped).toHaveLength(RECENT_ITEMS_MAX);
    expect(capped.every((item) => item.title?.startsWith("Save "))).toBe(true);

    // A non-positive or fractional limit still yields at least one item.
    expect(await t.query(api.items.listRecentItems, { limit: 0 })).toHaveLength(
      1,
    );
  });
});

describe("listLocatedItems", () => {
  it("returns only the caller's photos that carry coordinates", async () => {
    const t = await as("map-user");
    const { located, unlocated } = await t.run(async (ctx) => {
      const located = await ctx.db.insert("items", {
        userId: "map-user",
        type: "image",
        status: "ready",
        title: "Belém Tower",
        latitude: 38.6916,
        longitude: -9.216,
        tags: [],
        searchText: "",
      });
      const unlocated = await ctx.db.insert("items", {
        userId: "map-user",
        type: "image",
        status: "ready",
        tags: [],
        searchText: "",
      });
      await ctx.db.insert("items", {
        userId: "other-user",
        type: "image",
        status: "ready",
        latitude: 1,
        longitude: 1,
        tags: [],
        searchText: "",
      });
      return { located, unlocated };
    });

    const markers = await t.query(api.items.listLocatedItems, {});
    expect(markers).toEqual([
      {
        _id: located,
        title: "Belém Tower",
        latitude: 38.6916,
        longitude: -9.216,
        imageUrl: null,
      },
    ]);
    expect(markers.map((m) => m._id)).not.toContain(unlocated);
  });
});

describe("canonical save telemetry", () => {
  it("schedules one event per item, keeps the original session on retry, and excludes content", async () => {
    const t = await as("telemetry-user");
    const itemId = await t.mutation(api.items.createNoteItem, {
      text: "Private note",
      operationId: "note:telemetry-1",
      analyticsSessionId: "save-session",
    });
    const retry = await t.mutation(api.items.createNoteItem, {
      text: "Private note",
      operationId: "note:telemetry-1",
      analyticsSessionId: "later-session",
    });
    expect(retry).toBe(itemId);
    const { item, jobs } = await t.run(async (ctx) => ({
      item: await ctx.db.get(itemId),
      jobs: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    const telemetry = jobs.filter(
      (job) => job.name === "analytics:captureSave",
    );
    expect(telemetry).toHaveLength(1);
    expect(telemetry[0].args).toEqual([
      {
        itemId,
        userId: "telemetry-user",
        itemType: "note",
        savedAt: item?._creationTime,
        sessionId: "save-session",
      },
    ]);
  });

  it("tracks link and image saves while remaining compatible with old clients", async () => {
    const t = await as("telemetry-user");
    const linkId = await t.mutation(api.items.createLinkItem, {
      url: "https://example.com",
    });
    await t.mutation(api.items.beginImageImport, { operationId: OP_ID });
    const storageId = await storeBlob(t);
    await t.mutation(api.items.attachImageUpload, {
      operationId: OP_ID,
      storageId,
    });
    const imageId = await t.mutation(api.items.finalizeImageImport, {
      operationId: OP_ID,
      analyticsSessionId: "image-session",
    });
    await t.mutation(api.items.finalizeImageImport, {
      operationId: OP_ID,
      analyticsSessionId: "retry-session",
    });
    const jobs = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    const telemetry = jobs.filter(
      (job) => job.name === "analytics:captureSave",
    );
    expect(telemetry).toHaveLength(2);
    expect(telemetry.map((job) => job.args[0])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemId: linkId, itemType: "link" }),
        // The 4-byte blob from storeBlob; photo_count is the account total after this save.
        expect.objectContaining({
          itemId: imageId,
          itemType: "image",
          sessionId: "image-session",
          photoCount: 1,
          storedBytes: 4,
        }),
      ]),
    );
    expect(
      telemetry.find((job) => job.args[0].itemType === "link")?.args[0],
    ).not.toHaveProperty("photoCount");
  });
});

// Each test gets its own authenticated user via withIdentity. subject is the
// value requireUserId returns, so different subjects model different users.
// Every save and Pro mutation is gated behind an active subscription, so `as`
// seeds an active Pro row for the user — the existing tests model the entitled
// (paying) path. The lapsed/not-entitled path is covered by the gating tests
// further down.
async function as(userId: string): Promise<TestCtx> {
  const t = newConvexTest().withIdentity({
    subject: `${userId}|session-1`,
  });
  await seedPro(t, userId);
  return t;
}

/** Insert an active Pro subscription for `userId` so gated mutations succeed.
 * Idempotent: if a row already exists it is patched, otherwise a new one is
 * inserted — so calling `seedPro` twice (e.g. in a shared helper) doesn't
 * violate the `by_user` unique index. */
async function seedPro(t: TestCtx, userId: string): Promise<void> {
  await t.run(async (ctx) => {
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const fields = {
      status: "pro" as const,
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
      updatedAt: Date.now(),
    };
    if (existing !== null) {
      await ctx.db.patch(existing._id, fields);
    } else {
      await ctx.db.insert("subscriptions", { userId, ...fields });
    }
  });
}

/** Uploads a blob to mock storage and returns its id, the way a real client
 * would after POSTing to the upload URL begin returns. */
async function storeBlob(t: TestCtx): Promise<Id<"_storage">> {
  return await t.run(async (ctx) => {
    return await ctx.storage.store(
      new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])]),
    );
  });
}

describe("photo quota", () => {
  it("refuses a new photo at the cap, reports usage, and frees the slot on delete", async () => {
    const t = await as("user-a");
    // Fill the account to one under the cap, then take the last slot for real.
    await t.run(async (ctx) => {
      for (let i = 0; i < MAX_PHOTOS_PER_ACCOUNT - 1; i++) {
        await ctx.db.insert("items", {
          userId: "user-a",
          type: "image",
          status: "ready",
          tags: [],
          searchText: "",
        });
      }
      // Links and notes never count.
      await ctx.db.insert("items", {
        userId: "user-a",
        type: "link",
        status: "ready",
        tags: [],
        searchText: "",
      });
    });
    await t.mutation(api.items.beginImageImport, { operationId: OP_ID });
    await t.mutation(api.items.attachImageUpload, {
      operationId: OP_ID,
      storageId: await storeBlob(t),
    });
    const lastId = await t.mutation(api.items.finalizeImageImport, {
      operationId: OP_ID,
    });
    expect(await t.query(api.items.photoUsage, {})).toEqual({
      count: MAX_PHOTOS_PER_ACCOUNT,
      limit: MAX_PHOTOS_PER_ACCOUNT,
    });

    await expect(
      t.mutation(api.items.beginImageImport, { operationId: OP_ID_2 }),
    ).rejects.toThrow(PHOTO_LIMIT_MESSAGE);
    // A completed operation still returns its item to a full account.
    expect(
      await t.mutation(api.items.finalizeImageImport, { operationId: OP_ID }),
    ).toBe(lastId);

    await t.mutation(api.items.deleteItem, { id: lastId });
    expect((await t.query(api.items.photoUsage, {})).count).toBe(
      MAX_PHOTOS_PER_ACCOUNT - 1,
    );
    expect(
      (await t.mutation(api.items.beginImageImport, { operationId: OP_ID_2 }))
        .kind,
    ).toBe("upload");
  });
});

describe("image import lifecycle", () => {
  it("finalizes a pending operation into one item and schedules processing", async () => {
    const t = await as("user-a");
    const begin = await t.mutation(api.items.beginImageImport, {
      operationId: OP_ID,
    });
    expect(begin.kind).toBe("upload");

    const storageId = await storeBlob(t);
    await t.mutation(api.items.attachImageUpload, {
      operationId: OP_ID,
      storageId,
    });
    const itemId = await t.mutation(api.items.finalizeImageImport, {
      operationId: OP_ID,
    });
    expect(typeof itemId).toBe("string");

    // The scheduled AI job is queued; verify the item landed as processing.
    const op = await t.query(api.items.getImportOperation, {
      operationId: OP_ID,
    });
    expect(op?.status).toBe("complete");
    expect(op?.itemId).toBe(itemId);
    expect(op?.storageId).toBe(storageId);

    const item = await t.run(async (ctx) => await ctx.db.get(itemId));
    expect(item?.type).toBe("image");
    expect(item?.status).toBe("processing");
    expect(item?.storageId).toBe(storageId);
  });

  it("returns the same item when begin/finalize repeat the same operation", async () => {
    const t = await as("user-a");
    await t.mutation(api.items.beginImageImport, { operationId: OP_ID });
    const storageId = await storeBlob(t);
    await t.mutation(api.items.attachImageUpload, {
      operationId: OP_ID,
      storageId,
    });
    const firstId = await t.mutation(api.items.finalizeImageImport, {
      operationId: OP_ID,
    });

    // A retry that begins the same completed operation should get the item back
    // without needing to re-upload.
    const began = await t.mutation(api.items.beginImageImport, {
      operationId: OP_ID,
    });
    expect(began).toEqual({ kind: "complete", itemId: firstId });

    // Finalizing again returns the same id, never a second item.
    const secondId = await t.mutation(api.items.finalizeImageImport, {
      operationId: OP_ID,
    });
    expect(secondId).toBe(firstId);

    // Exactly one image item exists for this user.
    const items = await t.run(async (ctx) => {
      return await ctx.db
        .query("items")
        .withIndex("by_user", (q) => q.eq("userId", "user-a"))
        .collect();
    });
    expect(items.filter((i) => i.type === "image")).toHaveLength(1);
  });

  it("keeps the same operation id independent across users", async () => {
    // Both users must operate against ONE shared backend so the (userId,
    // operationId) pair — not database isolation — is what distinguishes them.
    const backend = newConvexTest();
    const ta = backend.withIdentity({ subject: "user-a" });
    const tb = backend.withIdentity({ subject: "user-b" });
    await seedPro(ta, "user-a");
    await seedPro(tb, "user-b");

    // user-a finalizes the operation.
    await ta.mutation(api.items.beginImageImport, { operationId: OP_ID });
    const sa = await storeBlob(ta);
    await ta.mutation(api.items.attachImageUpload, {
      operationId: OP_ID,
      storageId: sa,
    });
    const aId = await ta.mutation(api.items.finalizeImageImport, {
      operationId: OP_ID,
    });

    // user-b using the same operation id is a separate operation and a separate
    // item — the (userId, operationId) pair is the unique key.
    await tb.mutation(api.items.beginImageImport, { operationId: OP_ID });
    const sb = await storeBlob(tb);
    await tb.mutation(api.items.attachImageUpload, {
      operationId: OP_ID,
      storageId: sb,
    });
    const bId = await tb.mutation(api.items.finalizeImageImport, {
      operationId: OP_ID,
    });
    expect(bId).not.toBe(aId);

    const opA = await ta.query(api.items.getImportOperation, {
      operationId: OP_ID,
    });
    const opB = await tb.query(api.items.getImportOperation, {
      operationId: OP_ID,
    });
    expect(opA?.itemId).toBe(aId);
    expect(opB?.itemId).toBe(bId);
  });

  it("returns the completed itemId to a lapsed user without checking Pro", async () => {
    // A user who saved an image while Pro, then lapsed, must still retrieve
    // the completed itemId — the idempotent read path is not gated on Pro.
    const t = await as("user-a");
    await t.mutation(api.items.beginImageImport, { operationId: OP_ID });
    const storageId = await storeBlob(t);
    await t.mutation(api.items.attachImageUpload, {
      operationId: OP_ID,
      storageId,
    });
    const itemId = await t.mutation(api.items.finalizeImageImport, {
      operationId: OP_ID,
    });

    // Lapse the subscription.
    await t.run(async (ctx) => {
      const sub = await ctx.db
        .query("subscriptions")
        .withIndex("by_user", (q) => q.eq("userId", "user-a"))
        .unique();
      if (sub) {
        await ctx.db.patch(sub._id, {
          status: "lapsed",
          expiresAt: Date.now() - 1000,
        });
      }
    });

    // begin returns the completed itemId without throwing Pro required.
    const began = await t.mutation(api.items.beginImageImport, {
      operationId: OP_ID,
    });
    expect(began).toEqual({ kind: "complete", itemId });

    // finalize also returns the same id without throwing.
    const again = await t.mutation(api.items.finalizeImageImport, {
      operationId: OP_ID,
    });
    expect(again).toBe(itemId);
  });

  it("rejects reusing an operation id with a different kind", async () => {
    // Seed a completed image operation directly.
    const t = await as("user-a");
    await t.run(async (ctx) => {
      await ctx.db.insert("itemOperations", {
        userId: "user-a",
        operationId: OP_ID,
        kind: "image",
        status: "complete",
        updatedAt: Date.now(),
      });
    });

    // beginImageImport loads with kind "image" by default; a future link/note
    // flow (plan 004) would load with a different kind and must be rejected.
    // Simulate that by checking the helper's contract through the image path:
    // a second image operation with the same id is fine, but we assert a kind
    // mismatch throws when an op exists as a different kind.
    await t.run(async (ctx) => {
      const op = await ctx.db
        .query("itemOperations")
        .withIndex("by_user_operation", (q) =>
          q.eq("userId", "user-a").eq("operationId", OP_ID),
        )
        .unique();
      if (op === null) throw new Error("seed op missing");
      await ctx.db.patch(op._id, { kind: "link" });
    });
    await expect(
      t.mutation(api.items.beginImageImport, { operationId: OP_ID }),
    ).rejects.toThrow(/kind mismatch/i);
  });

  it("keeps one canonical storage id and discards a redundant attachment", async () => {
    const t = await as("user-a");
    await t.mutation(api.items.beginImageImport, { operationId: OP_ID });
    const first = await storeBlob(t);
    const second = await storeBlob(t);

    const r1 = await t.mutation(api.items.attachImageUpload, {
      operationId: OP_ID,
      storageId: first,
    });
    expect(r1).toEqual({ storageId: first });

    // A racing retry attaches a different storage id; first attachment wins and
    // the redundant blob is deleted.
    const r2 = await t.mutation(api.items.attachImageUpload, {
      operationId: OP_ID,
      storageId: second,
    });
    expect(r2).toEqual({ storageId: first });

    // The redundant blob is gone; the canonical one survives.
    const secondGone = await t.run(async (ctx) =>
      ctx.db.system.get("_storage", second),
    );
    expect(secondGone).toBeNull();
    const firstAlive = await t.run(async (ctx) =>
      ctx.db.system.get("_storage", first),
    );
    expect(firstAlive).not.toBeNull();

    // Finalize uses the canonical storage id.
    const itemId = await t.mutation(api.items.finalizeImageImport, {
      operationId: OP_ID,
    });
    const item = await t.run(async (ctx) => await ctx.db.get(itemId));
    expect(item?.storageId).toBe(first);
  });

  it("does not mark the operation complete on invalid metadata", async () => {
    const t = await as("user-a");
    await t.mutation(api.items.beginImageImport, { operationId: OP_ID });
    const storageId = await storeBlob(t);
    await t.mutation(api.items.attachImageUpload, {
      operationId: OP_ID,
      storageId,
    });

    // An impossible aspect ratio must throw and must NOT complete the operation.
    await expect(
      t.mutation(api.items.finalizeImageImport, {
        operationId: OP_ID,
        aspectRatio: -1,
      }),
    ).rejects.toThrow(/aspectRatio/i);

    const op = await t.query(api.items.getImportOperation, {
      operationId: OP_ID,
    });
    expect(op?.status).toBe("pending");

    // A corrected retry can still succeed.
    const itemId = await t.mutation(api.items.finalizeImageImport, {
      operationId: OP_ID,
      aspectRatio: 1.5,
    });
    const opAfter = await t.query(api.items.getImportOperation, {
      operationId: OP_ID,
    });
    expect(opAfter?.status).toBe("complete");
    expect(opAfter?.itemId).toBe(itemId);
  });

  it("releases the operation when its item is explicitly deleted", async () => {
    const t = await as("user-a");
    await t.mutation(api.items.beginImageImport, { operationId: OP_ID });
    const storageId = await storeBlob(t);
    await t.mutation(api.items.attachImageUpload, {
      operationId: OP_ID,
      storageId,
    });
    const itemId = await t.mutation(api.items.finalizeImageImport, {
      operationId: OP_ID,
    });

    await t.mutation(api.items.deleteItem, { id: itemId });

    // The operation row is gone, so the durable id can be re-performed.
    const op = await t.query(api.items.getImportOperation, {
      operationId: OP_ID,
    });
    expect(op).toBeNull();

    // begin now treats it as a fresh operation (pending + new upload), not the
    // deleted item.
    const began = await t.mutation(api.items.beginImageImport, {
      operationId: OP_ID,
    });
    expect(began.kind).toBe("upload");
  });

  it("deletes only eligible unreferenced stale pending uploads", async () => {
    const t = await as("user-a");

    // A stale pending operation with an attached upload (process died between
    // upload and finalize). Its storage should be swept.
    const staleStorageId = await storeBlob(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("itemOperations", {
        userId: "user-a",
        operationId: OP_ID,
        kind: "image",
        status: "pending",
        storageId: staleStorageId,
        // One hour past the staleness cutoff.
        updatedAt: Date.now() - STALE_IMPORT_CUTOFF_MS - 60 * 60 * 1000,
      });
    });

    // A fresh pending operation (well within the 24h window) — must survive.
    const freshStorageId = await storeBlob(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("itemOperations", {
        userId: "user-a",
        operationId: OP_ID_2,
        kind: "image",
        status: "pending",
        storageId: freshStorageId,
        updatedAt: Date.now(),
      });
    });

    await t.mutation(internal.items.cleanupStaleImageImports, {});

    // Stale op + its blob are gone.
    const staleOp = await t.query(api.items.getImportOperation, {
      operationId: OP_ID,
    });
    expect(staleOp).toBeNull();
    const staleBlob = await t.run(async (ctx) =>
      ctx.db.system.get("_storage", staleStorageId),
    );
    expect(staleBlob).toBeNull();

    // Fresh op + its blob survive.
    const freshOp = await t.query(api.items.getImportOperation, {
      operationId: OP_ID_2,
    });
    expect(freshOp?.status).toBe("pending");
    const freshBlob = await t.run(async (ctx) =>
      ctx.db.system.get("_storage", freshStorageId),
    );
    expect(freshBlob).not.toBeNull();
  });

  it("refuses to adopt or delete a storage id referenced by a completed item", async () => {
    // A completed image for user-a with its own storage object.
    const ta = await as("user-a");
    await ta.mutation(api.items.beginImageImport, { operationId: OP_ID });
    const victimStorageId = await storeBlob(ta);
    await ta.mutation(api.items.attachImageUpload, {
      operationId: OP_ID,
      storageId: victimStorageId,
    });
    await ta.mutation(api.items.finalizeImageImport, { operationId: OP_ID });

    // A malicious/buggy second operation tries to attach victimStorageId (which
    // is already referenced by user-a's completed item). attach must REJECT it
    // rather than adopt it — otherwise finalize/deleteItem could delete the
    // victim's storage. Defense: only unreferenced storage is adoptable.
    await ta.mutation(api.items.beginImageImport, { operationId: OP_ID_2 });
    await expect(
      ta.mutation(api.items.attachImageUpload, {
        operationId: OP_ID_2,
        storageId: victimStorageId,
      }),
    ).rejects.toThrow(/already in use/i);

    // The victim blob is intact (not deleted by the rejected attach).
    const victimAlive = await ta.run(async (ctx) =>
      ctx.db.system.get("_storage", victimStorageId),
    );
    expect(victimAlive).not.toBeNull();
  });

  it("returns the existing item when finalizing an already-complete op even with bad resubmitted metadata", async () => {
    const t = await as("user-a");
    await t.mutation(api.items.beginImageImport, { operationId: OP_ID });
    const storageId = await storeBlob(t);
    await t.mutation(api.items.attachImageUpload, {
      operationId: OP_ID,
      storageId,
    });
    const firstId = await t.mutation(api.items.finalizeImageImport, {
      operationId: OP_ID,
      aspectRatio: 1.5,
    });

    // A retry that resends an impossible aspectRatio must still return the
    // existing item — the idempotent read path is not gated on re-validation.
    const retriedId = await t.mutation(api.items.finalizeImageImport, {
      operationId: OP_ID,
      aspectRatio: -1,
    });
    expect(retriedId).toBe(firstId);
  });

  it("deletes the redundant re-upload when attach lands on an already-complete op", async () => {
    // The headline retry race: the original attempt finalizes while a retry's
    // re-upload is in flight. The retry's attach must return the canonical id
    // AND delete its own redundant blob — nothing else references it, so the
    // pending-only cleanup cron would otherwise never reclaim it.
    const t = await as("user-a");
    await t.mutation(api.items.beginImageImport, { operationId: OP_ID });
    const canonical = await storeBlob(t);
    await t.mutation(api.items.attachImageUpload, {
      operationId: OP_ID,
      storageId: canonical,
    });
    await t.mutation(api.items.finalizeImageImport, { operationId: OP_ID });

    const redundant = await storeBlob(t);
    const result = await t.mutation(api.items.attachImageUpload, {
      operationId: OP_ID,
      storageId: redundant,
    });
    expect(result).toEqual({ storageId: canonical });

    const redundantGone = await t.run(async (ctx) =>
      ctx.db.system.get("_storage", redundant),
    );
    expect(redundantGone).toBeNull();
    const canonicalAlive = await t.run(async (ctx) =>
      ctx.db.system.get("_storage", canonical),
    );
    expect(canonicalAlive).not.toBeNull();
  });

  it("refuses to adopt a storage id another pending operation holds", async () => {
    // Double-adopt defense: without the itemOperations check, one blob could
    // back two operations, finalize into two items sharing it, and be deleted
    // out from under the survivor when either item is deleted.
    const t = await as("user-a");
    await t.mutation(api.items.beginImageImport, { operationId: OP_ID });
    const storageId = await storeBlob(t);
    await t.mutation(api.items.attachImageUpload, {
      operationId: OP_ID,
      storageId,
    });

    await t.mutation(api.items.beginImageImport, { operationId: OP_ID_2 });
    await expect(
      t.mutation(api.items.attachImageUpload, {
        operationId: OP_ID_2,
        storageId,
      }),
    ).rejects.toThrow(/already in use/i);

    // The first operation's pending upload is intact.
    const blobAlive = await t.run(async (ctx) =>
      ctx.db.system.get("_storage", storageId),
    );
    expect(blobAlive).not.toBeNull();
  });

  it("rejects attaching a storage id that does not exist", async () => {
    // A swept blob's id must not become an item with a permanently dead image.
    const t = await as("user-a");
    const storageId = await storeBlob(t);
    await t.run(async (ctx) => {
      await ctx.storage.delete(storageId);
    });
    await t.mutation(api.items.beginImageImport, { operationId: OP_ID });
    await expect(
      t.mutation(api.items.attachImageUpload, {
        operationId: OP_ID,
        storageId,
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("never deletes a blob a live item references, even from a stale pending row", async () => {
    // Inconsistent-but-possible state: a stale pending row holds a storageId
    // that a live item also references. The sweep must drop only the ledger
    // row and leave the blob alone.
    const t = await as("user-a");
    const storageId = await storeBlob(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("items", {
        userId: "user-a",
        type: "image",
        status: "ready",
        storageId,
        tags: [],
        searchText: "",
      });
      await ctx.db.insert("itemOperations", {
        userId: "user-a",
        operationId: OP_ID,
        kind: "image",
        status: "pending",
        storageId,
        updatedAt: Date.now() - STALE_IMPORT_CUTOFF_MS - 60 * 60 * 1000,
      });
    });

    await t.mutation(internal.items.cleanupStaleImageImports, {});

    const op = await t.query(api.items.getImportOperation, {
      operationId: OP_ID,
    });
    expect(op).toBeNull();
    const blobAlive = await t.run(async (ctx) =>
      ctx.db.system.get("_storage", storageId),
    );
    expect(blobAlive).not.toBeNull();
  });

  it("sweeps stale image rows even when stale non-image rows exist", async () => {
    // The kind-first index means link/note rows (plans 004/005) can never fill
    // the sweep page and starve image cleanup.
    const t = await as("user-a");
    const staleAt = Date.now() - STALE_IMPORT_CUTOFF_MS - 60 * 60 * 1000;
    const imageBlob = await storeBlob(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("itemOperations", {
        userId: "user-a",
        operationId: "link:stale-operation",
        kind: "link",
        status: "pending",
        updatedAt: staleAt,
      });
      await ctx.db.insert("itemOperations", {
        userId: "user-a",
        operationId: OP_ID,
        kind: "image",
        status: "pending",
        storageId: imageBlob,
        updatedAt: staleAt,
      });
    });

    await t.mutation(internal.items.cleanupStaleImageImports, {});

    // The image row and its blob are swept; the link row is left to its owner.
    const imageOp = await t.query(api.items.getImportOperation, {
      operationId: OP_ID,
    });
    expect(imageOp).toBeNull();
    const blobGone = await t.run(async (ctx) =>
      ctx.db.system.get("_storage", imageBlob),
    );
    expect(blobGone).toBeNull();
    const linkOp = await t.query(api.items.getImportOperation, {
      operationId: "link:stale-operation",
    });
    expect(linkOp?.status).toBe("pending");
  });

  it("recycles a complete op whose item is gone and releases its orphaned blob", async () => {
    // Seed the inconsistent state directly (an item deleted NOT via deleteItem,
    // which would have released the row): begin must reset the row to pending,
    // delete the orphaned blob, and hand back a fresh upload URL.
    const t = await as("user-a");
    const storageId = await storeBlob(t);
    const deadItemId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("items", {
        userId: "user-a",
        type: "image",
        status: "ready",
        storageId,
        tags: [],
        searchText: "",
      });
      await ctx.db.delete(id);
      return id;
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("itemOperations", {
        userId: "user-a",
        operationId: OP_ID,
        kind: "image",
        status: "complete",
        storageId,
        itemId: deadItemId,
        updatedAt: Date.now(),
      });
    });

    const began = await t.mutation(api.items.beginImageImport, {
      operationId: OP_ID,
    });
    expect(began.kind).toBe("upload");

    const op = await t.query(api.items.getImportOperation, {
      operationId: OP_ID,
    });
    expect(op?.status).toBe("pending");
    expect(op?.storageId).toBeUndefined();
    const blobGone = await t.run(async (ctx) =>
      ctx.db.system.get("_storage", storageId),
    );
    expect(blobGone).toBeNull();
  });

  it("recycles an inconsistent complete op (no itemId) and clears its stale storageId", async () => {
    // Defensive branch: a complete row with no itemId. Recycling must clear
    // the stale storageId — left in place, attach would treat it as canonical
    // and delete the fresh re-upload as "redundant".
    const t = await as("user-a");
    const staleBlob = await storeBlob(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("itemOperations", {
        userId: "user-a",
        operationId: OP_ID,
        kind: "image",
        status: "complete",
        storageId: staleBlob,
        updatedAt: Date.now(),
      });
    });

    const began = await t.mutation(api.items.beginImageImport, {
      operationId: OP_ID,
    });
    expect(began.kind).toBe("upload");
    const op = await t.query(api.items.getImportOperation, {
      operationId: OP_ID,
    });
    expect(op?.status).toBe("pending");
    expect(op?.storageId).toBeUndefined();

    // A fresh upload then attaches and finalizes normally.
    const freshBlob = await storeBlob(t);
    await t.mutation(api.items.attachImageUpload, {
      operationId: OP_ID,
      storageId: freshBlob,
    });
    const itemId = await t.mutation(api.items.finalizeImageImport, {
      operationId: OP_ID,
    });
    const item = await t.run(async (ctx) => await ctx.db.get(itemId));
    expect(item?.storageId).toBe(freshBlob);
  });

  it("rejects operation ids outside the allowed length bounds", async () => {
    const t = await as("user-a");
    await expect(
      t.mutation(api.items.beginImageImport, { operationId: "short" }),
    ).rejects.toThrow(/Invalid operationId/i);
    await expect(
      t.mutation(api.items.beginImageImport, {
        operationId: "x".repeat(201),
      }),
    ).rejects.toThrow(/Invalid operationId/i);
  });

  it("rejects finalize when the operation was never begun or never attached", async () => {
    const t = await as("user-a");
    // Never begun.
    await expect(
      t.mutation(api.items.finalizeImageImport, { operationId: OP_ID }),
    ).rejects.toThrow(/no attached upload/i);

    // Begun but never attached (process died between upload and attach). The
    // op must stay pending so a later attach + finalize can still succeed.
    await t.mutation(api.items.beginImageImport, { operationId: OP_ID_2 });
    await expect(
      t.mutation(api.items.finalizeImageImport, { operationId: OP_ID_2 }),
    ).rejects.toThrow(/no attached upload/i);
    const op = await t.query(api.items.getImportOperation, {
      operationId: OP_ID_2,
    });
    expect(op?.status).toBe("pending");
  });

  it("rejects unauthenticated callers on every import entry point", async () => {
    const t = newConvexTest();
    await expect(
      t.mutation(api.items.beginImageImport, { operationId: OP_ID }),
    ).rejects.toThrow();
    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob([new Uint8Array([1])])),
    );
    await expect(
      t.mutation(api.items.attachImageUpload, {
        operationId: OP_ID,
        storageId,
      }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.items.finalizeImageImport, { operationId: OP_ID }),
    ).rejects.toThrow();
    await expect(
      t.query(api.items.getImportOperation, { operationId: OP_ID }),
    ).rejects.toThrow();
  });
});

// Plan 004: shared links and notes use the same operation ledger as images so
// a share retry never duplicates a saved link/note and never resubmits one.
// These IDs are deliberately distinct from the image OP_* ids above so a cross-
// kind mismatch test can reuse the (userId, operationId) namespace cleanly.
const LINK_OP = "link:33333333-3333-4333-8333-333333333333";
const NOTE_OP = "note:44444444-4444-4444-8444-444444444444";

describe("shared link/note operation idempotency", () => {
  it("creates one link for a repeated shared operation and returns the same id", async () => {
    const t = await as("user-a");
    const firstId = await t.mutation(api.items.createLinkItem, {
      url: "example.com/share",
      operationId: LINK_OP,
    });
    const secondId = await t.mutation(api.items.createLinkItem, {
      url: "example.com/share",
      operationId: LINK_OP,
    });
    expect(secondId).toBe(firstId);

    // Exactly one link item exists for this user.
    const items = await t.run(async (ctx) => {
      return await ctx.db
        .query("items")
        .withIndex("by_user", (q) => q.eq("userId", "user-a"))
        .collect();
    });
    expect(items.filter((i) => i.type === "link")).toHaveLength(1);
  });

  it("creates one note for a repeated shared operation and returns the same id", async () => {
    const t = await as("user-a");
    const firstId = await t.mutation(api.items.createNoteItem, {
      text: "shared note",
      operationId: NOTE_OP,
    });
    const secondId = await t.mutation(api.items.createNoteItem, {
      text: "shared note",
      operationId: NOTE_OP,
    });
    expect(secondId).toBe(firstId);

    const items = await t.run(async (ctx) => {
      return await ctx.db
        .query("items")
        .withIndex("by_user", (q) => q.eq("userId", "user-a"))
        .collect();
    });
    expect(items.filter((i) => i.type === "note")).toHaveLength(1);
  });

  it("rejects reusing a link operation id for a note (kind mismatch)", async () => {
    const t = await as("user-a");
    await t.mutation(api.items.createLinkItem, {
      url: "example.com/kind",
      operationId: LINK_OP,
    });
    await expect(
      t.mutation(api.items.createNoteItem, {
        text: "wrong kind",
        operationId: LINK_OP,
      }),
    ).rejects.toThrow(/kind mismatch/i);
  });

  it("rejects reusing an image operation id for a link", async () => {
    // Seed a completed image operation directly, then attempt a link create with
    // the same operation id — the kind guard must reject it.
    const t = await as("user-a");
    await t.run(async (ctx) => {
      await ctx.db.insert("itemOperations", {
        userId: "user-a",
        operationId: LINK_OP,
        kind: "image",
        status: "complete",
        updatedAt: Date.now(),
      });
    });
    await expect(
      t.mutation(api.items.createLinkItem, {
        url: "example.com/clash",
        operationId: LINK_OP,
      }),
    ).rejects.toThrow(/kind mismatch/i);
  });

  it("isolates the same operation id across users", async () => {
    const backend = newConvexTest();
    const ta = backend.withIdentity({ subject: "user-a" });
    const tb = backend.withIdentity({ subject: "user-b" });
    await seedPro(ta, "user-a");
    await seedPro(tb, "user-b");

    const aId = await ta.mutation(api.items.createLinkItem, {
      url: "example.com/shared",
      operationId: LINK_OP,
    });
    const bId = await tb.mutation(api.items.createLinkItem, {
      url: "example.com/shared",
      operationId: LINK_OP,
    });
    expect(bId).not.toBe(aId);

    // Each user has their own link item.
    const aItems = await ta.run(async (ctx) =>
      ctx.db
        .query("items")
        .withIndex("by_user", (q) => q.eq("userId", "user-a"))
        .collect(),
    );
    const bItems = await tb.run(async (ctx) =>
      ctx.db
        .query("items")
        .withIndex("by_user", (q) => q.eq("userId", "user-b"))
        .collect(),
    );
    expect(aItems.filter((i) => i.type === "link")).toHaveLength(1);
    expect(bItems.filter((i) => i.type === "link")).toHaveLength(1);
  });

  it("creates two intentional items for identical content under distinct operations", async () => {
    // Idempotency is per-operation, never per-content: the same URL shared twice
    // (different share sessions) is two deliberate saves, not a deduplicated one.
    const t = await as("user-a");
    const firstId = await t.mutation(api.items.createLinkItem, {
      url: "example.com/dup",
      operationId: "link:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    const secondId = await t.mutation(api.items.createLinkItem, {
      url: "example.com/dup",
      operationId: "link:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
    expect(secondId).not.toBe(firstId);

    const items = await t.run(async (ctx) => {
      return await ctx.db
        .query("items")
        .withIndex("by_user", (q) => q.eq("userId", "user-a"))
        .collect();
    });
    expect(items.filter((i) => i.type === "link")).toHaveLength(2);
  });

  it("still creates a fresh item when no operation id is given (Add UI path)", async () => {
    const t = await as("user-a");
    const firstId = await t.mutation(api.items.createLinkItem, {
      url: "example.com/add",
    });
    const secondId = await t.mutation(api.items.createLinkItem, {
      url: "example.com/add",
    });
    expect(secondId).not.toBe(firstId);

    // No ledger rows are written on the non-idempotent path.
    const ops = await t.run(async (ctx) =>
      ctx.db.query("itemOperations").collect(),
    );
    expect(ops).toHaveLength(0);
  });

  it("schedules processItem exactly once per link/note create, on both paths", async () => {
    // Regression: the operation-guarded path used to call insertLinkOrNote
    // (which schedules processItem) AND then schedule processItem again itself,
    // running the AI pipeline twice and racing two concurrent classifications.
    // Both the guarded (operationId) and ordinary paths must schedule exactly
    // one processItem job for the created item — no more.
    const t = await as("user-a");

    // Guarded path (share flow).
    const guardedId = await t.mutation(api.items.createLinkItem, {
      url: "example.com/guarded",
      operationId: LINK_OP,
    });
    // Ordinary path (Add UI).
    const plainId = await t.mutation(api.items.createNoteItem, {
      text: "plain note",
    });

    const scheduled = await t.run(async (ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    const processJobs = scheduled.filter((j) => j.name === "ai:processItem");
    // Exactly two jobs total — one per create — and each targets its own item.
    expect(processJobs).toHaveLength(2);
    const targeted = processJobs.flatMap((j) =>
      // args is stored as a single-element array wrapping the mutation args.
      (j.args as unknown as { itemId: Id<"items"> }[]).map((a) => a.itemId),
    );
    expect(targeted).toContain(guardedId);
    expect(targeted).toContain(plainId);

    // A repeat create on the completed guarded operation (idempotent hit) must
    // NOT schedule processItem again — the item already exists and was processed.
    await t.mutation(api.items.createLinkItem, {
      url: "example.com/guarded",
      operationId: LINK_OP,
    });
    const scheduledAfter = await t.run(async (ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(
      scheduledAfter.filter((j) => j.name === "ai:processItem"),
    ).toHaveLength(2);
  });

  it("releases the link operation when its item is deleted, allowing re-perform", async () => {
    const t = await as("user-a");
    const itemId = await t.mutation(api.items.createLinkItem, {
      url: "example.com/delete-me",
      operationId: LINK_OP,
    });
    await t.mutation(api.items.deleteItem, { id: itemId });

    // The operation row is gone, so a new share with the same id performs fresh.
    const op = await t.query(api.items.getImportOperation, {
      operationId: LINK_OP,
    });
    expect(op).toBeNull();

    const redoId = await t.mutation(api.items.createLinkItem, {
      url: "example.com/delete-me",
      operationId: LINK_OP,
    });
    expect(redoId).not.toBe(itemId);
  });

  it("rejects invalid operation ids on the link/note paths", async () => {
    const t = await as("user-a");
    await expect(
      t.mutation(api.items.createLinkItem, {
        url: "example.com",
        operationId: "short",
      }),
    ).rejects.toThrow(/Invalid operationId/i);
    await expect(
      t.mutation(api.items.createNoteItem, {
        text: "x",
        operationId: "x".repeat(201),
      }),
    ).rejects.toThrow(/Invalid operationId/i);
  });

  it("rejects empty note text on the idempotent path without completing the op", async () => {
    const t = await as("user-a");
    await expect(
      t.mutation(api.items.createNoteItem, {
        text: "   ",
        operationId: NOTE_OP,
      }),
    ).rejects.toThrow(/empty/i);
    // No item, no operation row was created.
    const op = await t.query(api.items.getImportOperation, {
      operationId: NOTE_OP,
    });
    expect(op).toBeNull();
  });

  it("rejects an invalid url on the idempotent path without completing the op", async () => {
    const t = await as("user-a");
    // The centralized URL policy rejects empty/whitespace URLs before any
    // operation row is created. The error category is "empty"; the important
    // contract is that the op is not recorded, so a corrected retry is clean.
    await expect(
      t.mutation(api.items.createLinkItem, {
        url: "  ",
        operationId: LINK_OP,
      }),
    ).rejects.toThrow(/empty/i);
    const op = await t.query(api.items.getImportOperation, {
      operationId: LINK_OP,
    });
    expect(op).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Pro entitlement gate
// ---------------------------------------------------------------------------

describe("Pro entitlement gate", () => {
  // A user with no subscription row at all — the brand-new-user case. Every
  // save and Pro mutation must throw `Pro required` so the client can route
  // to the paywall; reads (listItems, getItem, searchItems) stay open.
  it("blocks saves for a user with no subscription", async () => {
    const t = newConvexTest().withIdentity({ subject: "no-sub" });

    await expect(
      t.mutation(api.items.createLinkItem, { url: "https://example.com" }),
    ).rejects.toThrow(/Pro required/);
    await expect(
      t.mutation(api.items.createNoteItem, { text: "hi" }),
    ).rejects.toThrow(/Pro required/);
    await expect(
      t.mutation(api.items.beginImageImport, { operationId: OP_ID }),
    ).rejects.toThrow(/Pro required/);
  });

  it("blocks a lapsed user from retrying a pending image import", async () => {
    // A user who began an import while Pro, then lapsed, must NOT be able to
    // retry the pending operation: begin would otherwise hand back a fresh
    // upload URL and refresh updatedAt, pinning the row alive past the cron.
    const t = newConvexTest().withIdentity({ subject: "pend-lapse" });
    await seedPro(t, "pend-lapse");
    // Begin while Pro (creates the pending row), then lapse the subscription.
    await t.mutation(api.items.beginImageImport, { operationId: OP_ID });
    await t.run(async (ctx) => {
      const sub = await ctx.db
        .query("subscriptions")
        .withIndex("by_user", (q) => q.eq("userId", "pend-lapse"))
        .unique();
      if (sub) {
        await ctx.db.patch(sub._id, {
          status: "lapsed",
          expiresAt: Date.now() - 1000,
        });
      }
    });
    // Retrying begin on the existing pending op must now throw Pro required.
    await expect(
      t.mutation(api.items.beginImageImport, { operationId: OP_ID }),
    ).rejects.toThrow(/Pro required/);
  });

  it("blocks Find links for a lapsed user", async () => {
    const t = newConvexTest().withIdentity({ subject: "lapsed" });
    // Seed a subscription whose trial already expired.
    await t.run(async (ctx) => {
      await ctx.db.insert("subscriptions", {
        userId: "lapsed",
        status: "lapsed",
        expiresAt: Date.now() - 1000,
        updatedAt: Date.now(),
      });
    });
    // The lapsed user still owns a ready item (created here directly so the
    // gate isn't exercised on the insert).
    const itemId = await t.run(async (ctx) => {
      return await ctx.db.insert("items", {
        userId: "lapsed",
        type: "link",
        status: "ready",
        url: "https://example.com",
        tags: [],
        searchText: "",
      });
    });
    await expect(
      t.mutation(api.items.findLinks, { id: itemId }),
    ).rejects.toThrow(/Pro required/);
  });

  it("allows saves for an active trial", async () => {
    const t = newConvexTest().withIdentity({ subject: "trier" });
    await t.run(async (ctx) => {
      await ctx.db.insert("subscriptions", {
        userId: "trier",
        status: "trialing",
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        updatedAt: Date.now(),
      });
    });
    const itemId = await t.mutation(api.items.createLinkItem, {
      url: "https://example.com",
    });
    expect(typeof itemId).toBe("string");
  });

  it("getEntitlement reports the stored status and the client computes entitled", async () => {
    const t = newConvexTest().withIdentity({ subject: "pro-user" });
    await t.run(async (ctx) => {
      await ctx.db.insert("subscriptions", {
        userId: "pro-user",
        status: "pro",
        expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
        updatedAt: Date.now(),
      });
    });
    const ent = await t.query(api.subscriptions.getEntitlement, {});
    expect(ent.status).toBe("pro");
    expect(ent.expiresAt).toBeGreaterThan(Date.now());
  });

  it("getEntitlement returns 'none' for a user with no subscription", async () => {
    const t = newConvexTest().withIdentity({ subject: "anon" });
    const ent = await t.query(api.subscriptions.getEntitlement, {});
    expect(ent.status).toBe("none");
    expect(ent.expiresAt).toBeUndefined();
  });

  /** upsertSubscription ignores events for users whose row no longer exists
   * (post-account-deletion webhooks), so webhook-ordering tests need a real
   * users row. The identity subject is that row's id, matching what
   * requireUserId derives for `getEntitlement`. */
  async function asWebhookUser(): Promise<{ t: TestCtx; userId: string }> {
    const backend = newConvexTest();
    const userId = await backend.run(async (ctx) => {
      return (await ctx.db.insert("users", {})) as string;
    });
    return {
      t: backend.withIdentity({ subject: `${userId}|session-1` }),
      userId,
    };
  }

  it("upsertSubscription is idempotent and won't regress a newer expiry", async () => {
    const { t, userId } = await asWebhookUser();
    const farFuture = Date.now() + 365 * 24 * 60 * 60 * 1000;
    await t.mutation(internal.subscriptions.upsertSubscription, {
      userId,
      status: "pro",
      expiresAt: farFuture,
      eventTimestampMs: 2000,
    });
    // A stale EXPIRATION event with an earlier event timestamp must not
    // regress the row, even though its expiry is earlier.
    await t.mutation(internal.subscriptions.upsertSubscription, {
      userId,
      status: "lapsed",
      expiresAt: farFuture - 1000,
      eventTimestampMs: 1000,
    });
    const ent = await t.query(api.subscriptions.getEntitlement, {});
    expect(ent.status).toBe("pro");
    expect(ent.expiresAt).toBe(farFuture);
  });

  it("ignores an older active event instead of shortening access", async () => {
    const { t, userId } = await asWebhookUser();
    const farFuture = Date.now() + 365 * 24 * 60 * 60 * 1000;
    await t.mutation(internal.subscriptions.upsertSubscription, {
      userId,
      status: "pro",
      expiresAt: farFuture,
      eventTimestampMs: 2000,
    });
    await t.mutation(internal.subscriptions.upsertSubscription, {
      userId,
      status: "pro",
      expiresAt: farFuture - 1000,
      productId: "stale-product",
      eventTimestampMs: 1000,
    });
    const ent = await t.query(api.subscriptions.getEntitlement, {});
    expect(ent.status).toBe("pro");
    expect(ent.expiresAt).toBe(farFuture);
  });

  it("ignores a timestamp-less event after ordered state exists", async () => {
    const { t, userId } = await asWebhookUser();
    const farFuture = Date.now() + 365 * 24 * 60 * 60 * 1000;
    await t.mutation(internal.subscriptions.upsertSubscription, {
      userId,
      status: "pro",
      expiresAt: farFuture,
      eventTimestampMs: 2000,
    });
    await t.mutation(internal.subscriptions.upsertSubscription, {
      userId,
      status: "lapsed",
      expiresAt: farFuture - 1000,
    });
    const ent = await t.query(api.subscriptions.getEntitlement, {});
    expect(ent.status).toBe("pro");
    expect(ent.expiresAt).toBe(farFuture);
  });

  it("a newer refund event can move expiry backward", async () => {
    const { t, userId } = await asWebhookUser();
    const farFuture = Date.now() + 365 * 24 * 60 * 60 * 1000;
    await t.mutation(internal.subscriptions.upsertSubscription, {
      userId,
      status: "pro",
      expiresAt: farFuture,
      eventTimestampMs: 1000,
    });
    // A newer EXPIRATION event shortens the period (e.g. a refund).
    await t.mutation(internal.subscriptions.upsertSubscription, {
      userId,
      status: "lapsed",
      expiresAt: farFuture - 1000,
      eventTimestampMs: 2000,
    });
    const ent = await t.query(api.subscriptions.getEntitlement, {});
    expect(ent.status).toBe("lapsed");
    expect(ent.expiresAt).toBe(farFuture - 1000);
  });

  it("an equal-timestamp event is dropped (not strictly newer)", async () => {
    const { t, userId } = await asWebhookUser();
    const farFuture = Date.now() + 365 * 24 * 60 * 60 * 1000;
    await t.mutation(internal.subscriptions.upsertSubscription, {
      userId,
      status: "pro",
      expiresAt: farFuture,
      eventTimestampMs: 1000,
    });
    await t.mutation(internal.subscriptions.upsertSubscription, {
      userId,
      status: "lapsed",
      expiresAt: farFuture - 1000,
      eventTimestampMs: 1000,
    });
    const ent = await t.query(api.subscriptions.getEntitlement, {});
    expect(ent.status).toBe("pro");
    expect(ent.expiresAt).toBe(farFuture);
  });

  it("identical event replay is idempotent", async () => {
    const { t, userId } = await asWebhookUser();
    const farFuture = Date.now() + 365 * 24 * 60 * 60 * 1000;
    const event = {
      userId,
      status: "pro" as const,
      expiresAt: farFuture,
      eventTimestampMs: 1000,
      productId: "prod-1",
    };
    await t.mutation(internal.subscriptions.upsertSubscription, event);
    // Replaying the exact same event (same timestamp) is a no-op.
    await t.mutation(internal.subscriptions.upsertSubscription, event);
    const ent = await t.query(api.subscriptions.getEntitlement, {});
    expect(ent.status).toBe("pro");
    expect(ent.expiresAt).toBe(farFuture);
  });

  it("omitted status preserves the existing status", async () => {
    const { t, userId } = await asWebhookUser();
    const farFuture = Date.now() + 365 * 24 * 60 * 60 * 1000;
    await t.mutation(internal.subscriptions.upsertSubscription, {
      userId,
      status: "trialing",
      expiresAt: farFuture,
      eventTimestampMs: 1000,
    });
    // A CANCELLATION event (status omitted) preserves `trialing` but
    // refreshes expiresAt from the event.
    await t.mutation(internal.subscriptions.upsertSubscription, {
      userId,
      expiresAt: farFuture + 1000,
      eventTimestampMs: 2000,
    });
    const ent = await t.query(api.subscriptions.getEntitlement, {});
    expect(ent.status).toBe("trialing");
    expect(ent.expiresAt).toBe(farFuture + 1000);
  });

  it("an event with no expiry preserves the existing expiresAt", async () => {
    const { t, userId } = await asWebhookUser();
    const farFuture = Date.now() + 365 * 24 * 60 * 60 * 1000;
    await t.mutation(internal.subscriptions.upsertSubscription, {
      userId,
      status: "pro",
      expiresAt: farFuture,
      eventTimestampMs: 1000,
    });
    // An event with expiresAt=0 preserves the existing expiresAt.
    await t.mutation(internal.subscriptions.upsertSubscription, {
      userId,
      expiresAt: 0,
      eventTimestampMs: 2000,
    });
    const ent = await t.query(api.subscriptions.getEntitlement, {});
    expect(ent.status).toBe("pro");
    expect(ent.expiresAt).toBe(farFuture);
  });

  it("an event with no expiry and no existing row creates nothing", async () => {
    const t = newConvexTest().withIdentity({ subject: "rc-empty" });
    await t.mutation(internal.subscriptions.upsertSubscription, {
      userId: "rc-empty",
      expiresAt: 0,
      eventTimestampMs: 1000,
    });
    const ent = await t.query(api.subscriptions.getEntitlement, {});
    expect(ent.status).toBe("none");
  });

  it("lapses an existing subscription while retaining its expiration", async () => {
    const { t, userId } = await asWebhookUser();
    const periodEnd = Date.now() - 1000;
    await t.mutation(internal.subscriptions.upsertSubscription, {
      userId,
      status: "pro",
      expiresAt: periodEnd,
      eventTimestampMs: 1000,
    });
    await t.mutation(internal.subscriptions.upsertSubscription, {
      userId,
      status: "lapsed",
      expiresAt: periodEnd,
      eventTimestampMs: 2000,
    });
    const ent = await t.query(api.subscriptions.getEntitlement, {});
    expect(ent).toEqual({ status: "lapsed", expiresAt: periodEnd });
  });
});

describe("pageGone", () => {
  it.each([404, 410])("treats HTTP %i as permanently gone", (status) => {
    expect(pageGone(status)).toBe(true);
  });
  it.each([400, 403, 429, 500, 503, undefined])(
    "treats %s as retryable, not gone",
    (status) => {
      expect(pageGone(status)).toBe(false);
    },
  );
});

describe("poster storage compensation", () => {
  it("deletes only storage that was never attached to an item", async () => {
    const t = newConvexTest();
    const orphaned = await storeBlob(t);
    const attached = await storeBlob(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("items", {
        userId: "poster-owner",
        type: "link",
        status: "ready",
        storageId: attached,
        tags: [],
        searchText: "",
      });
    });

    await t.mutation(internal.items.deleteStorageIfUnreferenced, {
      storageId: orphaned,
    });
    await t.mutation(internal.items.deleteStorageIfUnreferenced, {
      storageId: attached,
    });

    await t.run(async (ctx) => {
      expect(await ctx.db.system.get("_storage", orphaned)).toBeNull();
      expect(await ctx.db.system.get("_storage", attached)).not.toBeNull();
    });
  });

  it("deletes the previous poster when finalization replaces it", async () => {
    const t = newConvexTest();
    const previous = await storeBlob(t);
    const replacement = await storeBlob(t);
    const itemId = await t.run(async (ctx) => {
      return await ctx.db.insert("items", {
        userId: "poster-owner",
        type: "link",
        status: "processing",
        storageId: previous,
        tags: [],
        searchText: "",
      });
    });

    await t.mutation(internal.items.finalizeItem, {
      itemId,
      title: "TikTok",
      description: "A saved video",
      tags: [],
      storageId: replacement,
      status: "ready",
    });

    await t.run(async (ctx) => {
      expect(await ctx.db.system.get("_storage", previous)).toBeNull();
      expect(await ctx.db.system.get("_storage", replacement)).not.toBeNull();
      expect((await ctx.db.get(itemId))?.storageId).toBe(replacement);
    });
  });

  it("keeps a replaced poster that another item still references", async () => {
    const t = newConvexTest();
    const shared = await storeBlob(t);
    const replacement = await storeBlob(t);
    const itemId = await t.run(async (ctx) => {
      await ctx.db.insert("items", {
        userId: "other-owner",
        type: "link",
        status: "ready",
        storageId: shared,
        tags: [],
        searchText: "",
      });
      return await ctx.db.insert("items", {
        userId: "poster-owner",
        type: "link",
        status: "processing",
        storageId: shared,
        tags: [],
        searchText: "",
      });
    });

    await t.mutation(internal.items.finalizeItem, {
      itemId,
      title: "TikTok",
      description: "A saved video",
      tags: [],
      storageId: replacement,
      status: "ready",
    });

    await t.run(async (ctx) => {
      expect(await ctx.db.system.get("_storage", shared)).not.toBeNull();
    });
  });
});

describe("failed saves and retry", () => {
  /** Insert a link item for `userId` in the given end state, the way the
   * pipeline would leave it. */
  async function seedLink(
    t: TestCtx,
    userId: string,
    fields: {
      status: "processing" | "ready" | "failed";
      failureReason?: "not_found" | "error";
      enrichment?: "partial" | "no_article";
    },
  ): Promise<Id<"items">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("items", {
        userId,
        type: "link",
        url: "https://example.com/gone",
        tags: [],
        searchText: "",
        ...fields,
      });
    });
  }

  it("records why an item failed so the client can explain it", async () => {
    const t = await as("fail-reason");
    const itemId = await seedLink(t, "fail-reason", { status: "processing" });
    await t.mutation(internal.items.failItem, { itemId, reason: "not_found" });
    const item = await t.run(async (ctx) => await ctx.db.get(itemId));
    expect(item?.status).toBe("failed");
    expect(item?.failureReason).toBe("not_found");
  });

  it("retries a failed item, clearing the reason and re-queueing processing", async () => {
    const t = await as("retry-fail");
    const itemId = await seedLink(t, "retry-fail", {
      status: "failed",
      failureReason: "error",
    });
    await t.mutation(api.items.reprocessItem, { id: itemId });
    const item = await t.run(async (ctx) => await ctx.db.get(itemId));
    expect(item?.status).toBe("processing");
    expect(item?.failureReason).toBeUndefined();
  });

  it("retries a partially enriched item", async () => {
    const t = await as("retry-partial");
    const itemId = await seedLink(t, "retry-partial", {
      status: "ready",
      enrichment: "partial",
    });
    await t.mutation(api.items.reprocessItem, { id: itemId });
    const item = await t.run(async (ctx) => await ctx.db.get(itemId));
    expect(item?.status).toBe("processing");
    expect(item?.enrichment).toBeUndefined();
  });

  it("does not retry a no-article link (the URL itself is the save)", async () => {
    // A no-article page read fine — a retry cannot change the outcome, so the
    // backend must refuse the retry the way it refuses a 404.
    const t = await as("retry-no-article");
    const itemId = await seedLink(t, "retry-no-article", {
      status: "ready",
      enrichment: "no_article",
    });
    await t.mutation(api.items.reprocessItem, { id: itemId });
    const item = await t.run(async (ctx) => await ctx.db.get(itemId));
    expect(item?.status).toBe("ready");
    expect(item?.enrichment).toBe("no_article");
  });

  it("does not retry a page that is gone (a 404 will not change)", async () => {
    const t = await as("retry-gone");
    const itemId = await seedLink(t, "retry-gone", {
      status: "failed",
      failureReason: "not_found",
    });
    await t.mutation(api.items.reprocessItem, { id: itemId });
    const item = await t.run(async (ctx) => await ctx.db.get(itemId));
    expect(item?.status).toBe("failed");
    expect(item?.failureReason).toBe("not_found");
  });

  it.each(["not_found", "image_too_large"] as const)(
    "does not spend retry capacity on a terminal photo (%s)",
    async (failureReason) => {
      const t = await as("terminal-photo");
      const id = await t.run((ctx) =>
        ctx.db.insert("items", {
          userId: "terminal-photo",
          type: "image",
          status: "failed",
          failureReason,
          tags: [],
          searchText: "",
        }),
      );
      for (let i = 0; i < 20; i++) {
        await t.mutation(api.items.reprocessItem, { id });
      }
      expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
        status: "failed",
        failureReason,
      });
      expect(
        await t.run((ctx) =>
          ctx.db.system.query("_scheduled_functions").collect(),
        ),
      ).toHaveLength(0);
      // A legitimate retry still succeeds after the terminal attempts.
      await t.run((ctx) => ctx.db.patch(id, { failureReason: "error" }));
      await t.mutation(api.items.reprocessItem, { id });
      expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
        status: "processing",
      });
    },
  );

  it("does not retry a fully enriched item", async () => {
    const t = await as("retry-ready");
    const itemId = await seedLink(t, "retry-ready", { status: "ready" });
    await t.mutation(api.items.reprocessItem, { id: itemId });
    const item = await t.run(async (ctx) => await ctx.db.get(itemId));
    expect(item?.status).toBe("ready");
  });

  it("refuses to retry another user's item", async () => {
    const owner = await as("retry-owner");
    const itemId = await seedLink(owner, "retry-owner", {
      status: "failed",
      failureReason: "error",
    });
    const attacker = await as("retry-attacker");
    await expect(
      attacker.mutation(api.items.reprocessItem, { id: itemId }),
    ).rejects.toThrow(/Item not found/);
    const item = await owner.run(async (ctx) => await ctx.db.get(itemId));
    expect(item?.status).toBe("failed");
  });

  it("blocks retry for a lapsed user", async () => {
    const t = newConvexTest().withIdentity({ subject: "retry-lapsed" });
    await t.run(async (ctx) => {
      await ctx.db.insert("subscriptions", {
        userId: "retry-lapsed",
        status: "lapsed",
        expiresAt: Date.now() - 1000,
        updatedAt: Date.now(),
      });
    });
    const itemId = await seedLink(t, "retry-lapsed", {
      status: "failed",
      failureReason: "error",
    });
    await expect(
      t.mutation(api.items.reprocessItem, { id: itemId }),
    ).rejects.toThrow(/Pro required/);
  });
});

describe("rate limiting", () => {
  it("blocks item creation past the per-user burst capacity", async () => {
    // itemCreate bucket capacity is 30; the 31st create in a tight loop (no
    // meaningful refill) must be rejected so a leaked/shared Pro account can't
    // loop and burn LLM spend. Notes avoid any network fetch.
    const t = await as("rate-user");
    for (let i = 0; i < 30; i++) {
      await t.mutation(api.items.createNoteItem, { text: `note ${i}` });
    }
    await expect(
      t.mutation(api.items.createNoteItem, { text: "over the limit" }),
    ).rejects.toThrow();
  });
});

describe("importLinks", () => {
  const processRuns = (t: TestCtx) =>
    t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect())
        .filter((job) => job.name === "ai:processItem")
        .sort((a, b) => a.scheduledTime - b.scheduledTime),
    );

  it("creates run-fenced items whose processing continues the stagger offset", async () => {
    const t = await as("import-user");
    const before = Date.now();
    const res = await t.mutation(api.items.importLinks, {
      urls: ["https://example.com/one", "example.com/two", " "],
      staggerOffset: 5,
    });
    expect(res).toEqual({
      created: 2,
      skipped: 0,
      invalid: 0,
      notProcessed: 0,
      rateLimited: false,
    });
    const items = await t.run((ctx) =>
      ctx.db
        .query("items")
        .withIndex("by_user", (q) => q.eq("userId", "import-user"))
        .collect(),
    );
    expect(items.map((item) => item.url)).toEqual([
      "https://example.com/one",
      "https://example.com/two",
    ]);
    const runs = await processRuns(t);
    expect(runs).toHaveLength(2);
    expect(runs[0].scheduledTime).toBeGreaterThanOrEqual(
      before + 5 * IMPORT_STAGGER_MS,
    );
    expect(
      runs[1].scheduledTime - runs[0].scheduledTime,
    ).toBeGreaterThanOrEqual(IMPORT_STAGGER_MS);
    for (const run of runs) {
      const { itemId, runId } = run.args[0] as {
        itemId: string;
        runId: string;
      };
      expect(items.find((item) => item._id === itemId)?.processingRunId).toBe(
        runId,
      );
    }
  });

  it("skips a link saved long before the latest 1,000 through the URL index", async () => {
    const t = await as("import-dedup");
    await seedFeed(t, "import-dedup", 1); // https://example.com/0, the oldest save
    await t.run(async (ctx) => {
      for (let i = 1; i <= 5; i++) {
        await ctx.db.insert("items", {
          userId: "import-dedup",
          type: "link",
          status: "ready",
          url: `https://newer.example/${i}`,
          tags: [],
          searchText: "",
        });
      }
    });
    const res = await t.mutation(api.items.importLinks, {
      urls: [
        "https://EXAMPLE.com/0", // the old save; hosts compare case-insensitively
        "https://example.com/Fresh",
        "https://example.com/Fresh", // repeated within the batch
        "https://example.com/fresh", // path case differs: a distinct link
        "ftp://example.com/nope",
      ],
    });
    expect(res).toEqual({
      created: 2,
      skipped: 2,
      invalid: 1,
      notProcessed: 0,
      rateLimited: false,
    });
  });

  it("rejects an oversized batch instead of truncating it", async () => {
    const t = await as("import-cap");
    const urls = Array.from(
      { length: 51 },
      (_, i) => `https://example.com/${i}`,
    );
    await expect(t.mutation(api.items.importLinks, { urls })).rejects.toThrow(
      /at most 50 URLs/,
    );
  });

  it("draws from its own bucket, not the single-save itemCreate burst", async () => {
    const t = await as("import-own-bucket");
    for (let i = 0; i < 30; i++) {
      await t.mutation(api.items.createNoteItem, { text: `note ${i}` });
    }
    const res = await t.mutation(api.items.importLinks, {
      urls: Array.from({ length: 50 }, (_, i) => `https://example.com/${i}`),
    });
    expect(res.created).toBe(50);
    expect(res.rateLimited).toBe(false);
  });

  it("stops at the bulkImport limit and resumes free over saved links", async () => {
    const t = await as("import-rate");
    const batch = Array.from(
      { length: 10 },
      (_, i) => `https://example.com/${i}`,
    );
    await t.mutation(api.items.importLinks, { urls: batch });
    // Drain the 600-token bucket down to 5 without inserting 600 rows.
    await t.run(async (ctx) => {
      const { ok } = await rateLimiter.limit(ctx, "bulkImport", {
        key: "import-rate",
        count: 585,
      });
      expect(ok).toBe(true);
    });
    const limited = await t.mutation(api.items.importLinks, {
      urls: [
        ...batch,
        ...Array.from({ length: 6 }, (_, i) => `https://more.example/${i}`),
      ],
    });
    expect(limited).toEqual({
      created: 0,
      skipped: 10,
      invalid: 0,
      notProcessed: 6,
      rateLimited: true,
    });
    const resumed = await t.mutation(api.items.importLinks, {
      urls: [...batch, "https://more.example/0"],
    });
    expect(resumed).toEqual({
      created: 1,
      skipped: 10,
      invalid: 0,
      notProcessed: 0,
      rateLimited: false,
    });
  });
});

describe("photo rejection before classification", () => {
  const OVERSIZED = 14 * 1024 * 1024 + 1;

  it.each([0, OVERSIZED])(
    "cleans up rejected attachments of %s bytes and creates no item",
    async (size) => {
      const t = await as("oversized-attach");
      await t.mutation(api.items.beginImageImport, { operationId: OP_ID });
      const storageId = await t.run((ctx) =>
        ctx.storage.store(new Blob([new Uint8Array(size)])),
      );
      const result = await t.mutation(api.items.attachImageUpload, {
        operationId: OP_ID,
        storageId,
      });
      expect(result).toEqual({ storageId, error: expect.any(String) });
      expect(
        await t.run((ctx) => ctx.db.system.get("_storage", storageId)),
      ).toBeNull();
      await expect(
        t.mutation(api.items.finalizeImageImport, { operationId: OP_ID }),
      ).rejects.toThrow("no attached upload");
      expect(
        await t.run((ctx) => ctx.db.query("items").collect()),
      ).toHaveLength(0);

      const valid = await storeBlob(t);
      await t.mutation(api.items.attachImageUpload, {
        operationId: OP_ID,
        storageId: valid,
      });
      expect(
        await t.mutation(api.items.finalizeImageImport, { operationId: OP_ID }),
      ).toBeTruthy();
    },
  );

  it("blocks legacy oversized pending uploads at finalization", async () => {
    const t = await as("legacy-oversized");
    await t.run(async (ctx) => {
      const storageId = await ctx.storage.store(
        new Blob([new Uint8Array(OVERSIZED)]),
      );
      await ctx.db.insert("itemOperations", {
        userId: "legacy-oversized",
        operationId: OP_ID,
        kind: "image",
        status: "pending",
        storageId,
        updatedAt: Date.now(),
      });
    });
    await expect(
      t.mutation(api.items.finalizeImageImport, { operationId: OP_ID }),
    ).rejects.toThrow("too large");
    expect(await t.run((ctx) => ctx.db.query("items").collect())).toHaveLength(
      0,
    );
  });

  it("does not charge or queue product-search retries for missing photos", async () => {
    const t = await as("missing-product-photo");
    const id = await t.run((ctx) =>
      ctx.db.insert("items", {
        userId: "missing-product-photo",
        type: "image",
        status: "ready",
        tags: [],
        searchText: "",
      }),
    );
    for (let i = 0; i < 20; i++) {
      await t.mutation(api.items.findLinks, { id });
    }
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      productsStatus: "unavailable",
    });
    expect(
      await t.run((ctx) =>
        ctx.db.system.query("_scheduled_functions").collect(),
      ),
    ).toHaveLength(0);

    await t.run((ctx) =>
      ctx.db.patch(id, {
        type: "note",
        note: "chair",
        productsStatus: undefined,
      }),
    );
    await t.mutation(api.items.findLinks, { id });
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      productsStatus: "searching",
    });
  });

  it("does not delete an oversized photo referenced by another item", async () => {
    const t = await as("rejected-shared-upload");
    const storageId = await t.run(async (ctx) => {
      const id = await ctx.storage.store(new Blob([new Uint8Array(OVERSIZED)]));
      await ctx.db.insert("items", {
        userId: "other-user",
        type: "image",
        storageId: id,
        status: "ready",
        tags: [],
        searchText: "",
      });
      return id;
    });
    await t.mutation(api.items.beginImageImport, { operationId: OP_ID });
    await expect(
      t.mutation(api.items.attachImageUpload, {
        operationId: OP_ID,
        storageId,
      }),
    ).rejects.toThrow("already in use");
    expect(
      await t.run((ctx) => ctx.db.system.get("_storage", storageId)),
    ).not.toBeNull();
  });
});

describe("stale processing runs", () => {
  const STALE_AGE = PROCESSING_STALE_MS + 60 * 1000;
  const FRESH_AGE = 60 * 1000;

  /** Insert a `processing` link for `userId` whose run started `ageMs` ago.
   * `legacy` rows omit the run fields the way pre-fencing rows do, so their
   * age has to come from `_creationTime` — which convex-test stamps from
   * Date.now(), hence the faked clock below. convex-test also keeps
   * `_creationTime` monotonic per instance, so legacy rows must be inserted
   * before newer rows, oldest first. */
  async function processingLink(
    t: TestCtx,
    userId: string,
    ageMs: number,
    options: { legacy?: boolean } = {},
  ): Promise<Id<"items">> {
    const now = Date.now();
    if (options.legacy) {
      vi.setSystemTime(now - ageMs);
    }
    try {
      return await t.run((ctx) =>
        ctx.db.insert("items", {
          userId,
          type: "link",
          url: "https://example.com/slow",
          status: "processing",
          tags: [],
          searchText: "",
          ...(options.legacy
            ? {}
            : {
                processingRunId: `run-${ageMs}-${Math.random()}`,
                processingStartedAt: now - ageMs,
              }),
        }),
      );
    } finally {
      vi.setSystemTime(now);
    }
  }

  async function scheduledJobs(t: TestCtx, name: string) {
    const jobs = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    return jobs.filter((job) => job.name === name);
  }

  beforeEach(() => {
    // Date joins the faked clocks so legacy rows can be created "in the past".
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(new Date("2026-09-10T12:00:00Z"));
  });

  it("stamps a run id and start time on every path that starts processing", async () => {
    const t = await as("run-stamp");
    const noteId = await t.mutation(api.items.createNoteItem, {
      text: "a note",
    });
    const note = await t.run((ctx) => ctx.db.get(noteId));
    expect(note).toMatchObject({
      status: "processing",
      processingStartedAt: Date.now(),
    });
    expect(typeof note?.processingRunId).toBe("string");
    // The scheduled action carries the same run id it must finalize under.
    const [job] = await scheduledJobs(t, "ai:processItem");
    expect(job.args[0]).toEqual({
      itemId: noteId,
      runId: note?.processingRunId,
    });

    // A retry mints a NEW run so the old action is fenced out.
    await t.run((ctx) =>
      ctx.db.patch(noteId, { status: "failed", failureReason: "error" }),
    );
    await t.mutation(api.items.reprocessItem, { id: noteId });
    const retried = await t.run((ctx) => ctx.db.get(noteId));
    expect(retried?.status).toBe("processing");
    expect(retried?.processingRunId).not.toBe(note?.processingRunId);
    const jobs = await scheduledJobs(t, "ai:processItem");
    expect(jobs.map((j) => j.args[0])).toContainEqual({
      itemId: noteId,
      runId: retried?.processingRunId,
    });
  });

  it("sweeps stale processing items and leaves fresh ones alone", async () => {
    const t = newConvexTest();
    const legacyStale = await processingLink(t, "sweep", STALE_AGE, {
      legacy: true,
    });
    const legacyFresh = await processingLink(t, "sweep", FRESH_AGE, {
      legacy: true,
    });
    const stale = await processingLink(t, "sweep", STALE_AGE);
    const fresh = await processingLink(t, "sweep", FRESH_AGE);

    const result = await t.mutation(
      internal.items.failStaleProcessingItems,
      {},
    );
    // Both legacy rows sort into the range (undefined precedes every number);
    // only the stale one is failed, so scanned counts 3 and failed counts 2.
    expect(result).toEqual({ failed: 2, scanned: 3 });

    const byId = async (id: Id<"items">) =>
      await t.run((ctx) => ctx.db.get(id));
    expect(await byId(stale)).toMatchObject({
      status: "failed",
      failureReason: "error",
    });
    expect(await byId(legacyStale)).toMatchObject({
      status: "failed",
      failureReason: "error",
    });
    expect(await byId(fresh)).toMatchObject({ status: "processing" });
    expect(await byId(legacyFresh)).toMatchObject({ status: "processing" });
    // The stale row keeps its run id: if the presumed-dead action does finish,
    // its finalize still owns the row and may repair the item.
    expect((await byId(stale))?.processingRunId).toBeDefined();
    // A partial page does not chain.
    expect(
      await scheduledJobs(t, "items:failStaleProcessingItems"),
    ).toHaveLength(0);
  });

  it("chains another sweep only when a full page made progress", async () => {
    const t = newConvexTest();
    for (let i = 0; i < 100; i++) {
      await processingLink(t, "sweep-full", STALE_AGE + i * 1000);
    }
    const extra = await processingLink(t, "sweep-full", STALE_AGE);

    const first = await t.mutation(internal.items.failStaleProcessingItems, {});
    expect(first).toEqual({ failed: 100, scanned: 100 });
    expect(
      await scheduledJobs(t, "items:failStaleProcessingItems"),
    ).toHaveLength(1);

    // The chained run (executed directly here; the scheduler is frozen) picks
    // up the remainder and, with a partial page, stops.
    const second = await t.mutation(
      internal.items.failStaleProcessingItems,
      {},
    );
    expect(second).toEqual({ failed: 1, scanned: 1 });
    expect(await t.run((ctx) => ctx.db.get(extra))).toMatchObject({
      status: "failed",
    });
    expect(
      await scheduledJobs(t, "items:failStaleProcessingItems"),
    ).toHaveLength(1);
  });

  it("does not loop on a full page of legacy rows that are not yet stale", async () => {
    // Only possible in the first threshold window after deploy: rows created
    // by the previous code have no start time and sit at the front of the
    // range. They must age out on a later tick, not spin the scheduler now.
    const t = newConvexTest();
    for (let i = 0; i < 100; i++) {
      await processingLink(t, "sweep-legacy", FRESH_AGE, { legacy: true });
    }
    const result = await t.mutation(
      internal.items.failStaleProcessingItems,
      {},
    );
    expect(result).toEqual({ failed: 0, scanned: 100 });
    expect(
      await scheduledJobs(t, "items:failStaleProcessingItems"),
    ).toHaveLength(0);
  });

  it("finalizeItem and failItem are no-ops for a superseded run", async () => {
    const t = newConvexTest();
    const itemId = await processingLink(t, "fence", FRESH_AGE);
    const current = (await t.run((ctx) => ctx.db.get(itemId)))!.processingRunId;

    // The old run's result arrives after a retry replaced it.
    const stale = await t.mutation(internal.items.finalizeItem, {
      itemId,
      runId: "run-superseded",
      title: "Old result",
      description: "From the run the user retried past",
      tags: ["stale"],
      status: "ready",
    });
    expect(stale).toBe("stale_run");
    expect(await t.run((ctx) => ctx.db.get(itemId))).toMatchObject({
      status: "processing",
      processingRunId: current,
    });
    expect((await t.run((ctx) => ctx.db.get(itemId)))?.title).toBeUndefined();

    const staleFail = await t.mutation(internal.items.failItem, {
      itemId,
      runId: "run-superseded",
      reason: "error",
    });
    expect(staleFail).toBe("stale_run");
    expect(await t.run((ctx) => ctx.db.get(itemId))).toMatchObject({
      status: "processing",
    });

    // The owning run still lands.
    const applied = await t.mutation(internal.items.finalizeItem, {
      itemId,
      runId: current,
      title: "Current result",
      description: "From the run that owns the item",
      tags: ["current"],
      status: "ready",
    });
    expect(applied).toBe("applied");
    expect(await t.run((ctx) => ctx.db.get(itemId))).toMatchObject({
      status: "ready",
      title: "Current result",
    });
  });

  it("finalizeItem reports a deleted item as missing", async () => {
    const t = newConvexTest();
    const itemId = await processingLink(t, "gone", FRESH_AGE);
    await t.run((ctx) => ctx.db.delete(itemId));
    await expect(
      t.mutation(internal.items.finalizeItem, {
        itemId,
        title: "x",
        description: "y",
        tags: [],
        status: "ready",
      }),
    ).resolves.toBe("missing");
  });

  it("reprocessItem accepts a stale processing item and refuses a fresh one", async () => {
    const t = newConvexTest().withIdentity({
      subject: "retry-stale|session-1",
    });
    // The legacy row is created first so its `_creationTime` can be back-dated
    // past the Pro row `as` would otherwise insert at "now".
    const legacyStale = await processingLink(t, "retry-stale", STALE_AGE, {
      legacy: true,
    });
    await t.run((ctx) =>
      ctx.db.insert("subscriptions", {
        userId: "retry-stale",
        status: "pro",
        expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
        updatedAt: Date.now(),
      }),
    );
    const stale = await processingLink(t, "retry-stale", STALE_AGE);
    const fresh = await processingLink(t, "retry-stale", FRESH_AGE);
    const before = await t.run(async (ctx) => ({
      stale: await ctx.db.get(stale),
      fresh: await ctx.db.get(fresh),
    }));

    expect(await t.mutation(api.items.reprocessItem, { id: stale })).toBe(true);
    const retried = await t.run((ctx) => ctx.db.get(stale));
    expect(retried).toMatchObject({
      status: "processing",
      processingStartedAt: Date.now(),
    });
    expect(retried?.processingRunId).not.toBe(before.stale?.processingRunId);

    await t.mutation(api.items.reprocessItem, { id: legacyStale });
    const legacyRetried = await t.run((ctx) => ctx.db.get(legacyStale));
    expect(legacyRetried?.processingRunId).toBeDefined();
    expect(legacyRetried?.processingStartedAt).toBe(Date.now());

    // Fresh: its action may still finish, so nothing changes and no job queues.
    // The false return is what lets a client with a fast clock tell the user
    // instead of going quiet.
    expect(await t.mutation(api.items.reprocessItem, { id: fresh })).toBe(
      false,
    );
    expect(await t.run((ctx) => ctx.db.get(fresh))).toEqual(before.fresh);

    const jobs = await scheduledJobs(t, "ai:processItem");
    expect(
      jobs.map((j) => (j.args[0] as { itemId: Id<"items"> }).itemId).sort(),
    ).toEqual([stale, legacyStale].sort());
  });

  it("listReadyItemsInternal returns `limit` ready items despite many failed ones", async () => {
    const t = newConvexTest();
    await t.run(async (ctx) => {
      // Failed rows are newer than every ready row, so the old by_user read
      // (2x limit, newest first) would have returned mostly failures.
      for (let i = 0; i < 5; i++) {
        await ctx.db.insert("items", {
          userId: "ready-list",
          type: "note",
          note: `ready ${i}`,
          status: "ready",
          tags: [],
          searchText: "",
        });
      }
      for (let i = 0; i < 20; i++) {
        await ctx.db.insert("items", {
          userId: "ready-list",
          type: "link",
          url: "https://example.com/broken",
          status: "failed",
          failureReason: "error",
          tags: [],
          searchText: "",
        });
      }
      await ctx.db.insert("items", {
        userId: "someone-else",
        type: "note",
        note: "not mine",
        status: "ready",
        tags: [],
        searchText: "",
      });
    });
    const items = await t.query(internal.items.listReadyItemsInternal, {
      userId: "ready-list",
      limit: 5,
    });
    expect(items).toHaveLength(5);
    expect(
      items.every(
        (item) => item.status === "ready" && item.userId === "ready-list",
      ),
    ).toBe(true);
  });
});
