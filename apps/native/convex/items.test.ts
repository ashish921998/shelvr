// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TestConvexForDataModel } from "convex-test";
import { newConvexTest, seedNotes, signedInUser } from "./test.setup";

import { api, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { pageGone } from "./model/pageRead";
import { rateLimiter } from "./model/rateLimiter";
import {
  IMPORT_STAGGER_MS,
  LIST_PAGE_MAX,
  PROCESSING_STALE_MS,
  RECENT_ITEMS_MAX,
  STALE_IMPORT_CUTOFF_MS,
  tagSearchWords,
} from "./items";
import {
  IMAGE_EMPTY_MESSAGE,
  IMAGE_TOO_LARGE_MESSAGE,
  MAX_PHOTOS_PER_ACCOUNT,
  PHOTO_LIMIT_MESSAGE,
} from "./model/imagePolicy";
import { saveErrorCode, type SaveErrorCode } from "./model/saveErrors";

type TestCtx = TestConvexForDataModel<DataModel>;

const OP_ID = "image:11111111-1111-4111-8111-111111111111";
const OP_ID_2 = "image:22222222-2222-4222-8222-222222222222";

// convex-test runs runAfter(0) via real setTimeout; fake timers keep scheduled jobs queued.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

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
  it("does not expose existing page-controlled preview URLs", async () => {
    const { t, userId } = await as();
    await t.run(async (ctx) => {
      await ctx.db.insert("items", {
        userId,
        type: "link",
        tags: [],
        searchText: "",
        status: "ready",
        heroImageUrl: "http://127.0.0.1/private",
      });
    });
    expect(
      (await t.query(api.items.listItems, {}))[0].heroImageUrl,
    ).toBeUndefined();
  });
  it("still returns every item as a full row, newest first", async () => {
    const { t, userId } = await as();
    const ids = await seedFeed(t, userId, 3);

    const items = await t.query(api.items.listItems, {});
    expect(items.map((item) => item._id)).toEqual([...ids].reverse());
    expect(items[0].content).toContain("Article body 2");
    expect(items[0]).toHaveProperty("imageUrl");
  });

  it("only returns the caller's items", async () => {
    const backend = newConvexTest();
    const { t: ta, userId: aId } = await signedInUser(backend);
    const { t: tb, userId: bId } = await signedInUser(backend);
    const aIds = await seedFeed(ta, aId, 2);
    await seedFeed(tb, bId, 1);

    const mine = await ta.query(api.items.listItems, {});
    expect(mine.map((item) => item._id)).toEqual([...aIds].reverse());
  });

  it("searchItems keeps the article body on the row those builds open from", async () => {
    const { t, userId } = await as();
    const [id] = await seedFeed(t, userId, 1);

    const results = await t.query(api.items.searchItems, { query: "save" });
    expect(results.map((item) => item._id)).toEqual([id]);
    expect(results[0].content).toContain("Article body 0");
    expect(results[0]).toHaveProperty("imageUrl");
  });

  it("finds a note by its own text while it processes and after its run fails", async () => {
    const { t } = await as();
    const itemId = await t.mutation(api.items.createNoteItem, {
      text: "Zucchini lasagna for Sunday",
      operationId: "note:search-failed-1",
    });
    const ids = async () =>
      (await t.query(api.items.searchItems, { query: "zucchini" })).map(
        (item) => item._id,
      );

    expect(await ids()).toEqual([itemId]);
    await t.mutation(internal.items.failItem, { itemId, reason: "error" });
    expect(await ids()).toEqual([itemId]);
  });
});

