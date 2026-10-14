// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { newConvexTest } from "./test.setup";

describe("hasLocatedItems", () => {
  it("rejects empty, unlocated, partial, foreign and non-image saves before accepting an owned located image", async () => {
    const backend = newConvexTest();
    const userId = await backend.run((ctx) => ctx.db.insert("users", {}));
    const caller = backend.withIdentity({ subject: `${userId}|session` });
    expect(await caller.query(api.items.hasLocatedItems, {})).toBe(false);
    const fixtures = [
      { userId, type: "image" as const },
      { userId, type: "image" as const, latitude: 0 },
      { userId, type: "image" as const, longitude: 0 },
      { userId: "foreign", type: "image" as const, latitude: 0, longitude: 0 },
      { userId, type: "note" as const, latitude: 0, longitude: 0 },
      { userId, type: "link" as const, latitude: 0, longitude: 0 },
    ];
    for (const fixture of fixtures) {
      await backend.run((ctx) =>
        ctx.db.insert("items", {
          status: "ready",
          tags: [],
          searchText: "",
          ...fixture,
        }),
      );
      expect(await caller.query(api.items.hasLocatedItems, {})).toBe(false);
    }
    await backend.run((ctx) =>
      ctx.db.insert("items", {
        userId,
        type: "image",
        status: "ready",
        tags: [],
        searchText: "",
        latitude: 0,
        longitude: 0,
      }),
    );
    expect(await caller.query(api.items.hasLocatedItems, {})).toBe(true);
  });

  it("requires authentication", async () => {
    await expect(
      newConvexTest().query(api.items.hasLocatedItems, {}),
    ).rejects.toThrow("Not authenticated");
  });
});
