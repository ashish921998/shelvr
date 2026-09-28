// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

import { newConvexTest } from "./test.setup";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

type TestBackend = ReturnType<typeof newConvexTest>;

function asUser(backend: TestBackend, userId: string) {
  return backend.withIdentity({ subject: `${userId}|session-1` });
}

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
    const t = asUser(backend, "u1");
    expect(await t.query(api.items.saveProgress, {})).toEqual({
      saved: 0,
      goal: 3,
    });
    for (let i = 0; i < 5; i += 1) await insertItem(backend, "u1");
    expect(await t.query(api.items.saveProgress, {})).toEqual({
      saved: 3,
      goal: 3,
    });
  });

  it("leaves out the onboarding demo, fixtures, unfinished saves and other users", async () => {
    const backend = newConvexTest();
    const t = asUser(backend, "u1");
    const demoItem = await insertItem(backend, "u1");
    await backend.run((ctx) =>
      ctx.db.insert("onboardingDemos", {
        userId: "u1",
        itemId: demoItem,
        createdAt: Date.now(),
      }),
    );
    await insertItem(backend, "u1", { fixtureKey: "seed-1" });
    await insertItem(backend, "u1", { status: "processing" });
    await insertItem(backend, "u1", { status: "failed" });
    await insertItem(backend, "u2");
    await insertItem(backend, "u1");
    expect(await t.query(api.items.saveProgress, {})).toEqual({
      saved: 1,
      goal: 3,
    });
  });
});
