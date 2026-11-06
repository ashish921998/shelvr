// @vitest-environment edge-runtime
import { isRateLimitError } from "@convex-dev/rate-limiter";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  CITY,
  creatorWithPage,
  follower,
  insertSave,
  listRows,
  listsOwnedBy,
  NOTE_TEXT,
  PAGE_ORDER,
  PINS,
  POSTS,
  TAGS,
  TITLES,
} from "./creatorMaps.test.helpers";
import { MAX_LISTS_PER_USER } from "./model/sharedLists";
import type { TestBackend } from "./test.setup";

const LIST_NAME = "Maya’s Mexico City";
const UNKNOWN_TOKEN = "0".repeat(32);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function preview(backend: TestBackend, token: string, city = CITY) {
  return backend.query(api.creatorMaps.creatorMapPreview, { token, city });
}

type Caller = Awaited<ReturnType<typeof follower>>;

function save(
  person: Caller,
  token: string,
  options: { city?: string; name?: string } = {},
) {
  return person.t.mutation(api.creatorMaps.saveCreatorMap, {
    token,
    city: options.city ?? CITY,
    name: options.name ?? LIST_NAME,
  });
}

async function savedListId(
  person: Caller,
  token: string,
): Promise<Id<"sharedLists">> {
  const result = await save(person, token);
  if (result.status !== "saved") throw new Error(`not saved: ${result.status}`);
  return result.listId;
}

async function placeNames(person: Caller, listId: Id<"sharedLists">) {
  const list = await person.t.query(api.sharedLists.getSharedList, { listId });
  return list?.places.map((place) => place.name);
}

