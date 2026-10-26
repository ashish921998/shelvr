// @vitest-environment edge-runtime
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { newConvexTest, signedInUser } from "./test.setup";
import { buildSearchText } from "./model/searchText";
import { completionPatch } from "./model/settlement";

beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));
afterEach(() => vi.useRealTimers());

it("finds old saves by city, place, and title beyond the Home page, without returning another owner's saves", async () => {
  const backend = newConvexTest();
  const { t, userId } = await signedInUser(backend);
  const other = await signedInUser(backend);
  const target = await t.run(async (ctx) => {
    const fields = {
      type: "link" as const,
      status: "ready" as const,
      tags: [],
      title: "Weekend favourites",
      cities: ["Lisbon"],
      places: ["Belém Tower"],
      searchText: "weekend favourites",
    };
    const id = await ctx.db.insert("items", { ...fields, userId });
    await ctx.db.insert("items", { ...fields, userId: other.userId });
    for (let i = 0; i < 45; i++) {
      await ctx.db.insert("items", {
        userId,
        type: "note",
        status: "ready",
        tags: [],
        searchText: "other",
      });
    }
    return id;
  });
  await backend.mutation(internal.items.backfillPlaceSearch, { cursor: null });
  await backend.finishAllScheduledFunctions(vi.runAllTimers);
  for (const query of [" lisbon ", "Belém", "weekend"]) {
    expect(
      (await t.query(api.items.searchItems, { query })).map((item) => item._id),
    ).toEqual([target]);
  }
  expect(await t.query(api.items.searchItems, { query: "   " })).toEqual([]);
  expect(await t.query(api.items.searchItems, { query: "nowhere" })).toEqual(
    [],
  );
  await backend.mutation(internal.items.backfillPlaceSearch, { cursor: null });
  await backend.finishAllScheduledFunctions(vi.runAllTimers);
  expect(
    (await t.query(api.items.searchItems, { query: "lisbon" })).map(
      (item) => item._id,
    ),
  ).toEqual([target]);
});

it("does not reindex a deleting or missing owner", async () => {
  const backend = newConvexTest();
  const ids = await backend.run(async (ctx) => {
    const deleting = await ctx.db.insert("users", { deleting: true });
    return Promise.all(
      [deleting, "missing"].map((userId) =>
        ctx.db.insert("items", {
          userId,
          type: "link",
          status: "ready",
          tags: [],
          searchText: "old",
          cities: ["Lisbon"],
        }),
      ),
    );
  });
  await backend.mutation(internal.items.backfillPlaceSearch, { cursor: null });
  for (const id of ids)
    expect((await backend.run((ctx) => ctx.db.get(id)))?.searchText).toBe(
      "old",
    );
});

it("indexes settled place names even when the title and description do not mention them", () => {
  const fields = {
    userId: "owner",
    type: "link" as const,
    status: "processing" as const,
    tags: [],
    searchText: "",
  };
  const item = {
    ...fields,
    _id: "item" as import("./_generated/dataModel").Id<"items">,
    _creationTime: 0,
  };
  const patch = completionPatch(
    item,
    {
      reading: {},
      classification: {
        title: "Weekend",
        description: "Ideas",
        tags: [],
        cities: ["Lisbon"],
        places: ["Belém Tower"],
      },
    },
    true,
  );
  expect(patch.searchText).toContain("lisbon");
  expect(patch.searchText).toContain("belém tower");
  expect(
    buildSearchText({ tags: [], cities: ["Tokyo"], places: ["Shibuya"] }),
  ).toBe("tokyo shibuya");
});
