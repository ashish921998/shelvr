// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import type { FunctionReference } from "convex/server";
import { describe, expect, expectTypeOf, it } from "vitest";

import { newConvexTest, signedInUser } from "./test.setup";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

async function setup(options: { pro?: boolean } = {}) {
  const backend = newConvexTest();
  const { t, userId } = await signedInUser(backend, {
    pro: options.pro ?? true,
  });
  const itemId = await t.run(async (ctx) =>
    ctx.db.insert("items", {
      userId,
      type: "link",
      status: "ready",
      title: "Tigre",
      tags: [],
      searchText: "Tigre",
    }),
  );
  const visits = () =>
    t.run(async (ctx) =>
      ctx.db
        .query("placeVisits")
        .withIndex("by_user_and_visited", (q) => q.eq("userId", userId))
        .collect(),
    );
  return { backend, t, userId, itemId, visits };
}

describe("setVisited", () => {
  it("preserves stored visit coordinates and removes them with the account", async () => {
    const { backend, t, userId, itemId, visits } = await setup();
    const location = {
      city: "Austin",
      countryCode: "US",
      lat: 30.27,
      lng: -97.75,
      backfilled: true,
    };
    const visitId = await t.run((ctx) =>
      ctx.db.insert("placeVisits", {
        userId,
        itemId,
        key: "tigre",
        name: "Tigre",
        visitedAt: 1,
        ...location,
      }),
    );
    await t.mutation(api.placeVisits.setVisited, {
      itemId,
      name: "Tigre",
      visited: true,
    });
    expect(await visits()).toMatchObject([{ _id: visitId, ...location }]);
    await t.mutation(api.users.deleteCurrentUserAccount, {});
    for (let pass = 0; pass < 30; pass++) {
      if ((await backend.run((ctx) => ctx.db.get(userId))) === null) break;
      await backend.mutation(internal.users.processAccountDeletion, { userId });
    }
    expect(await backend.run((ctx) => ctx.db.get(userId))).toBeNull();
    expect(await backend.run((ctx) => ctx.db.get(visitId))).toBeNull();
  });

  it("keeps the api reference installed apps compiled against", () => {
    expectTypeOf(api.placeVisits.setVisited).toEqualTypeOf<
      FunctionReference<
        "mutation",
        "public",
        { itemId: Id<"items">; name: string; visited: boolean },
        null
      >
    >();
  });

  it("marks a place once and takes the mark back", async () => {
    const { t, itemId, visits } = await setup();

    await t.mutation(api.placeVisits.setVisited, {
      itemId,
      name: "Caffé  Dante",
      visited: true,
    });
    await t.mutation(api.placeVisits.setVisited, {
      itemId,
      name: "caffe dante",
      visited: true,
    });
    expect(await visits()).toMatchObject([
      { key: "caffedante", name: "caffe dante", itemId },
    ]);

    await t.mutation(api.placeVisits.setVisited, {
      itemId,
      name: "Caffé Dante",
      visited: false,
    });
    expect(await visits()).toHaveLength(0);
  });

  it("requires Pro", async () => {
    const { t, itemId, visits } = await setup({ pro: false });
    await expect(
      t.mutation(api.placeVisits.setVisited, {
        itemId,
        name: "Tigre",
        visited: true,
      }),
    ).rejects.toThrow();
    expect(await visits()).toHaveLength(0);
  });

  it("refuses another user's save and a name with no letters", async () => {
    const { backend, t, itemId } = await setup();
    const other = await signedInUser(backend, { pro: true });

    await expect(
      other.t.mutation(api.placeVisits.setVisited, {
        itemId,
        name: "Tigre",
        visited: true,
      }),
    ).rejects.toThrow("Item not found");
    await expect(
      t.mutation(api.placeVisits.setVisited, {
        itemId,
        name: " !! ",
        visited: true,
      }),
    ).rejects.toThrow("Place name is empty");
  });
});
