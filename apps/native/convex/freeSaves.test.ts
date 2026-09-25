// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { newConvexTest } from "./test.setup";
import { api } from "./_generated/api";
import { FREE_SAVE_LIMIT } from "./model/freeSaves";
import { saveErrorCode } from "./model/saveErrors";

// Keep scheduled AI runs queued instead of firing during teardown.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

const OP_ID = "image:11111111-1111-4111-8111-111111111111";

function freeUser(subject = "free") {
  return newConvexTest().withIdentity({ subject });
}

async function refusal(call: Promise<unknown>) {
  return await call.then(
    () => null,
    (error: unknown) => saveErrorCode(error),
  );
}

describe("free save allowance", () => {
  it("lets a user without Pro save up to the limit, then asks for Pro", async () => {
    const t = freeUser();
    expect(await t.query(api.freeSaves.getSaveAllowance, {})).toEqual({
      limit: FREE_SAVE_LIMIT,
      used: 0,
      remaining: FREE_SAVE_LIMIT,
    });

    for (let i = 0; i < FREE_SAVE_LIMIT; i++) {
      if (i % 2 === 0) {
        await t.mutation(api.items.createLinkItem, {
          url: `https://example.com/${i}`,
        });
      } else {
        await t.mutation(api.items.createNoteItem, { text: `note ${i}` });
      }
    }

    expect(await t.query(api.freeSaves.getSaveAllowance, {})).toEqual({
      limit: FREE_SAVE_LIMIT,
      used: FREE_SAVE_LIMIT,
      remaining: 0,
    });
    expect(
      await refusal(
        t.mutation(api.items.createLinkItem, { url: "https://example.com/x" }),
      ),
    ).toBe("pro_required");
    expect(
      await refusal(t.mutation(api.items.createNoteItem, { text: "one more" })),
    ).toBe("pro_required");
    expect(
      await refusal(
        t.mutation(api.items.beginImageImport, { operationId: OP_ID }),
      ),
    ).toBe("pro_required");
  });

  it("does not refund a save when the item is deleted", async () => {
    const t = freeUser();
    const id = await t.mutation(api.items.createNoteItem, { text: "gone" });
    await t.mutation(api.items.deleteItem, { id });
    expect((await t.query(api.freeSaves.getSaveAllowance, {})).used).toBe(1);
  });

  it("charges an idempotent share retry once", async () => {
    const t = freeUser();
    const operationId = "share:11111111-1111-4111-8111-111111111111";
    const first = await t.mutation(api.items.createLinkItem, {
      url: "https://example.com",
      operationId,
    });
    const again = await t.mutation(api.items.createLinkItem, {
      url: "https://example.com",
      operationId,
    });
    expect(again).toBe(first);
    expect((await t.query(api.freeSaves.getSaveAllowance, {})).used).toBe(1);
  });

  it("charges an image import once, at finalize", async () => {
    const t = freeUser();
    await t.mutation(api.items.beginImageImport, { operationId: OP_ID });
    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])])),
    );
    await t.mutation(api.items.attachImageUpload, {
      operationId: OP_ID,
      storageId,
    });
    expect((await t.query(api.freeSaves.getSaveAllowance, {})).used).toBe(0);
    const itemId = await t.mutation(api.items.finalizeImageImport, {
      operationId: OP_ID,
    });
    expect(
      await t.mutation(api.items.finalizeImageImport, { operationId: OP_ID }),
    ).toBe(itemId);
    expect((await t.query(api.freeSaves.getSaveAllowance, {})).used).toBe(1);
  });

  it("never charges a user with Pro", async () => {
    const t = freeUser("pro");
    await t.run(async (ctx) => {
      await ctx.db.insert("subscriptions", {
        userId: "pro",
        status: "pro",
        expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
        updatedAt: Date.now(),
      });
    });
    await t.mutation(api.items.createNoteItem, { text: "paid" });
    expect((await t.query(api.freeSaves.getSaveAllowance, {})).used).toBe(0);
  });

  it("keeps Pro features gated for free users", async () => {
    const t = freeUser();
    expect(
      await refusal(t.mutation(api.spaces.createSpace, { name: "Travel" })),
    ).toBe("pro_required");
  });
});