describe("listItemsPage", () => {
  it("pages newest-first with a working cursor and isDone on the last page", async () => {
    const { t, userId } = await as();
    const ids = await seedFeed(t, userId, 5);
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
    const { t, userId } = await as();
    const ids = await seedFeed(t, userId, LIST_PAGE_MAX + 3);
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
    const { t, userId } = await as();
    const [id] = await seedFeed(t, userId, 1);

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
    expect(row).toMatchObject({
      type: "link",
      status: "ready",
      title: "Save 0",
      url: "https://example.com/0",
      tags: ["tag"],
      imageUrl: null,
    });
    expect(typeof row._creationTime).toBe("number");

    const full = await t.query(api.items.getItem, { id });
    expect(full?.content).toContain("Article body 0");
    expect(full?.products).toHaveLength(1);
  });

  it("flags a card whose save has a recipe, without shipping the recipe", async () => {
    const { t, userId } = await as();
    const [plainId] = await seedFeed(t, userId, 1);
    const recipeId = await t.run(async (ctx) =>
      ctx.db.insert("items", {
        userId,
        type: "link",
        status: "ready",
        title: "Mushroom rice reel",
        url: "https://www.instagram.com/reel/abc/",
        recipe: {
          name: "Mushroom rice",
          ingredients: ["rice"],
          steps: ["cook"],
        },
        tags: [],
        searchText: "mushroom rice",
      }),
    );

    const { page } = await t.query(api.items.listItemsPage, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    const recipeRow = page.find((row) => row._id === recipeId);
    const plainRow = page.find((row) => row._id === plainId);
    expect(recipeRow?.hasRecipe).toBe(true);
    expect(recipeRow).not.toHaveProperty("recipe");
    expect(plainRow).not.toHaveProperty("hasRecipe");
  });

  it("only returns the caller's items", async () => {
    const backend = newConvexTest();
    const { t: ta, userId: aId } = await signedInUser(backend);
    const { t: tb, userId: bId } = await signedInUser(backend);
    const aIds = await seedFeed(ta, aId, 2);
    const bIds = await seedFeed(tb, bId, 3);

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
  it("returns no saves for users without active Pro", async () => {
    const { t, userId } = await signedInUser(newConvexTest());
    await seedFeed(t, userId, 2);

    await expect(
      t.query(api.items.listRecentItems, { limit: 5, now: Date.now() }),
    ).resolves.toEqual([]);
    await expect(
      t.query(api.items.listRecentItems, { limit: 5 }),
    ).resolves.toEqual([]);
  });

  it("returns no saves for an expired Pro subscription", async () => {
    const { t, userId } = await signedInUser(newConvexTest());
    await t.run(async (ctx) => {
      await ctx.db.insert("subscriptions", {
        userId,
        status: "pro",
        expiresAt: Date.now() - 1000,
        updatedAt: Date.now(),
      });
    });
    await seedFeed(t, userId, 2);

    await expect(
      t.query(api.items.listRecentItems, { limit: 5, now: Date.now() }),
    ).resolves.toEqual([]);
  });

  it("still serves a build that omits its clock while its status is active", async () => {
    const { t, userId } = await as();
    const ids = await seedFeed(t, userId, 2);

    const recent = await t.query(api.items.listRecentItems, { limit: 5 });
    expect(recent.map((item) => item._id)).toEqual([ids[1], ids[0]]);
  });

  it("does not extend access through the expiry webhook window", async () => {
    const { t, userId } = await signedInUser(newConvexTest());
    await t.run(async (ctx) => {
      await ctx.db.insert("subscriptions", {
        userId,
        status: "pro",
        expiresAt: Date.now() - 1000,
        updatedAt: Date.now(),
      });
    });
    await seedFeed(t, userId, 1);

    await expect(
      t.query(api.items.listRecentItems, { limit: 5 }),
    ).resolves.toEqual([]);
    await expect(
      t.query(api.items.listRecentItems, { limit: 5, now: Date.now() }),
    ).resolves.toEqual([]);
  });

  it("returns no saves for a lapsed status when the client omits its clock", async () => {
    const { t, userId } = await signedInUser(newConvexTest());
    await t.run(async (ctx) => {
      await ctx.db.insert("subscriptions", {
        userId,
        status: "lapsed",
        expiresAt: Date.now() - 1000,
        updatedAt: Date.now(),
      });
    });
    await seedFeed(t, userId, 2);

    await expect(
      t.query(api.items.listRecentItems, { limit: 5 }),
    ).resolves.toEqual([]);
  });

  it("returns the newest ready items up to the limit, skipping unready ones", async () => {
    const { t, userId } = await as();
    const older = await seedFeed(t, userId, 3);
    const pending = await seedFeed(t, userId, 1, {
      status: "processing",
    });
    const failed = await seedFeed(t, userId, 1, { status: "failed" });

    const recent = await t.query(api.items.listRecentItems, {
      limit: 2,
      now: Date.now(),
    });
    expect(recent.map((item) => item._id)).toEqual([older[2], older[1]]);
    expect(recent.map((item) => item._id)).not.toContain(pending[0]);
    expect(recent.map((item) => item._id)).not.toContain(failed[0]);
    expect(recent[0]).not.toHaveProperty("content");
  });

  it("finds older ready items behind a burst of newer processing ones", async () => {
    const { t, userId } = await as();
    const ready = await seedFeed(t, userId, 3);
    await seedFeed(t, userId, 30, { status: "processing" });

    const recent = await t.query(api.items.listRecentItems, {
      limit: 5,
      now: Date.now(),
    });
    expect(recent.map((item) => item._id)).toEqual([
      ready[2],
      ready[1],
      ready[0],
    ]);
  });

  it("finds a ready item behind any number of newer failed ones", async () => {
    const { t, userId } = await as();
    const ready = await seedFeed(t, userId, 1);
    await seedFeed(t, userId, 200, { status: "failed" });

    const recent = await t.query(api.items.listRecentItems, {
      limit: 5,
      now: Date.now(),
    });
    expect(recent.map((item) => item._id)).toEqual([ready[0]]);
  });

  it("caps the limit and scopes to the caller", async () => {
    const { t, userId } = await as();
    await seedFeed(t, userId, RECENT_ITEMS_MAX + 5);
    await seedFeed(t, "someone-else", 2);

    const capped = await t.query(api.items.listRecentItems, {
      limit: 1000,
      now: Date.now(),
    });
    expect(capped).toHaveLength(RECENT_ITEMS_MAX);
    expect(capped.every((item) => item.title?.startsWith("Save "))).toBe(true);

    expect(
      await t.query(api.items.listRecentItems, {
        limit: 0,
        now: Date.now(),
      }),
    ).toHaveLength(1);
  });
});

describe("nextUp", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const later = (days: number) => Date.now() + days * DAY;

  async function markOpened(
    t: TestCtx,
    userId: string,
    itemId: Id<"items">,
    at: number,
  ) {
    await t.run(async (ctx) => {
      await ctx.db.insert("itemReads", {
        userId,
        itemId,
        firstOpenedAt: at,
        lastOpenedAt: at,
      });
    });
  }

  it("suggests the newest article the user has not opened", async () => {
    const { t, userId } = await as();
    const ids = await seedFeed(t, userId, 3);
    await markOpened(t, userId, ids[2], Date.now());

    const next = await t.query(api.items.nextUp, { now: later(2), skip: [] });
    expect(next?.kind).toBe("read");
    expect(next?.item._id).toBe(ids[1]);
    expect(next?.item).not.toHaveProperty("content");
  });

  it("finds an unread article behind many opened ones", async () => {
    const { t, userId } = await as();
    const ids = await seedFeed(t, userId, 12);
    for (const id of ids.slice(1)) {
      await markOpened(t, userId, id, Date.now());
    }

    const next = await t.query(api.items.nextUp, { now: later(2), skip: [] });
    expect(next?.item._id).toBe(ids[0]);
  });

  it("waits a day before suggesting a fresh save", async () => {
    const { t, userId } = await as();
    await seedFeed(t, userId, 1);

    await expect(
      t.query(api.items.nextUp, { now: Date.now(), skip: [] }),
    ).resolves.toBeNull();
  });

  it("suggests a recipe not looked at in the last week", async () => {
    const { t, userId } = await as();
    const recipeId = await t.run(async (ctx) =>
      ctx.db.insert("items", {
        userId,
        type: "link",
        status: "ready",
        title: "Lasagna page",
        url: "https://example.com/lasagna",
        recipe: { name: "Lasagna", ingredients: ["pasta"], steps: ["bake"] },
        tags: [],
        searchText: "lasagna",
      }),
    );
    const now = later(10);
    await markOpened(t, userId, recipeId, now - 2 * DAY);
    await expect(
      t.query(api.items.nextUp, { now, skip: [] }),
    ).resolves.toBeNull();

    await t.run(async (ctx) => {
      const read = await ctx.db
        .query("itemReads")
        .withIndex("by_user_and_item", (q) =>
          q.eq("userId", userId).eq("itemId", recipeId),
        )
        .unique();
      await ctx.db.patch(read!._id, { lastOpenedAt: now - 8 * DAY });
    });
    const next = await t.query(api.items.nextUp, { now, skip: [] });
    expect(next?.kind).toBe("cook");
    expect(next?.item._id).toBe(recipeId);
  });

  it("moves on to the next save when told to skip one", async () => {
    const { t, userId } = await as();
    const ids = await seedFeed(t, userId, 3);

    const next = await t.query(api.items.nextUp, {
      now: later(2),
      skip: [ids[2]],
    });
    expect(next?.item._id).toBe(ids[1]);
  });

  it("names a recipe by its dish", async () => {
    const { t, userId } = await as();
    await t.run(async (ctx) =>
      ctx.db.insert("items", {
        userId,
        type: "link",
        status: "ready",
        url: "https://example.com/dish",
        recipe: { name: "Lasagna", ingredients: ["pasta"], steps: ["bake"] },
        tags: [],
        searchText: "dish",
      }),
    );
    const next = await t.query(api.items.nextUp, {
      now: later(4),
      skip: [],
    });
    expect(next?.subject).toBe("Lasagna");
  });

  it("suggests every kind of save, newest first", async () => {
    const { t, userId } = await as();
    const base = {
      userId,
      status: "ready" as const,
      tags: [],
      searchText: "",
    };
    const [demo, note, photo, video, reel] = await t.run(async (ctx) => [
      await ctx.db.insert("items", {
        ...base,
        type: "link",
        title: "The sample",
        url: "https://example.com/sample",
      }),
      await ctx.db.insert("items", {
        ...base,
        type: "note",
        title: "Gift ideas",
        note: "A scarf",
      }),
      await ctx.db.insert("items", { ...base, type: "image", title: "Menu" }),
      await ctx.db.insert("items", {
        ...base,
        type: "link",
        title: "How to fold a shirt",
        url: "https://www.youtube.com/watch?v=abc",
      }),
      await ctx.db.insert("items", {
        ...base,
        type: "link",
        title: "A reel",
        url: "https://www.instagram.com/reel/abc/",
        content: "The caption",
        media: [
          { kind: "video", imageUrl: "https://x.test/a.jpg", aspectRatio: 1 },
        ],
      }),
    ]);
    await t.run(async (ctx) => {
      await ctx.db.insert("onboardingDemos", {
        userId,
        itemId: demo,
        createdAt: Date.now(),
      });
    });
    const now = later(2);
    const pick = async (skip: Id<"items">[]) => {
      const next = await t.query(api.items.nextUp, { now, skip });
      return next && { kind: next.kind, id: next.item._id };
    };

    expect(await pick([])).toEqual({ kind: "watch", id: reel });
    expect(await pick([reel])).toEqual({ kind: "watch", id: video });
    expect(await pick([reel, video])).toEqual({ kind: "open", id: photo });
    await markOpened(t, userId, photo, now);
    expect(await pick([reel, video])).toEqual({ kind: "open", id: note });
    await markOpened(t, userId, note, now);
    expect(await pick([reel, video])).toBeNull();
  });

  it("calls a captioned social post a save for later, not an article", async () => {
    const { t, userId } = await as();
    const base = {
      userId,
      status: "ready" as const,
      tags: [],
      searchText: "",
      type: "link" as const,
      content: "The caption",
    };
    const [post, photo] = await t.run(async (ctx) => [
      await ctx.db.insert("items", {
        ...base,
        title: "A post",
        url: "https://x.com/someone/status/123",
      }),
      await ctx.db.insert("items", {
        ...base,
        title: "A photo",
        url: "https://www.instagram.com/p/abc/",
      }),
    ]);
    const now = later(2);
    const pick = async (skip: Id<"items">[]) => {
      const next = await t.query(api.items.nextUp, { now, skip });
      return next && { kind: next.kind, id: next.item._id };
    };

    expect(await pick([])).toEqual({ kind: "open", id: photo });
    expect(await pick([photo])).toEqual({ kind: "open", id: post });
  });

  it("suggests nothing without Pro", async () => {
    const { t, userId } = await signedInUser(newConvexTest());
    await seedFeed(t, userId, 2);

    await expect(
      t.query(api.items.nextUp, { now: later(2), skip: [] }),
    ).resolves.toBeNull();
  });

  it("never suggests another account's saves", async () => {
    const { t } = await as();
    await seedFeed(t, "someone-else", 2);

    await expect(
      t.query(api.items.nextUp, { now: later(2), skip: [] }),
    ).resolves.toBeNull();
  });
});

describe("listLocatedItems", () => {
  it("returns only the caller's photos that carry coordinates", async () => {
    const { t, userId } = await as();
    const { located, unlocated } = await t.run(async (ctx) => {
      const located = await ctx.db.insert("items", {
        userId,
        type: "image",
        status: "ready",
        title: "Belém Tower",
        latitude: 38.6916,
        longitude: -9.216,
        tags: [],
        searchText: "",
      });
      const unlocated = await ctx.db.insert("items", {
        userId,
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

describe("similarItems", () => {
  async function insertItem(
    t: TestCtx,
    userId: string,
    fields: { title: string; tags: string[]; status?: "ready" | "processing" },
  ): Promise<Id<"items">> {
    return await t.run(async (ctx) =>
      ctx.db.insert("items", {
        userId,
        type: "link",
        status: fields.status ?? "ready",
        title: fields.title,
        url: `https://example.com/${encodeURIComponent(fields.title)}`,
        tags: fields.tags,
        searchText: [fields.title, ...fields.tags].join(" ").toLowerCase(),
      }),
    );
  }

  it("finds a related save older than the newest-items window", async () => {
    const { t, userId } = await as();
    const old = await insertItem(t, userId, {
      title: "Walnut floor lamp",
      tags: ["lighting", "furniture"],
    });
    await seedFeed(t, userId, 320);
    const fresh = await insertItem(t, userId, {
      title: "Brass reading lamp",
      tags: ["lighting", "furniture"],
    });

    const similar = await t.query(api.items.similarItems, { id: fresh });
    expect(similar.map((item) => item._id)).toEqual([old]);
    expect(similar[0]).not.toHaveProperty("searchText");
  });

  it("searches on short tags like art and diy", async () => {
    const { t, userId } = await as();
    const old = await insertItem(t, userId, {
      title: "Linocut prints",
      tags: ["art", "diy"],
    });
    await seedFeed(t, userId, 320);
    const fresh = await insertItem(t, userId, {
      title: "Watercolour washes",
      tags: ["art", "diy"],
    });

    const similar = await t.query(api.items.similarItems, { id: fresh });
    expect(similar.map((item) => item._id)).toEqual([old]);
  });

  it("keeps short tag words but drops filler from multi-word tags", () => {
    expect(tagSearchWords("art")).toEqual(["art"]);
    expect(tagSearchWords("ux")).toEqual(["ux"]);
    expect(tagSearchWords("how to")).toEqual([]);
    expect(tagSearchWords("to do lists")).toEqual(["do", "lists"]);
  });

  it("searches for older saves with non-Latin tags and titles", async () => {
    const { t, userId } = await as();
    const old = await insertItem(t, userId, {
      title: "真鍮のフロアランプ",
      tags: ["照明", "家具"],
    });
    await seedFeed(t, userId, 320);
    const fresh = await insertItem(t, userId, {
      title: "読書用ランプ",
      tags: ["照明", "家具"],
    });

    const similar = await t.query(api.items.similarItems, { id: fresh });
    expect(similar.map((item) => item._id)).toEqual([old]);
  });

  it("scores shared non-Latin title words without a shared tag", async () => {
    const { t, userId } = await as();
    const old = await insertItem(t, userId, {
      title: "北欧 照明 スタンド 真鍮",
      tags: ["インテリア"],
    });
    const fresh = await insertItem(t, userId, {
      title: "北欧 照明 スタンド 木製",
      tags: ["読書"],
    });

    const similar = await t.query(api.items.similarItems, { id: fresh });
    expect(similar.map((item) => item._id)).toEqual([old]);
  });

  it("skips unready matches and never reads another user's saves", async () => {
    const backend = newConvexTest();
    const { t: mine, userId: mineId } = await signedInUser(backend);
    const { t: theirs, userId: theirsId } = await signedInUser(backend);
    await insertItem(theirs, theirsId, {
      title: "Ceramic table lamp",
      tags: ["lighting", "furniture"],
    });
    await insertItem(mine, mineId, {
      title: "Paper pendant lamp",
      tags: ["lighting", "furniture"],
      status: "processing",
    });
    const fresh = await insertItem(mine, mineId, {
      title: "Brass reading lamp",
      tags: ["lighting", "furniture"],
    });

    expect(await mine.query(api.items.similarItems, { id: fresh })).toEqual([]);
  });

  describe("reserves old matches ahead of the score cut", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
      vi.setSystemTime(new Date("2026-09-10T12:00:00Z"));
    });

    it("keeps a strong old match out of a burst of higher-scoring newer saves", async () => {
      const start = Date.now();
      const oldAgeMs = 8 * 24 * 60 * 60 * 1000;

      vi.setSystemTime(start - oldAgeMs);
      const { t, userId } = await signedInUser(newConvexTest());
      const old = await insertItem(t, userId, {
        title: "Walnut floor lamp",
        tags: ["lighting", "furniture", "walnut"],
      });

      vi.setSystemTime(start);
      for (let i = 0; i < 12; i++) {
        await insertItem(t, userId, {
          title: `Recent lamp ${i}`,
          tags: ["lighting", "furniture", "brass", "reading"],
        });
      }
      const fresh = await insertItem(t, userId, {
        title: "Brass reading lamp",
        tags: ["lighting", "furniture", "brass", "reading"],
      });

      const similar = await t.query(api.items.similarItems, { id: fresh });
      expect(similar.map((item) => item._id)).toContain(old);
    });
  });
});

describe("canonical save telemetry", () => {
  it("schedules one event per item, keeps the original session on retry, and excludes content", async () => {
    const { t, userId } = await as();
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
        userId,
        itemType: "note",
        savedAt: item?._creationTime,
        sessionId: "save-session",
        saveSource: "note",
        operationId: "note:telemetry-1",
      },
    ]);
  });

  it("tracks link and image saves while remaining compatible with old clients", async () => {
    const { t } = await as();
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
        expect.objectContaining({
          itemId: imageId,
          itemType: "image",
          sessionId: "image-session",
          photoCount: 1,
          storedBytes: 4,
        }),
      ]),
    );
    const linkJob = telemetry.find((job) => job.args[0].itemType === "link")
      ?.args[0];
    expect(linkJob).not.toHaveProperty("photoCount");
    expect(linkJob).not.toHaveProperty("saveSource");
  });

  it("forwards a client-supplied source, and lets it override the note default", async () => {
    const { t } = await as();
    const linkId = await t.mutation(api.items.createLinkItem, {
      url: "https://example.com",
      saveSource: "manual_link",
    });
    const noteId = await t.mutation(api.items.createNoteItem, {
      text: "Shared through the extension",
      saveSource: "share_extension",
    });
    await t.mutation(api.items.beginImageImport, { operationId: OP_ID });
    await t.mutation(api.items.attachImageUpload, {
      operationId: OP_ID,
      storageId: await storeBlob(t),
    });
    const imageId = await t.mutation(api.items.finalizeImageImport, {
      operationId: OP_ID,
      saveSource: "camera",
    });
    const jobs = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    const sourceById = new Map(
      jobs
        .filter((job) => job.name === "analytics:captureSave")
        .map((job) => [job.args[0].itemId, job.args[0].saveSource]),
    );
    expect(sourceById.get(linkId)).toBe("manual_link");
    expect(sourceById.get(imageId)).toBe("camera");
    expect(sourceById.get(noteId)).toBe("share_extension");
  });
});

async function as(): Promise<{ t: TestCtx; userId: string }> {
  return await signedInUser(newConvexTest(), { pro: true });
}

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

async function storeBlob(t: TestCtx): Promise<Id<"_storage">> {
  return await t.run(async (ctx) => {
    return await ctx.storage.store(
      new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])]),
    );
  });
}