async function refusal(promise: Promise<unknown>): Promise<unknown> {
  return await promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

async function fillLists(
  backend: TestBackend,
  userId: Id<"users">,
  count: number,
) {
  await backend.run(async (ctx) => {
    for (let n = 0; n < count; n++) {
      const listId = await ctx.db.insert("sharedLists", {
        ownerId: userId,
        name: `List ${n}`,
        cities: ["Lisbon"],
        inviteToken: `filler-${userId}-${n}`,
        placeCount: 0,
        createdAt: n,
      });
      await ctx.db.insert("sharedListMembers", {
        listId,
        userId,
        joinedAt: n,
        seenAt: n,
      });
    }
  });
}

describe("creatorMapPreview", () => {
  it("answers a signed-out caller with the first name, the city and the page's first names", async () => {
    const { backend, token } = await creatorWithPage();
    await expect(preview(backend, token)).resolves.toEqual({
      ownerName: "Maya",
      city: CITY,
      placeCount: 4,
      placeNames: PAGE_ORDER.slice(0, 3),
    });
    await expect(preview(backend, token, "Austin")).resolves.toEqual({
      ownerName: "Maya",
      city: "Austin",
      placeCount: 1,
      placeNames: ["Jo's Coffee"],
    });
  });

  it("leaves the name out when the creator has none", async () => {
    const { backend, token } = await creatorWithPage({ name: "" });
    await expect(preview(backend, token)).resolves.toEqual({
      city: CITY,
      placeCount: 4,
      placeNames: PAGE_ORDER.slice(0, 3),
    });
  });

  it("is null unless the city is one of the page's stored spellings", async () => {
    const { backend, token } = await creatorWithPage();
    for (const city of [
      " mexico city ",
      "mexico city",
      "Mexico  City",
      "MEXICO CITY",
      "",
      "Lisbon",
    ]) {
      await expect(preview(backend, token, city)).resolves.toBeNull();
    }
  });

  it("is null for a malformed, unknown or old link, a blocked page, Save all off, or a deleting creator", async () => {
    const { backend, creator, token } = await creatorWithPage();
    for (const dead of ["nothex", UNKNOWN_TOKEN, token.toUpperCase()]) {
      await expect(preview(backend, dead)).resolves.toBeNull();
    }

    await backend.mutation(internal.publicMaps.setPublicMapBlocked, {
      token,
      blocked: true,
    });
    await expect(preview(backend, token)).resolves.toBeNull();
    await backend.mutation(internal.publicMaps.setPublicMapBlocked, {
      token,
      blocked: false,
    });
    await expect(preview(backend, token)).resolves.not.toBeNull();

    await creator.t.mutation(api.publicMaps.setPublicMapSaveAll, { on: false });
    await expect(preview(backend, token)).resolves.toBeNull();
    await creator.t.mutation(api.publicMaps.setPublicMapSaveAll, { on: true });

    const rotated = await creator.t.mutation(
      api.publicMaps.rotatePublicMapLink,
      {},
    );
    await expect(preview(backend, token)).resolves.toBeNull();
    await expect(preview(backend, rotated!)).resolves.not.toBeNull();

    await backend.run((ctx) =>
      ctx.db.patch(creator.userId, { deleting: true }),
    );
    await expect(preview(backend, rotated!)).resolves.toBeNull();
  });
});

describe("saveCreatorMap", () => {
  it("copies the page's places into a new list the follower owns, without Pro", async () => {
    const { backend, token, mapId } = await creatorWithPage();
    const bo = await follower(backend);
    const result = await save(bo, token);
    expect(result).toEqual({
      status: "saved",
      listId: expect.any(String),
      added: 4,
      created: true,
    });
    if (result.status !== "saved") return;

    const { list, places, members } = await listRows(backend, result.listId);
    expect(list).toMatchObject({
      ownerId: bo.userId,
      name: LIST_NAME,
      cities: [CITY],
      placeCount: 4,
      fromMap: { mapId, city: CITY },
    });
    expect(members.map((member) => member.userId)).toEqual([bo.userId]);
    expect(places.map((place) => place.name)).toEqual(PAGE_ORDER);
    for (const place of places) {
      expect(place).not.toHaveProperty("tags");
      expect(place).not.toHaveProperty("itemId");
      expect(place.addedBy).toBe(bo.userId);
    }

    const seen = await bo.t.query(api.sharedLists.getSharedList, {
      listId: result.listId,
    });
    expect(seen?.isOwner).toBe(true);
    expect(seen?.places.map((place) => place.name)).toEqual(PAGE_ORDER);
    for (const place of seen?.places ?? []) {
      expect(place).toMatchObject({
        addedByYou: true,
        isNew: false,
        city: CITY,
        lat: PINS[place.name].lat,
        lng: PINS[place.name].lng,
      });
      expect(place).not.toHaveProperty("itemId");
      expect(place).not.toHaveProperty("visitedAt");
      if (POSTS[place.name] === undefined) {
        expect(place).not.toHaveProperty("postUrl");
      } else {
        expect(place.postUrl).toBe(POSTS[place.name]);
      }
    }
    expect(seen?.places[0]).toMatchObject({
      appleId: "apple-contramar",
      category: "Restaurant",
    });
  });

  it("gives the follower none of the creator's words, links or ids", async () => {
    const { backend, creator, token, mapId, itemIds } = await creatorWithPage();
    const bo = await follower(backend);
    const listId = await savedListId(bo, token);
    const json = JSON.stringify(
      await bo.t.query(api.sharedLists.getSharedList, { listId }),
    );
    for (const hidden of [
      ...TITLES,
      NOTE_TEXT,
      ...TAGS,
      ...itemIds,
      creator.userId,
      mapId,
      token,
      "Museo Frida Kahlo",
      "Calle Durango",
      "El Moro",
      "igsh",
      "si=",
      "vm.tiktok",
      "is_from_webapp",
      "someone",
      "example.com",
    ]) {
      expect(json).not.toContain(hidden);
    }
  });

  it("adds nothing on a second save and keeps one list", async () => {
    const { backend, token } = await creatorWithPage();
    const bo = await follower(backend);
    const listId = await savedListId(bo, token);
    await expect(save(bo, token)).resolves.toEqual({
      status: "saved",
      listId,
      added: 0,
      created: false,
    });
    expect(await listsOwnedBy(backend, bo.userId)).toHaveLength(1);
    expect((await listRows(backend, listId)).places).toHaveLength(4);
  });

  it("copies every place the preview names, even one whose name sits inside a nearby place's", async () => {
    const { backend, creator, token } = await creatorWithPage();
    const tikTok =
      "https://www.tiktok.com/@shelvr.fixtures/video/7300000000000000002";
    await insertSave(backend, creator.userId, {
      url: tikTok,
      placePins: [{ name: "Rosetta", lat: 19.4199, lng: -99.1611 }],
    });
    const shown = ["Contramar", "Rosetta", ...PAGE_ORDER.slice(1)];
    await expect(preview(backend, token)).resolves.toMatchObject({
      placeCount: 5,
      placeNames: shown.slice(0, 3),
    });

    const bo = await follower(backend);
    const listId = await savedListId(bo, token);
    const list = await bo.t.query(api.sharedLists.getSharedList, { listId });
    expect(list?.places.map((place) => [place.name, place.postUrl])).toEqual(
      shown.map((name) => [name, name === "Rosetta" ? tikTok : POSTS[name]]),
    );
    await expect(save(bo, token)).resolves.toMatchObject({ added: 0 });
  });

  it("puts a place the creator saved since at the top", async () => {
    const { backend, creator, token } = await creatorWithPage();
    const bo = await follower(backend);
    const listId = await savedListId(bo, token);
    await insertSave(backend, creator.userId, {
      title: "Lardo for brunch",
      url: "https://www.instagram.com/p/CLardo123/",
      placePins: [{ name: "Lardo", lat: 19.4122, lng: -99.1723 }],
    });
    await expect(save(bo, token)).resolves.toEqual({
      status: "saved",
      listId,
      added: 1,
      created: false,
    });
    expect(await placeNames(bo, listId)).toEqual(["Lardo", ...PAGE_ORDER]);
  });

  it("adds back a place the follower removed, at the top", async () => {
    const { backend, token } = await creatorWithPage();
    const bo = await follower(backend);
    const listId = await savedListId(bo, token);
    const { places } = await listRows(backend, listId);
    const rosetta = places.find((place) => place.name === "Panadería Rosetta");
    await bo.t.mutation(api.sharedLists.removeSharedListPlace, {
      placeId: rosetta!._id,
    });
    await expect(save(bo, token)).resolves.toMatchObject({
      listId,
      added: 1,
      created: false,
    });
    expect(await placeNames(bo, listId)).toEqual([
      "Panadería Rosetta",
      "Contramar",
      "Café Avellaneda",
      "Taquería Orinoco",
    ]);
  });

  it("merges a save through a new link into the same list", async () => {
    const { backend, creator, token } = await creatorWithPage();
    const bo = await follower(backend);
    const listId = await savedListId(bo, token);
    const rotated = await creator.t.mutation(
      api.publicMaps.rotatePublicMapLink,
      {},
    );
    await expect(save(bo, rotated!)).resolves.toEqual({
      status: "saved",
      listId,
      added: 0,
      created: false,
    });
    await expect(save(bo, token)).resolves.toEqual({ status: "gone" });
  });

  it("makes a second list from a page turned off and made again, and leaves the first", async () => {
    const { backend, creator, token } = await creatorWithPage();
    const bo = await follower(backend);
    const first = await savedListId(bo, token);
    const before = await listRows(backend, first);
    await creator.t.mutation(api.publicMaps.turnOffPublicMap, {});
    const { token: again } = await creator.t.mutation(
      api.publicMaps.setPublicMapCities,
      { cities: [CITY] },
    );
    await creator.t.mutation(api.publicMaps.setPublicMapSaveAll, { on: true });
    const result = await save(bo, again);
    expect(result).toMatchObject({ status: "saved", added: 4, created: true });
    if (result.status !== "saved") return;
    expect(result.listId).not.toBe(first);
    const lists = await listsOwnedBy(backend, bo.userId);
    expect(lists.map((list) => list.name)).toEqual([LIST_NAME, LIST_NAME]);
    expect(await listRows(backend, first)).toEqual(before);
  });

  it("makes a member of someone else's list for the page a list of their own", async () => {
    const { backend, token } = await creatorWithPage();
    const bo = await follower(backend);
    const boList = await savedListId(bo, token);
    const cy = await follower(backend, "Cy Reyes");
    const { list } = await listRows(backend, boList);
    await cy.t.mutation(api.sharedLists.joinSharedList, {
      token: list!.inviteToken,
    });
    const result = await save(cy, token);
    expect(result).toMatchObject({ status: "saved", added: 4, created: true });
    if (result.status !== "saved") return;
    expect(result.listId).not.toBe(boList);
    expect((await listRows(backend, result.listId)).list?.ownerId).toBe(
      cy.userId,
    );
    expect((await listRows(backend, boList)).places).toHaveLength(4);
  });

  it("lets the creator save their own page into a list of their own", async () => {
    const { backend, creator, token } = await creatorWithPage();
    const result = await save(creator, token);
    expect(result).toMatchObject({ status: "saved", added: 4, created: true });
    if (result.status !== "saved") return;
    expect((await listRows(backend, result.listId)).list?.ownerId).toBe(
      creator.userId,
    );
  });

  describe("refuses", () => {
    it("a dead link or a city not on the page as gone, and makes nothing", async () => {
      const { backend, creator, token } = await creatorWithPage();
      const bo = await follower(backend);
      const gone = { status: "gone" };

      await expect(save(bo, token, { city: "Lisbon" })).resolves.toEqual(gone);
      await expect(save(bo, token, { city: "mexico city" })).resolves.toEqual(
        gone,
      );
      await expect(save(bo, "nothex")).resolves.toEqual(gone);

      await backend.mutation(internal.publicMaps.setPublicMapBlocked, {
        token,
        blocked: true,
      });
      await expect(save(bo, token)).resolves.toEqual(gone);
      await backend.mutation(internal.publicMaps.setPublicMapBlocked, {
        token,
        blocked: false,
      });

      await creator.t.mutation(api.publicMaps.setPublicMapSaveAll, {
        on: false,
      });
      await expect(save(bo, token)).resolves.toEqual(gone);
      await creator.t.mutation(api.publicMaps.setPublicMapSaveAll, {
        on: true,
      });

      const rotated = await creator.t.mutation(
        api.publicMaps.rotatePublicMapLink,
        {},
      );
      await expect(save(bo, token)).resolves.toEqual(gone);

      await backend.run((ctx) =>
        ctx.db.patch(creator.userId, { deleting: true }),
      );
      await expect(save(bo, rotated!)).resolves.toEqual(gone);
      expect(await listsOwnedBy(backend, bo.userId)).toEqual([]);
    });

    it("a city whose pins are all notes' or addresses as empty", async () => {
      const { backend, creator, token } = await creatorWithPage({
        cities: [CITY, "Oaxaca"],
      });
      await insertSave(backend, creator.userId, {
        cities: ["Oaxaca"],
        url: "https://www.instagram.com/reel/OaxacaAddr/",
        placePins: [{ name: "Calle Durango 200", lat: 17.06, lng: -96.72 }],
      });
      await insertSave(backend, creator.userId, {
        type: "note",
        cities: ["Oaxaca"],
        note: "Textile museum on Hidalgo.",
        placePins: [{ name: "Museo Textil", lat: 17.0625, lng: -96.7266 }],
      });
      await expect(preview(backend, token, "Oaxaca")).resolves.toEqual({
        ownerName: "Maya",
        city: "Oaxaca",
        placeCount: 0,
        placeNames: [],
      });
      const bo = await follower(backend);
      await expect(save(bo, token, { city: "Oaxaca" })).resolves.toEqual({
        status: "empty",
      });
      expect(await listsOwnedBy(backend, bo.userId)).toEqual([]);
    });

    it(`a follower on ${MAX_LISTS_PER_USER} lists, unless one of them is this page's`, async () => {
      const { backend, token } = await creatorWithPage();
      const full = await follower(backend);
      await fillLists(backend, full.userId, MAX_LISTS_PER_USER);
      await expect(save(full, token)).resolves.toEqual({
        status: "tooManyLists",
      });
      expect(await listsOwnedBy(backend, full.userId)).toHaveLength(
        MAX_LISTS_PER_USER,
      );

      const bo = await follower(backend, "Bo Again");
      const listId = await savedListId(bo, token);
      await fillLists(backend, bo.userId, MAX_LISTS_PER_USER - 1);
      await expect(save(bo, token)).resolves.toEqual({
        status: "saved",
        listId,
        added: 0,
        created: false,
      });
    });

    it("a caller who is signed out or deleting, before anything runs", async () => {
      const { backend, token } = await creatorWithPage();
      await expect(
        backend.mutation(api.creatorMaps.saveCreatorMap, {
          token,
          city: CITY,
          name: LIST_NAME,
        }),
      ).rejects.toThrow("Not authenticated");
      const bo = await follower(backend);
      await backend.run((ctx) => ctx.db.patch(bo.userId, { deleting: true }));
      await expect(save(bo, token)).rejects.toThrow("Not authenticated");
      expect(await listsOwnedBy(backend, bo.userId)).toEqual([]);
    });
  });

  describe("names the list", () => {
    it("after the city when the name is blank", async () => {
      const { backend, token } = await creatorWithPage();
      const bo = await follower(backend);
      const result = await save(bo, token, { name: "   " });
      if (result.status !== "saved") throw new Error(result.status);
      expect((await listRows(backend, result.listId)).list?.name).toBe(CITY);
    });

    it("with at most 60 characters", async () => {
      const { backend, token } = await creatorWithPage();
      const bo = await follower(backend);
      const result = await save(bo, token, { name: "M".repeat(100) });
      if (result.status !== "saved") throw new Error(result.status);
      expect((await listRows(backend, result.listId)).list?.name).toBe(
        "M".repeat(60),
      );
    });
  });

  describe("limits", () => {
    it(
      "one follower's burst, and not the next follower",
      { timeout: 60_000 },
      async () => {
        vi.useFakeTimers();
        const { backend, token } = await creatorWithPage();
        const bo = await follower(backend);
        let refusedAt: number | undefined;
        for (let i = 1; i <= 13 && refusedAt === undefined; i++) {
          const error = await refusal(save(bo, token));
          if (error !== undefined) {
            expect(isRateLimitError(error)).toBe(true);
            refusedAt = i;
          }
        }
        expect(refusedAt).toBe(13);
        const cy = await follower(backend, "Cy Reyes");
        await expect(save(cy, token)).resolves.toMatchObject({
          status: "saved",
          created: true,
        });
      },
    );

    it("claims the follower's bucket and the creator's save bucket, never page views", async () => {
      const { backend, creator, token } = await creatorWithPage();
      const bo = await follower(backend);
      const { rateLimiter } = await import("./model/rateLimiter");
      const limit = vi.spyOn(rateLimiter, "limit");
      await savedListId(bo, token);
      expect(
        limit.mock.calls.map(([, name, options]) => [name, options?.key]),
      ).toEqual([
        ["creatorMapSave", bo.userId],
        ["creatorMapSavePage", creator.userId],
      ]);
    });
  });

  it("makes no save for the follower and schedules nothing", async () => {
    const { backend, token } = await creatorWithPage();
    const bo = await follower(backend);
    const scheduled = () =>
      backend.run((ctx) =>
        ctx.db.system.query("_scheduled_functions").collect(),
      );
    const before = await scheduled();
    await savedListId(bo, token);
    expect(await scheduled()).toEqual(before);
    expect(
      await backend.run((ctx) =>
        ctx.db
          .query("items")
          .withIndex("by_user", (q) => q.eq("userId", bo.userId))
          .collect(),
      ),
    ).toEqual([]);
  });
});
