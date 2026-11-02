// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { newConvexTest, signedInUser } from "./test.setup";
import { saveErrorCode } from "./model/saveErrors";
import { FREE_SAVE_LIMIT } from "./freeSaves";

type Signed = Awaited<ReturnType<typeof signedInUser>>;

afterEach(() => {
  vi.unstubAllEnvs();
});

async function errorCode(run: Promise<unknown>) {
  try {
    await run;
    return null;
  } catch (error) {
    return saveErrorCode(error);
  }
}

async function freeUser(enabled: boolean) {
  if (enabled) vi.stubEnv("FREE_SAVES_ENABLED", "true");
  return await signedInUser(newConvexTest());
}

function saveLink({ t }: Signed, n: number, operationId?: string) {
  return t.mutation(api.items.createLinkItem, {
    url: `https://www.instagram.com/reel/r${n}/`,
    operationId,
  });
}

async function rows({ t }: Signed) {
  return await t.run((ctx) => ctx.db.query("freeSaves").collect());
}

async function settle(
  { t }: Signed,
  itemId: Id<"items">,
  cities: string[],
): Promise<void> {
  const item = await t.run((ctx) => ctx.db.get(itemId));
  await t.mutation(internal.items.finalizeItem, {
    itemId,
    runId: item?.processingRunId,
    reading: {},
    classification: { title: "Spot", description: "", tags: [], cities },
  });
}

async function fail({ t }: Signed, itemId: Id<"items">): Promise<void> {
  const item = await t.run((ctx) => ctx.db.get(itemId));
  await t.mutation(internal.items.failItem, {
    itemId,
    reason: "error",
    runId: item?.processingRunId,
  });
}

describe("free saves with the switch off", () => {
  it("refuses every save path to someone without Pro, as before", async () => {
    const user = await freeUser(false);
    expect(await errorCode(saveLink(user, 1))).toBe("pro_required");
    expect(
      await errorCode(
        user.t.mutation(api.items.createNoteItem, { text: "Tacos at Lupe's" }),
      ),
    ).toBe("pro_required");
    const itemId = await user.t.run((ctx) =>
      ctx.db.insert("items", {
        userId: user.userId,
        type: "link",
        url: "https://example.com",
        status: "failed",
        failureReason: "error",
        tags: [],
        searchText: "",
      }),
    );
    expect(
      await errorCode(user.t.mutation(api.items.reprocessItem, { id: itemId })),
    ).toBe("pro_required");
    expect(await user.t.query(api.freeSaves.getFreeSaves, {})).toBeNull();
    expect(await rows(user)).toEqual([]);
  });
});

describe("free saves with the switch on", () => {
  it("allows ten saves and refuses the eleventh", async () => {
    const user = await freeUser(true);
    for (let n = 1; n <= FREE_SAVE_LIMIT; n++) await saveLink(user, n);
    expect(await errorCode(saveLink(user, 11))).toBe("pro_required");
    expect(await user.t.query(api.freeSaves.getFreeSaves, {})).toEqual({
      limit: FREE_SAVE_LIMIT,
      used: FREE_SAVE_LIMIT,
      left: 0,
    });
  });

  it("gives the slot back when a save fails or finds no city", async () => {
    const user = await freeUser(true);
    const failed = await saveLink(user, 1);
    const placeless = await saveLink(user, 2);
    const placed = await saveLink(user, 3);
    await fail(user, failed);
    await settle(user, placeless, []);
    await settle(user, placed, ["Lisbon"]);
    expect(await user.t.query(api.freeSaves.getFreeSaves, {})).toMatchObject({
      used: 1,
      left: FREE_SAVE_LIMIT - 1,
    });
  });

  it("keeps a placed save's slot after it is deleted, and frees a pending one", async () => {
    const user = await freeUser(true);
    const placed = await saveLink(user, 1);
    const pending = await saveLink(user, 2);
    await settle(user, placed, ["Austin"]);
    await user.t.mutation(api.items.deleteItem, { id: placed });
    await user.t.mutation(api.items.deleteItem, { id: pending });
    expect(await user.t.query(api.freeSaves.getFreeSaves, {})).toMatchObject({
      used: 1,
    });
  });

  it("returns the same save for a repeated operation without spending a slot", async () => {
    const user = await freeUser(true);
    for (let n = 1; n < FREE_SAVE_LIMIT; n++) await saveLink(user, n);
    const last = await saveLink(user, 10, "operation-10");
    expect(await saveLink(user, 10, "operation-10")).toBe(last);
    expect(await rows(user)).toHaveLength(FREE_SAVE_LIMIT);
  });

  it("lets a failed free save be retried with no slots left", async () => {
    const user = await freeUser(true);
    const failed = await saveLink(user, 0);
    await fail(user, failed);
    for (let n = 1; n <= FREE_SAVE_LIMIT; n++) await saveLink(user, n);
    expect(await user.t.mutation(api.items.reprocessItem, { id: failed })).toBe(
      true,
    );
    await settle(user, failed, ["Lisbon"]);
    expect(await user.t.query(api.freeSaves.getFreeSaves, {})).toMatchObject({
      used: FREE_SAVE_LIMIT,
      left: 0,
    });
  });

  it("writes no rows for someone with Pro", async () => {
    vi.stubEnv("FREE_SAVES_ENABLED", "true");
    const user = await signedInUser(newConvexTest(), { pro: true });
    for (let n = 1; n <= FREE_SAVE_LIMIT + 1; n++) await saveLink(user, n);
    expect(await rows(user)).toEqual([]);
    expect(await user.t.query(api.freeSaves.getFreeSaves, {})).toBeNull();
  });

  it("adds the other city parts of a free Google Maps list", async () => {
    const user = await freeUser(true);
    const itemId = await saveLink(user, 1);
    await settle(user, itemId, ["Tokyo"]);
    const item = await user.t.run((ctx) => ctx.db.get(itemId));
    vi.stubEnv("FREE_SAVES_ENABLED", "false");
    const added = await user.t.mutation(internal.items.addPlaceListParts, {
      itemId,
      runId: item?.processingRunId,
      parts: [
        {
          title: "Tokyo · Kyoto",
          cities: ["Kyoto"],
          places: ["Ippodo"],
          pins: [],
          content: "Ippodo",
        },
      ],
    });
    expect(added).toBe(1);
    expect(await rows(user)).toHaveLength(1);
  });
});
