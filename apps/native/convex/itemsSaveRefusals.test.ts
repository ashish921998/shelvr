// @vitest-environment edge-runtime
// A save's permanent refusal must reach the client as a coded ConvexError
// (`model/saveErrors.ts`): production redacts a plain Error to "Server
// Error", so the add sheet reads it as transient and the Siri queue retries
// it on every launch.
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { saveErrorCode } from "./model/saveErrors";
import { newConvexTest, signedInUser } from "./test.setup";

const OP_ID = "image:aaaaaaaa-1111-4111-8111-111111111111";

// Keep scheduled jobs (processItem) queued rather than running during teardown.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
});

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the mutation to reject");
}

describe("permanent save refusals carry a code", () => {
  it("createLinkItem refuses a URL the policy rejects as invalid_url", async () => {
    const { t } = await signedInUser(newConvexTest(), { pro: true });
    // Passes the add sheet's and Siri's client checks, but the server policy
    // refuses the non-default port, so a retry can never succeed.
    const error = await rejection(
      t.mutation(api.items.createLinkItem, {
        url: "https://example.com:8443/article",
        operationId: "siri:11111111-1111-4111-8111-111111111111",
        saveSource: "siri",
      }),
    );
    expect(error).toBeInstanceOf(ConvexError);
    expect(saveErrorCode(error)).toBe("invalid_url");
  });

  it("beginImageImport refuses a 31st pending import as too_many_pending", async () => {
    const { t, userId } = await signedInUser(newConvexTest(), { pro: true });
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
    const error = await rejection(
      t.mutation(api.items.beginImageImport, { operationId: OP_ID }),
    );
    expect(saveErrorCode(error)).toBe("too_many_pending");
  });

  it("createNoteItem saves without a space deleted since it was picked", async () => {
    const backend = newConvexTest();
    const { t, userId } = await signedInUser(backend, { pro: true });
    const spaceId = await t.mutation(api.spaces.createSpace, { name: "Trips" });
    await t.mutation(api.spaces.deleteSpace, { id: spaceId });

    // A Siri capture queued with this space (the on-device catalog is a
    // snapshot) is replayed on a later launch with the same arguments.
    const itemId = await t.mutation(api.items.createNoteItem, {
      text: "ramen place on 5th",
      spaceId,
      operationId: "siri:22222222-2222-4222-8222-222222222222",
      saveSource: "siri",
    });
    const item = await backend.run((ctx) => ctx.db.get(itemId));
    expect(item?.userId).toBe(userId);
    const memberships = await backend.run((ctx) =>
      ctx.db
        .query("spaceItems")
        .withIndex("by_item", (q) => q.eq("itemId", itemId))
        .collect(),
    );
    expect(memberships).toEqual([]);
  });

  it("finalizeImageImport saves the photo without a deleted space", async () => {
    const backend = newConvexTest();
    const { t } = await signedInUser(backend, { pro: true });
    const spaceId = await t.mutation(api.spaces.createSpace, { name: "Home" });
    await t.mutation(api.items.beginImageImport, { operationId: OP_ID });
    const storageId: Id<"_storage"> = await backend.run(async (ctx) =>
      ctx.storage.store(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])])),
    );
    await t.mutation(api.items.attachImageUpload, {
      operationId: OP_ID,
      storageId,
    });
    // The space goes away between the picker and the finalize (another
    // device, or a share sheet retry after the space was deleted).
    await t.mutation(api.spaces.deleteSpace, { id: spaceId });

    const itemId = await t.mutation(api.items.finalizeImageImport, {
      operationId: OP_ID,
      spaceId,
    });
    const item = await backend.run((ctx) => ctx.db.get(itemId));
    expect(item?.type).toBe("image");
  });

  it("still refuses a space that belongs to someone else without filing into it", async () => {
    const backend = newConvexTest();
    const other = await signedInUser(backend, { pro: true });
    const spaceId = await other.t.mutation(api.spaces.createSpace, {
      name: "Theirs",
    });
    const { t } = await signedInUser(backend, {
      pro: true,
      email: "second@example.com",
    });
    const itemId = await t.mutation(api.items.createNoteItem, {
      text: "mine",
      spaceId,
    });
    const memberships = await backend.run((ctx) =>
      ctx.db
        .query("spaceItems")
        .withIndex("by_item", (q) => q.eq("itemId", itemId))
        .collect(),
    );
    expect(memberships).toEqual([]);
  });
});
