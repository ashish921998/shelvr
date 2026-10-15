// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

import { newConvexTest, signedInUser, type TestBackend } from "./test.setup";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

async function insertItem(
  backend: TestBackend,
  userId: string,
  fields: {
    status?: "processing" | "ready" | "failed";
    fixtureKey?: string;
  } = {},
): Promise<Id<"items">> {
  return await backend.run((ctx) =>
    ctx.db.insert("items", {
      userId,
      type: "note",
      status: fields.status ?? "ready",
      tags: [],
      content: "a note",
      searchText: "a note",
      ...(fields.fixtureKey ? { fixtureKey: fields.fixtureKey } : {}),
    }),
  );
}

describe("saveProgress", () => {
  it("counts ready saves up to the goal", async () => {
    const backend = newConvexTest();
    const { t, userId } = await signedInUser(backend);
    expect(await t.query(api.items.saveProgress, {})).toEqual({
      saved: 0,
      goal: 3,
    });
    for (let i = 0; i < 5; i += 1) await insertItem(backend, userId);
    expect(await t.query(api.items.saveProgress, {})).toEqual({
      saved: 3,
      goal: 3,
    });
  });

  it("leaves out the onboarding demo, fixtures, unfinished saves and other users", async () => {
    const backend = newConvexTest();
    const { t, userId } = await signedInUser(backend);
    const demoItem = await insertItem(backend, userId);
    await backend.run((ctx) =>
      ctx.db.insert("onboardingDemos", {
        userId,
        itemId: demoItem,
        createdAt: Date.now(),
      }),
    );
    for (let i = 0; i < 5; i += 1)
      await insertItem(backend, userId, { fixtureKey: `seed-${i}` });
    await insertItem(backend, userId, { status: "processing" });
    await insertItem(backend, userId, { status: "failed" });
    await insertItem(backend, "someone-else");
    await insertItem(backend, userId);
    await insertItem(backend, userId);
    expect(await t.query(api.items.saveProgress, {})).toEqual({
      saved: 2,
      goal: 3,
    });
  });
});