describe("upload abuse controls", () => {
  it("reuses pending upload capabilities and limits fresh begins", async () => {
    const { t } = await as();
    const first = await t.mutation(api.items.beginImageImport, {
      operationId: OP_ID,
    });
    for (let i = 0; i < 35; i++) {
      expect(
        await t.mutation(api.items.beginImageImport, { operationId: OP_ID }),
      ).toEqual(first);
    }
    for (let i = 0; i < 29; i++) {
      await t.mutation(api.items.beginImageImport, {
        operationId: `image:limit-${i}`,
      });
    }
    await expect(
      t.mutation(api.items.beginImageImport, {
        operationId: "image:over-limit",
      }),
    ).rejects.toThrow();
    expect(
      await t.mutation(api.items.beginImageImport, { operationId: OP_ID }),
    ).toEqual(first);
  });

  it("caps pending imports independently of the finalized photo quota", async () => {
    const { t, userId } = await as();
    await t.run(async (ctx) => {
      for (let i = 0; i < 30; i++) {
        await ctx.db.insert("itemOperations", {
          userId,
          operationId: `pending:${i}`,
          kind: "image",
          status: "pending",
          updatedAt: Date.now(),
        });
      }
    });
    await expect(
      t.mutation(api.items.beginImageImport, { operationId: OP_ID }),
    ).rejects.toThrow("Too many pending image imports");
  });

  it("sweeps unattached storage while protecting young and referenced blobs", async () => {
    const { t, userId } = await as();
    const orphan = await storeBlob(t);
    const owned = await storeBlob(t);
    const pending = await storeBlob(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("items", {
        userId,
        type: "image",
        tags: [],
        searchText: "",
        status: "ready",
        storageId: owned,
      });
      await ctx.db.insert("itemOperations", {
        userId,
        operationId: OP_ID,
        kind: "image",
        status: "pending",
        storageId: pending,
        updatedAt: Date.now(),
      });
    });
    await t.mutation(internal.items.cleanupOrphanStorage, {});
    expect(
      await t.run((ctx) => ctx.db.system.get("_storage", orphan)),
    ).not.toBeNull();
    await t.mutation(internal.items.cleanupOrphanStorage, {
      cutoff: Date.now() + 1000,
    });
    expect(
      await t.run((ctx) => ctx.db.system.get("_storage", orphan)),
    ).toBeNull();
    expect(
      await t.run((ctx) => ctx.db.system.get("_storage", owned)),
    ).not.toBeNull();
    expect(
      await t.run((ctx) => ctx.db.system.get("_storage", pending)),
    ).not.toBeNull();
  });
});

async function expectSaveRefusal(
  call: Promise<unknown>,
  code: SaveErrorCode,
  message: string,
): Promise<void> {
  const error = await call.then(
    () => {
      throw new Error(`expected a ${code} refusal, but the call resolved`);
    },
    (thrown: unknown) => thrown,
  );
  expect(saveErrorCode(error)).toBe(code);
  expect((error as { data: { message: string } }).data.message).toBe(message);
}

describe("photo quota", () => {
  it("refuses a new photo at the cap, reports usage, and frees the slot on delete", async () => {
    const { t, userId } = await as();
    await t.run(async (ctx) => {
      for (let i = 0; i < MAX_PHOTOS_PER_ACCOUNT - 1; i++) {
        await ctx.db.insert("items", {
          userId,
          type: "image",
          status: "ready",
          tags: [],
          searchText: "",
        });
      }
      await ctx.db.insert("items", {
        userId,
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

    await expectSaveRefusal(
      t.mutation(api.items.beginImageImport, { operationId: OP_ID_2 }),
      "photo_limit",
      PHOTO_LIMIT_MESSAGE,
    );
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
    const { t } = await as();
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
    const { t, userId } = await as();
    await t.mutation(api.items.beginImageImport, { operationId: OP_ID });
    const storageId = await storeBlob(t);
    await t.mutation(api.items.attachImageUpload, {
      operationId: OP_ID,
      storageId,
    });
    const firstId = await t.mutation(api.items.finalizeImageImport, {
      operationId: OP_ID,
    });

    const began = await t.mutation(api.items.beginImageImport, {
      operationId: OP_ID,
    });
    expect(began).toEqual({ kind: "complete", itemId: firstId });

    const secondId = await t.mutation(api.items.finalizeImageImport, {
      operationId: OP_ID,
    });
    expect(secondId).toBe(firstId);

    const items = await t.run(async (ctx) => {
      return await ctx.db
        .query("items")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
    });
    expect(items.filter((i) => i.type === "image")).toHaveLength(1);
  });

  it("keeps the same operation id independent across users", async () => {
    const backend = newConvexTest();
    const { t: ta } = await signedInUser(backend, { pro: true });
    const { t: tb } = await signedInUser(backend, { pro: true });

    await ta.mutation(api.items.beginImageImport, { operationId: OP_ID });
    const sa = await storeBlob(ta);
    await ta.mutation(api.items.attachImageUpload, {
      operationId: OP_ID,
      storageId: sa,
    });
    const aId = await ta.mutation(api.items.finalizeImageImport, {
      operationId: OP_ID,
    });

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
    const { t, userId } = await as();
    await t.mutation(api.items.beginImageImport, { operationId: OP_ID });
    const storageId = await storeBlob(t);
    await t.mutation(api.items.attachImageUpload, {
      operationId: OP_ID,
      storageId,
    });
    const itemId = await t.mutation(api.items.finalizeImageImport, {
      operationId: OP_ID,
    });

    await t.run(async (ctx) => {
      const sub = await ctx.db
        .query("subscriptions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique();
      if (sub) {
        await ctx.db.patch(sub._id, {
          status: "lapsed",
          expiresAt: Date.now() - 1000,
        });
      }
    });

    const began = await t.mutation(api.items.beginImageImport, {
      operationId: OP_ID,
    });
    expect(began).toEqual({ kind: "complete", itemId });

    const again = await t.mutation(api.items.finalizeImageImport, {
      operationId: OP_ID,
    });
    expect(again).toBe(itemId);
  });

  it("rejects reusing an operation id with a different kind", async () => {
    const { t, userId } = await as();
    await t.run(async (ctx) => {
      await ctx.db.insert("itemOperations", {
        userId,
        operationId: OP_ID,
        kind: "image",
        status: "complete",
        updatedAt: Date.now(),
      });
    });

    await t.run(async (ctx) => {
      const op = await ctx.db
        .query("itemOperations")
        .withIndex("by_user_operation", (q) =>
          q.eq("userId", userId).eq("operationId", OP_ID),
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
    const { t } = await as();
    await t.mutation(api.items.beginImageImport, { operationId: OP_ID });
    const first = await storeBlob(t);
    const second = await storeBlob(t);

    const r1 = await t.mutation(api.items.attachImageUpload, {
      operationId: OP_ID,
      storageId: first,
    });
    expect(r1).toEqual({ storageId: first });

    const r2 = await t.mutation(api.items.attachImageUpload, {
      operationId: OP_ID,
      storageId: second,
    });
    expect(r2).toEqual({ storageId: first });

    const secondGone = await t.run(async (ctx) =>
      ctx.db.system.get("_storage", second),
    );
    expect(secondGone).toBeNull();
    const firstAlive = await t.run(async (ctx) =>
      ctx.db.system.get("_storage", first),
    );
    expect(firstAlive).not.toBeNull();

    const itemId = await t.mutation(api.items.finalizeImageImport, {
      operationId: OP_ID,
    });
    const item = await t.run(async (ctx) => await ctx.db.get(itemId));
    expect(item?.storageId).toBe(first);
  });

  it("does not mark the operation complete on invalid metadata", async () => {
    const { t } = await as();
    await t.mutation(api.items.beginImageImport, { operationId: OP_ID });
    const storageId = await storeBlob(t);
    await t.mutation(api.items.attachImageUpload, {
      operationId: OP_ID,
      storageId,
    });

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
    const { t } = await as();
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

    const op = await t.query(api.items.getImportOperation, {
      operationId: OP_ID,
    });
    expect(op).toBeNull();

    const began = await t.mutation(api.items.beginImageImport, {
      operationId: OP_ID,
    });
    expect(began.kind).toBe("upload");
  });

  it("deletes only eligible unreferenced stale pending uploads", async () => {
    const { t, userId } = await as();

    const staleStorageId = await storeBlob(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("itemOperations", {
        userId,
        operationId: OP_ID,
        kind: "image",
        status: "pending",
        storageId: staleStorageId,
        updatedAt: Date.now() - STALE_IMPORT_CUTOFF_MS - 60 * 60 * 1000,
      });
    });

    const freshStorageId = await storeBlob(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("itemOperations", {
        userId,
        operationId: OP_ID_2,
        kind: "image",
        status: "pending",
        storageId: freshStorageId,
        updatedAt: Date.now(),
      });
    });

    await t.mutation(internal.items.cleanupStaleImageImports, {});

    const staleOp = await t.query(api.items.getImportOperation, {
      operationId: OP_ID,
    });
    expect(staleOp).toBeNull();
    const staleBlob = await t.run(async (ctx) =>
      ctx.db.system.get("_storage", staleStorageId),
    );
    expect(staleBlob).toBeNull();

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
    const { t: ta } = await as();
    await ta.mutation(api.items.beginImageImport, { operationId: OP_ID });
    const victimStorageId = await storeBlob(ta);
    await ta.mutation(api.items.attachImageUpload, {
      operationId: OP_ID,
      storageId: victimStorageId,
    });
    await ta.mutation(api.items.finalizeImageImport, { operationId: OP_ID });

    await ta.mutation(api.items.beginImageImport, { operationId: OP_ID_2 });
    await expect(
      ta.mutation(api.items.attachImageUpload, {
        operationId: OP_ID_2,
        storageId: victimStorageId,
      }),
    ).rejects.toThrow(/already in use/i);

    const victimAlive = await ta.run(async (ctx) =>
      ctx.db.system.get("_storage", victimStorageId),
    );
    expect(victimAlive).not.toBeNull();
  });

  it("returns the existing item when finalizing an already-complete op even with bad resubmitted metadata", async () => {
    const { t } = await as();
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

    const retriedId = await t.mutation(api.items.finalizeImageImport, {
      operationId: OP_ID,
      aspectRatio: -1,
    });
    expect(retriedId).toBe(firstId);
  });

  it("deletes the redundant re-upload when attach lands on an already-complete op", async () => {
    const { t } = await as();
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
    const { t } = await as();
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

    const blobAlive = await t.run(async (ctx) =>
      ctx.db.system.get("_storage", storageId),
    );
    expect(blobAlive).not.toBeNull();
  });

  it("rejects attaching a storage id that does not exist", async () => {
    const { t } = await as();
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
    const { t, userId } = await as();
    const storageId = await storeBlob(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("items", {
        userId,
        type: "image",
        status: "ready",
        storageId,
        tags: [],
        searchText: "",
      });
      await ctx.db.insert("itemOperations", {
        userId,
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
    const { t, userId } = await as();
    const staleAt = Date.now() - STALE_IMPORT_CUTOFF_MS - 60 * 60 * 1000;
    const imageBlob = await storeBlob(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("itemOperations", {
        userId,
        operationId: "link:stale-operation",
        kind: "link",
        status: "pending",
        updatedAt: staleAt,
      });
      await ctx.db.insert("itemOperations", {
        userId,
        operationId: OP_ID,
        kind: "image",
        status: "pending",
        storageId: imageBlob,
        updatedAt: staleAt,
      });
    });

    await t.mutation(internal.items.cleanupStaleImageImports, {});

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
    const { t, userId } = await as();
    const storageId = await storeBlob(t);
    const deadItemId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("items", {
        userId,
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
        userId,
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
    const { t, userId } = await as();
    const staleBlob = await storeBlob(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("itemOperations", {
        userId,
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
    const { t } = await as();
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
    const { t } = await as();
    await expect(
      t.mutation(api.items.finalizeImageImport, { operationId: OP_ID }),
    ).rejects.toThrow(/no attached upload/i);

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

const LINK_OP = "link:33333333-3333-4333-8333-333333333333";
const NOTE_OP = "note:44444444-4444-4444-8444-444444444444";

describe("shared link/note operation idempotency", () => {
  it("creates one link for a repeated shared operation and returns the same id", async () => {
    const { t, userId } = await as();
    const firstId = await t.mutation(api.items.createLinkItem, {
      url: "example.com/share",
      operationId: LINK_OP,
    });
    const secondId = await t.mutation(api.items.createLinkItem, {
      url: "example.com/share",
      operationId: LINK_OP,
    });
    expect(secondId).toBe(firstId);

    const items = await t.run(async (ctx) => {
      return await ctx.db
        .query("items")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
    });
    expect(items.filter((i) => i.type === "link")).toHaveLength(1);
  });

  it("creates one note for a repeated shared operation and returns the same id", async () => {
    const { t, userId } = await as();
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
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
    });
    expect(items.filter((i) => i.type === "note")).toHaveLength(1);
  });

  it("rejects reusing a link operation id for a note (kind mismatch)", async () => {
    const { t } = await as();
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
    const { t, userId } = await as();
    await t.run(async (ctx) => {
      await ctx.db.insert("itemOperations", {
        userId,
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
    const { t: ta, userId: userA } = await signedInUser(backend, { pro: true });
    const { t: tb, userId: userB } = await signedInUser(backend, { pro: true });

    const aId = await ta.mutation(api.items.createLinkItem, {
      url: "example.com/shared",
      operationId: LINK_OP,
    });
    const bId = await tb.mutation(api.items.createLinkItem, {
      url: "example.com/shared",
      operationId: LINK_OP,
    });
    expect(bId).not.toBe(aId);

    const aItems = await ta.run(async (ctx) =>
      ctx.db
        .query("items")
        .withIndex("by_user", (q) => q.eq("userId", userA))
        .collect(),
    );
    const bItems = await tb.run(async (ctx) =>
      ctx.db
        .query("items")
        .withIndex("by_user", (q) => q.eq("userId", userB))
        .collect(),
    );
    expect(aItems.filter((i) => i.type === "link")).toHaveLength(1);
    expect(bItems.filter((i) => i.type === "link")).toHaveLength(1);
  });

  it("creates two intentional items for identical content under distinct operations", async () => {
    const { t, userId } = await as();
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
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
    });
    expect(items.filter((i) => i.type === "link")).toHaveLength(2);
  });

  it("still creates a fresh item when no operation id is given (Add UI path)", async () => {
    const { t } = await as();
    const firstId = await t.mutation(api.items.createLinkItem, {
      url: "example.com/add",
    });
    const secondId = await t.mutation(api.items.createLinkItem, {
      url: "example.com/add",
    });
    expect(secondId).not.toBe(firstId);

    const ops = await t.run(async (ctx) =>
      ctx.db.query("itemOperations").collect(),
    );
    expect(ops).toHaveLength(0);
  });

  it("schedules processItem exactly once per link/note create, on both paths", async () => {
    const { t } = await as();

    const guardedId = await t.mutation(api.items.createLinkItem, {
      url: "example.com/guarded",
      operationId: LINK_OP,
    });
    const plainId = await t.mutation(api.items.createNoteItem, {
      text: "plain note",
    });

    const scheduled = await t.run(async (ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    const processJobs = scheduled.filter((j) => j.name === "ai:processItem");
    expect(processJobs).toHaveLength(2);
    const targeted = processJobs.flatMap((j) =>
      (j.args as unknown as { itemId: Id<"items"> }[]).map((a) => a.itemId),
    );
    expect(targeted).toContain(guardedId);
    expect(targeted).toContain(plainId);

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
    const { t } = await as();
    const itemId = await t.mutation(api.items.createLinkItem, {
      url: "example.com/delete-me",
      operationId: LINK_OP,
    });
    await t.mutation(api.items.deleteItem, { id: itemId });

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
    const { t } = await as();
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
    const { t } = await as();
    await expect(
      t.mutation(api.items.createNoteItem, {
        text: "   ",
        operationId: NOTE_OP,
      }),
    ).rejects.toThrow(/empty/i);
    const op = await t.query(api.items.getImportOperation, {
      operationId: NOTE_OP,
    });
    expect(op).toBeNull();
  });

  it("rejects an invalid url on the idempotent path without completing the op", async () => {
    const { t } = await as();
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

describe("Pro entitlement gate", () => {
  it("blocks saves for a user with no subscription", async () => {
    const { t } = await signedInUser(newConvexTest());

    await expectSaveRefusal(
      t.mutation(api.items.createLinkItem, { url: "https://example.com" }),
      "pro_required",
      "Pro required",
    );
    await expectSaveRefusal(
      t.mutation(api.items.createNoteItem, { text: "hi" }),
      "pro_required",
      "Pro required",
    );
    await expectSaveRefusal(
      t.mutation(api.items.beginImageImport, { operationId: OP_ID }),
      "pro_required",
      "Pro required",
    );
  });

  it("blocks a lapsed user from retrying a pending image import", async () => {
    const { t, userId } = await signedInUser(newConvexTest(), { pro: true });
    await t.mutation(api.items.beginImageImport, { operationId: OP_ID });
    await t.run(async (ctx) => {
      const sub = await ctx.db
        .query("subscriptions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique();
      if (sub) {
        await ctx.db.patch(sub._id, {
          status: "lapsed",
          expiresAt: Date.now() - 1000,
        });
      }
    });
    await expect(
      t.mutation(api.items.beginImageImport, { operationId: OP_ID }),
    ).rejects.toThrow(/Pro required/);
  });

  it("blocks Find links for a lapsed user", async () => {
    const { t, userId } = await signedInUser(newConvexTest());
    await t.run(async (ctx) => {
      await ctx.db.insert("subscriptions", {
        userId,
        status: "lapsed",
        expiresAt: Date.now() - 1000,
        updatedAt: Date.now(),
      });
    });
    const itemId = await t.run(async (ctx) => {
      return await ctx.db.insert("items", {
        userId,
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
    const { t, userId } = await signedInUser(newConvexTest());
    await t.run(async (ctx) => {
      await ctx.db.insert("subscriptions", {
        userId,
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
    const { t, userId } = await signedInUser(newConvexTest());
    await t.run(async (ctx) => {
      await ctx.db.insert("subscriptions", {
        userId,
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
    const { t } = await signedInUser(newConvexTest());
    const ent = await t.query(api.subscriptions.getEntitlement, {});
    expect(ent.status).toBe("none");
    expect(ent.expiresAt).toBeUndefined();
  });

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
    const { t, userId } = await signedInUser(newConvexTest());
    await t.mutation(internal.subscriptions.upsertSubscription, {
      userId,
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
      reading: { storageId: replacement },
      classification: {
        title: "TikTok",
        description: "A saved video",
        tags: [],
      },
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
      reading: { storageId: replacement },
      classification: {
        title: "TikTok",
        description: "A saved video",
        tags: [],
      },
    });

    await t.run(async (ctx) => {
      expect(await ctx.db.system.get("_storage", shared)).not.toBeNull();
    });
  });

  it("stores the cities a run read and keeps them when a later run has none", async () => {
    const { t, userId } = await as();
    const itemId = await t.run(async (ctx) => {
      return await ctx.db.insert("items", {
        userId,
        type: "link",
        status: "processing",
        tags: [],
        searchText: "",
      });
    });
    const finalize = async (cities?: string[]) =>
      await t.mutation(internal.items.finalizeItem, {
        itemId,
        reading: {},
        classification: {
          title: "Date spots",
          description: "Bars in Bandra",
          tags: [],
          ...(cities !== undefined ? { cities } : {}),
        },
      });

    await finalize(["Mumbai"]);
    await finalize();
    expect(
      await t.run(async (ctx) => (await ctx.db.get(itemId))?.cities),
    ).toEqual(["Mumbai"]);

    await finalize([]);
    expect(
      await t.run(async (ctx) => (await ctx.db.get(itemId))?.cities),
    ).toEqual([]);
  });
});

describe("failed saves and retry", () => {
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
    const { t, userId } = await as();
    const itemId = await seedLink(t, userId, { status: "processing" });
    await t.mutation(internal.items.failItem, { itemId, reason: "not_found" });
    const item = await t.run(async (ctx) => await ctx.db.get(itemId));
    expect(item?.status).toBe("failed");
    expect(item?.failureReason).toBe("not_found");
  });

  it("retries a failed item, clearing the reason and re-queueing processing", async () => {
    const { t, userId } = await as();
    const itemId = await seedLink(t, userId, {
      status: "failed",
      failureReason: "error",
    });
    await t.mutation(api.items.reprocessItem, { id: itemId });
    const item = await t.run(async (ctx) => await ctx.db.get(itemId));
    expect(item?.status).toBe("processing");
    expect(item?.failureReason).toBeUndefined();
  });

  it("retries a partially enriched item", async () => {
    const { t, userId } = await as();
    const itemId = await seedLink(t, userId, {
      status: "ready",
      enrichment: "partial",
    });
    await t.mutation(api.items.reprocessItem, { id: itemId });
    const item = await t.run(async (ctx) => await ctx.db.get(itemId));
    expect(item?.status).toBe("processing");
    expect(item?.enrichment).toBeUndefined();
  });

  it("does not retry a no-article link (the URL itself is the save)", async () => {
    const { t, userId } = await as();
    const itemId = await seedLink(t, userId, {
      status: "ready",
      enrichment: "no_article",
    });
    await t.mutation(api.items.reprocessItem, { id: itemId });
    const item = await t.run(async (ctx) => await ctx.db.get(itemId));
    expect(item?.status).toBe("ready");
    expect(item?.enrichment).toBe("no_article");
  });

  it("does not retry a page that is gone (a 404 will not change)", async () => {
    const { t, userId } = await as();
    const itemId = await seedLink(t, userId, {
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
      const { t, userId } = await as();
      const id = await t.run((ctx) =>
        ctx.db.insert("items", {
          userId,
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
      await t.run((ctx) => ctx.db.patch(id, { failureReason: "error" }));
      await t.mutation(api.items.reprocessItem, { id });
      expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
        status: "processing",
      });
    },
  );

  it("does not retry a fully enriched item", async () => {
    const { t, userId } = await as();
    const itemId = await seedLink(t, userId, { status: "ready" });
    await t.mutation(api.items.reprocessItem, { id: itemId });
    const item = await t.run(async (ctx) => await ctx.db.get(itemId));
    expect(item?.status).toBe("ready");
  });

  it("refuses to retry another user's item", async () => {
    const { t: owner, userId: ownerId } = await as();
    const itemId = await seedLink(owner, ownerId, {
      status: "failed",
      failureReason: "error",
    });
    const { t: attacker } = await as();
    await expect(
      attacker.mutation(api.items.reprocessItem, { id: itemId }),
    ).rejects.toThrow(/Item not found/);
    const item = await owner.run(async (ctx) => await ctx.db.get(itemId));
    expect(item?.status).toBe("failed");
  });

  it("blocks retry for a lapsed user", async () => {
    const { t, userId } = await signedInUser(newConvexTest());
    await t.run(async (ctx) => {
      await ctx.db.insert("subscriptions", {
        userId,
        status: "lapsed",
        expiresAt: Date.now() - 1000,
        updatedAt: Date.now(),
      });
    });
    const itemId = await seedLink(t, userId, {
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
    const { t } = await as();
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
    const { t, userId } = await as();
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
        .withIndex("by_user", (q) => q.eq("userId", userId))
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
    const { t, userId } = await as();
    await seedFeed(t, userId, 1);
    await t.run(async (ctx) => {
      for (let i = 1; i <= 5; i++) {
        await ctx.db.insert("items", {
          userId,
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
        "https://EXAMPLE.com/0",
        "https://example.com/Fresh",
        "https://example.com/Fresh",
        "https://example.com/fresh",
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
    const { t } = await as();
    const urls = Array.from(
      { length: 51 },
      (_, i) => `https://example.com/${i}`,
    );
    await expect(t.mutation(api.items.importLinks, { urls })).rejects.toThrow(
      /at most 50 URLs/,
    );
  });

  it("draws from its own bucket, not the single-save itemCreate burst", async () => {
    const { t } = await as();
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
    const { t, userId } = await as();
    const batch = Array.from(
      { length: 10 },
      (_, i) => `https://example.com/${i}`,
    );
    await t.mutation(api.items.importLinks, { urls: batch });
    await t.run(async (ctx) => {
      const { ok } = await rateLimiter.limit(ctx, "bulkImport", {
        key: userId,
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
      const { t } = await as();
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

  it.each([
    {
      size: OVERSIZED,
      code: "image_too_large",
      message: IMAGE_TOO_LARGE_MESSAGE,
    },
    { size: 0, code: "image_empty", message: IMAGE_EMPTY_MESSAGE },
  ] as const)(
    "blocks legacy $code pending uploads at finalization",
    async ({ size, code, message }) => {
      const { t, userId } = await as();
      await t.run(async (ctx) => {
        const storageId = await ctx.storage.store(
          new Blob([new Uint8Array(size)]),
        );
        await ctx.db.insert("itemOperations", {
          userId,
          operationId: OP_ID,
          kind: "image",
          status: "pending",
          storageId,
          updatedAt: Date.now(),
        });
      });
      await expectSaveRefusal(
        t.mutation(api.items.finalizeImageImport, { operationId: OP_ID }),
        code,
        message,
      );
      expect(
        await t.run((ctx) => ctx.db.query("items").collect()),
      ).toHaveLength(0);
    },
  );

  it("does not charge or queue product-search retries for missing photos", async () => {
    const { t, userId } = await as();
    const id = await t.run((ctx) =>
      ctx.db.insert("items", {
        userId,
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

  it("lets a product search whose action died be pressed again", async () => {
    const { t, userId } = await as();
    const id = await t.run((ctx) =>
      ctx.db.insert("items", {
        userId,
        type: "note",
        status: "ready",
        note: "chair",
        tags: [],
        searchText: "",
      }),
    );
    await t.mutation(api.items.findLinks, { id });
    await t.run(async (ctx) => {
      for (const job of await ctx.db.system
        .query("_scheduled_functions")
        .collect()) {
        if (job.name.includes("findProductLinks")) {
          await ctx.scheduler.cancel(job._id);
        }
      }
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      productsStatus: "failed",
    });

    await t.mutation(api.items.findLinks, { id });
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      productsStatus: "searching",
    });
  });

  it("leaves a newer product search alone when an older one expires", async () => {
    const { t, userId } = await as();
    const id = await t.run((ctx) =>
      ctx.db.insert("items", {
        userId,
        type: "note",
        status: "ready",
        tags: [],
        searchText: "",
        productsStatus: "searching",
        productsSearchStartedAt: 2,
      }),
    );
    await t.mutation(internal.items.expireProductSearch, {
      itemId: id,
      startedAt: 1,
    });
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      productsStatus: "searching",
    });
  });

  it("does not delete an oversized photo referenced by another item", async () => {
    const { t } = await as();
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
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(new Date("2026-09-10T12:00:00Z"));
  });

  it("stamps a run id and start time on every path that starts processing", async () => {
    const { t } = await as();
    const noteId = await t.mutation(api.items.createNoteItem, {
      text: "a note",
    });
    const note = await t.run((ctx) => ctx.db.get(noteId));
    expect(note).toMatchObject({
      status: "processing",
      processingStartedAt: Date.now(),
    });
    expect(typeof note?.processingRunId).toBe("string");
    const [job] = await scheduledJobs(t, "ai:processItem");
    expect(job.args[0]).toEqual({
      itemId: noteId,
      runId: note?.processingRunId,
    });

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
    expect((await byId(stale))?.processingRunId).toBeDefined();
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
    const { t, userId } = await as();
    const itemId = await processingLink(t, userId, FRESH_AGE);
    const current = (await t.run((ctx) => ctx.db.get(itemId)))!.processingRunId;

    const stale = await t.mutation(internal.items.finalizeItem, {
      itemId,
      runId: "run-superseded",
      reading: {},
      classification: {
        title: "Old result",
        description: "From the run the user retried past",
        tags: ["stale"],
      },
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

    const applied = await t.mutation(internal.items.finalizeItem, {
      itemId,
      runId: current,
      reading: {},
      classification: {
        title: "Current result",
        description: "From the run that owns the item",
        tags: ["current"],
      },
    });
    expect(applied).toBe("applied");
    expect(await t.run((ctx) => ctx.db.get(itemId))).toMatchObject({
      status: "ready",
      title: "Current result",
    });
  });

  it("schedules one processed event for each applied terminal outcome", async () => {
    const t = newConvexTest();
    const readyId = await processingLink(t, "processed", FRESH_AGE);
    const readyRun = (await t.run((ctx) => ctx.db.get(readyId)))!
      .processingRunId;
    await t.mutation(internal.items.finalizeItem, {
      itemId: readyId,
      runId: readyRun,
      reading: { enrichment: "partial" },
      classification: { title: "Ready", description: "Usable", tags: [] },
    });

    const failedId = await processingLink(t, "processed", FRESH_AGE);
    const failedRun = (await t.run((ctx) => ctx.db.get(failedId)))!
      .processingRunId;
    await t.mutation(internal.items.failItem, {
      itemId: failedId,
      reason: "not_found",
      runId: failedRun,
    });

    const jobs = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    const processed = jobs.filter(
      (job) => job.name === "analytics:captureItemProcessed",
    );
    expect(processed).toHaveLength(2);
    expect(processed.map((job) => job.args[0])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemId: readyId,
          outcome: "ready",
          enrichment: "partial",
          processingMs: expect.any(Number),
        }),
        expect.objectContaining({
          itemId: failedId,
          outcome: "failed",
          failureReason: "not_found",
          processingMs: expect.any(Number),
        }),
      ]),
    );
  });

  it("does not report a processed event for a ready note refresh", async () => {
    const t = newConvexTest();
    const itemId = await t.run((ctx) =>
      ctx.db.insert("items", {
        userId: "refresh",
        type: "note",
        note: "Updated note",
        status: "ready",
        processingRunId: "refresh-run",
        processingStartedAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
        tags: [],
        searchText: "updated note",
      }),
    );

    await t.mutation(internal.items.finalizeItem, {
      itemId,
      runId: "refresh-run",
      keepTitle: true,
      reading: {},
      classification: {
        title: "Updated note",
        description: "The refreshed note",
        tags: ["note"],
      },
    });

    const jobs = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(
      jobs.filter((job) => job.name === "analytics:captureItemProcessed"),
    ).toHaveLength(0);
  });

  it("finalizeItem reports a deleted item as missing", async () => {
    const t = newConvexTest();
    const itemId = await processingLink(t, "gone", FRESH_AGE);
    await t.run((ctx) => ctx.db.delete(itemId));
    await expect(
      t.mutation(internal.items.finalizeItem, {
        itemId,
        reading: {},
        classification: { title: "x", description: "y", tags: [] },
      }),
    ).resolves.toBe("missing");
  });

  it("finalizeItem persists a recipe extracted from a recipe page", async () => {
    const { t, userId } = await as();
    const itemId = await processingLink(t, userId, FRESH_AGE);
    const runId = (await t.run((ctx) => ctx.db.get(itemId)))!.processingRunId;
    const recipe = {
      name: "Pancakes",
      servings: "4 servings",
      ingredients: ["2 cups flour", "2 eggs"],
      steps: ["Whisk.", "Fry."],
    };
    await t.mutation(internal.items.finalizeItem, {
      itemId,
      runId,
      reading: { recipe },
      classification: {
        title: "Pancakes",
        description: "Fluffy breakfast pancakes",
        tags: ["breakfast"],
      },
    });
    expect(await t.run((ctx) => ctx.db.get(itemId))).toMatchObject({ recipe });
  });

  it("keeps the recipe off the feed card", async () => {
    const { t, userId } = await as();
    const itemId = await processingLink(t, userId, FRESH_AGE);
    const runId = (await t.run((ctx) => ctx.db.get(itemId)))!.processingRunId;
    await t.mutation(internal.items.finalizeItem, {
      itemId,
      runId,
      reading: {
        recipe: {
          name: "Pancakes",
          servings: "4 servings",
          ingredients: ["2 cups flour", "2 eggs"],
          steps: ["Whisk.", "Fry."],
        },
      },
      classification: {
        title: "Pancakes",
        description: "Fluffy breakfast pancakes",
        tags: ["breakfast"],
      },
    });

    const feed = await t.query(api.items.listItemsPage, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(feed.page.map((item) => item._id)).toContain(itemId);
    expect(feed.page[0]).not.toHaveProperty("recipe");
  });

  it("reprocessItem accepts a stale processing item and refuses a fresh one", async () => {
    const now = Date.now();
    vi.setSystemTime(now - STALE_AGE - 60_000);
    const { t, userId } = await signedInUser(newConvexTest());
    vi.setSystemTime(now);
    const legacyStale = await processingLink(t, userId, STALE_AGE, {
      legacy: true,
    });
    await t.run((ctx) =>
      ctx.db.insert("subscriptions", {
        userId,
        status: "pro",
        expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
        updatedAt: Date.now(),
      }),
    );
    const stale = await processingLink(t, userId, STALE_AGE);
    const fresh = await processingLink(t, userId, FRESH_AGE);
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

describe("share links", () => {
  async function seedItem(
    t: TestCtx,
    userId: string,
    fields: Partial<{
      type: "image" | "link" | "note";
      status: "processing" | "ready" | "failed";
    }> = {},
  ): Promise<Id<"items">> {
    return await t.run(async (ctx) =>
      ctx.db.insert("items", {
        userId,
        type: fields.type ?? "link",
        status: fields.status ?? "ready",
        title: "A great recipe",
        description: "Weeknight pasta",
        url: "https://example.com/recipe",
        tags: ["food"],
        searchText: "a great recipe",
      }),
    );
  }

  it("mints one token per item and serves a narrow preview for it", async () => {
    const { t, userId } = await as();
    const itemId = await seedItem(t, userId);

    const token = await t.mutation(api.items.createShareLink, { itemId });
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(await t.mutation(api.items.createShareLink, { itemId })).toBe(token);

    const preview = await t.query(internal.items.getSharePreview, {
      token: token!,
    });
    expect(preview).toEqual({
      type: "link",
      title: "A great recipe",
      description: "Weeknight pasta",
      imageUrl: undefined,
      sourceUrl: "https://example.com/recipe",
      noteText: undefined,
    });
  });

  it("names the sender by first name only", async () => {
    const base = newConvexTest();
    const named = await base.run((ctx) =>
      ctx.db.insert("users", {
        name: "  Ashish Huddar ",
        email: "a@example.com",
      }),
    );
    const unnamed = await base.run((ctx) => ctx.db.insert("users", {}));
    const emailOnly = await base.run((ctx) =>
      ctx.db.insert("users", {
        name: "private@privaterelay.appleid.com",
        email: "private@privaterelay.appleid.com",
      }),
    );
    const previewFor = async (userId: string) => {
      const t = base.withIdentity({ subject: `${userId}|session-1` });
      await seedPro(t, userId);
      const itemId = await seedItem(t, userId);
      const token = await t.mutation(api.items.createShareLink, { itemId });
      return await t.query(internal.items.getSharePreview, { token: token! });
    };

    expect((await previewFor(named))?.senderName).toBe("Ashish");
    expect((await previewFor(unnamed))?.senderName).toBeUndefined();
    expect((await previewFor(emailOnly))?.senderName).toBeUndefined();
  });

  it("does not treat an item id as a token", async () => {
    const { t, userId } = await as();
    const itemId = await seedItem(t, userId);
    await t.mutation(api.items.createShareLink, { itemId });

    expect(
      await t.query(internal.items.getSharePreview, { token: itemId }),
    ).toBeNull();
  });

  it("returns no token for an unfinished save or an image", async () => {
    const { t, userId } = await as();
    const processing = await seedItem(t, userId, {
      status: "processing",
    });
    const image = await seedItem(t, userId, { type: "image" });

    expect(
      await t.mutation(api.items.createShareLink, { itemId: processing }),
    ).toBeNull();
    expect(
      await t.mutation(api.items.createShareLink, { itemId: image }),
    ).toBeNull();
  });

  it("refuses another user's item", async () => {
    const backend = newConvexTest();
    const { t: owner, userId: ownerId } = await signedInUser(backend);
    const { t: other } = await signedInUser(backend);
    const itemId = await seedItem(owner, ownerId);

    await expect(
      other.mutation(api.items.createShareLink, { itemId }),
    ).rejects.toThrow("Item not found");
  });

  it("withdraws a link minted for a share the owner then cancelled", async () => {
    const { t, userId } = await as();
    const itemId = await seedItem(t, userId);
    const token = await t.mutation(api.items.createShareLink, {
      itemId,
      settles: true,
    });

    await t.mutation(api.items.settleShareLink, { itemId, shared: false });
    expect(
      await t.query(internal.items.getSharePreview, { token: token! }),
    ).toBeNull();

    await t.mutation(api.items.settleShareLink, { itemId, shared: false });
    await t.mutation(api.items.settleShareLink, { itemId, shared: true });
    const next = await t.mutation(api.items.createShareLink, { itemId });
    expect(next).toMatch(/^[0-9a-f]{32}$/);
    expect(next).not.toBe(token);
  });

  it("keeps a link an older build already handed out when a later share is cancelled", async () => {
    const { t, userId } = await as();
    const itemId = await seedItem(t, userId);
    const token = await t.mutation(api.items.createShareLink, { itemId });

    expect(await t.mutation(api.items.createShareLink, { itemId })).toBe(token);
    await t.mutation(api.items.settleShareLink, { itemId, shared: false });
    expect(
      await t.query(internal.items.getSharePreview, { token: token! }),
    ).not.toBeNull();
  });

  it("keeps a link the owner really shared when a later share is cancelled", async () => {
    const { t, userId } = await as();
    const itemId = await seedItem(t, userId);
    const token = await t.mutation(api.items.createShareLink, { itemId });

    await t.mutation(api.items.settleShareLink, { itemId, shared: true });
    await t.mutation(api.items.settleShareLink, { itemId, shared: true });
    expect(await t.mutation(api.items.createShareLink, { itemId })).toBe(token);
    await t.mutation(api.items.settleShareLink, { itemId, shared: false });

    expect(
      await t.query(internal.items.getSharePreview, { token: token! }),
    ).not.toBeNull();
  });

  it("keeps a link from a client that never reports, when a share is cancelled", async () => {
    const { t, userId } = await as();
    const itemId = await seedItem(t, userId);
    const token = await t.mutation(api.items.createShareLink, { itemId });

    await t.mutation(api.items.settleShareLink, { itemId, shared: false });
    expect(
      await t.query(internal.items.getSharePreview, { token: token! }),
    ).not.toBeNull();
  });

  it("withdraws a cancelled link however late the cancel arrives", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const now = new Date("2026-10-08T12:00:00Z").getTime();
    vi.setSystemTime(now - 3 * 60 * 60 * 1000);
    const { t, userId } = await signedInUser(newConvexTest());
    const itemId = await seedItem(t, userId);
    const token = await t.mutation(api.items.createShareLink, {
      itemId,
      settles: true,
    });

    vi.setSystemTime(now);
    await t.mutation(api.items.settleShareLink, { itemId, shared: false });
    expect(
      await t.query(internal.items.getSharePreview, { token: token! }),
    ).toBeNull();
  });

  it("stops treating a link as this attempt's once it has gone out", async () => {
    const { t, userId } = await as();
    const itemId = await seedItem(t, userId);
    const token = await t.mutation(api.items.createShareLink, {
      itemId,
      settles: true,
    });
    await t.mutation(api.items.settleShareLink, { itemId, shared: true });

    await t.mutation(api.items.settleShareLink, { itemId, shared: false });
    expect(
      await t.query(internal.items.getSharePreview, { token: token! }),
    ).not.toBeNull();
  });

  it("does not let another user settle a link", async () => {
    const backend = newConvexTest();
    const { t: owner, userId: ownerId } = await signedInUser(backend);
    const { t: other } = await signedInUser(backend);
    const itemId = await seedItem(owner, ownerId);
    const token = await owner.mutation(api.items.createShareLink, { itemId });

    await expect(
      other.mutation(api.items.settleShareLink, { itemId, shared: false }),
    ).rejects.toThrow("Item not found");
    expect(
      await owner.query(internal.items.getSharePreview, { token: token! }),
    ).not.toBeNull();
  });

  it("stops serving the preview the moment account deletion starts", async () => {
    const { t, userId } = await as();
    await seedNotes(t, userId as Id<"users">, 150);
    const itemId = await seedItem(t, userId);
    const token = await t.mutation(api.items.createShareLink, { itemId });

    await t.mutation(api.users.deleteCurrentUserAccount, {});

    const link = await t.run((ctx) =>
      ctx.db
        .query("shareLinks")
        .withIndex("by_token", (q) => q.eq("token", token!))
        .unique(),
    );
    expect(link).not.toBeNull();
    expect(await t.run((ctx) => ctx.db.get(itemId))).not.toBeNull();
    expect(
      await t.query(internal.items.getSharePreview, { token: token! }),
    ).toBeNull();
  });

  it("stops serving the preview once the item is deleted", async () => {
    const { t, userId } = await as();
    const itemId = await seedItem(t, userId);
    const token = await t.mutation(api.items.createShareLink, { itemId });

    await t.mutation(api.items.deleteItem, { id: itemId });

    expect(
      await t.query(internal.items.getSharePreview, { token: token! }),
    ).toBeNull();
    const links = await t.run((ctx) => ctx.db.query("shareLinks").collect());
    expect(links).toEqual([]);
  });
});
