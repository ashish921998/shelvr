// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "@convex/_generated/api";
import { newConvexTest } from "./test.setup";

const generateObject = vi.hoisted(() => vi.fn());
vi.mock("ai", async (original) => ({
  ...(await original<typeof import("ai")>()),
  generateObject,
}));

const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 255, 128]);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", "");
  vi.stubEnv("SERPAPI_KEY", "unit-test-only");
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected network request");
    }),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
  generateObject.mockReset();
  generateObject.mockResolvedValue({
    object: {
      title: "Night Mountains",
      description: "Mountains under a starry sky.",
      tags: ["mountains", "night"],
      spaceNames: [],
      intents: [],
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function photo(
  t: ReturnType<typeof newConvexTest>,
  blob = new Blob([bytes], { type: "image/png" }),
) {
  return t.run(async (ctx) => {
    const storageId = await ctx.storage.store(blob);
    const itemId = await ctx.db.insert("items", {
      userId: "photo-user",
      type: "image",
      status: "processing",
      storageId,
      tags: [],
      searchText: "",
      aspectRatio: 1.5,
    });
    const spaceId = await ctx.db.insert("spaces", {
      userId: "photo-user",
      name: "Saved photos",
    });
    await ctx.db.insert("spaceItems", {
      userId: "photo-user",
      itemId,
      spaceId,
      status: "saved",
    });
    return { itemId, storageId, spaceId };
  });
}

describe("stored photo processing", () => {
  it("passes original bytes to vision and retains the uploaded file and chosen space", async () => {
    const t = newConvexTest();
    const { itemId, storageId, spaceId } = await photo(t);
    await t.action(internal.ai.processItem, { itemId });
    const image = generateObject.mock.calls[0][0].messages[0].content.find(
      (part: { type: string }) => part.type === "image",
    );
    expect(image.image).toBeInstanceOf(Uint8Array);
    expect(Array.from(image.image)).toEqual(Array.from(bytes));
    expect(image.mediaType).toBe("image/png");
    const saved = await t.run(async (ctx) => ({
      item: await ctx.db.get(itemId),
      memberships: await ctx.db
        .query("spaceItems")
        .withIndex("by_item", (q) => q.eq("itemId", itemId))
        .collect(),
    }));
    expect(saved.item).toMatchObject({
      status: "ready",
      title: "Night Mountains",
      storageId,
      aspectRatio: 1.5,
    });
    expect(saved.memberships).toHaveLength(1);
    expect(saved.memberships[0]).toMatchObject({ spaceId, status: "saved" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses stored bytes for product recognition as well", async () => {
    const t = newConvexTest();
    const { itemId } = await photo(t);
    generateObject.mockResolvedValue({ object: { query: "" } });
    await t.action(internal.ai.findProductLinks, { itemId });
    const image = generateObject.mock.calls[0][0].messages[0].content.find(
      (part: { type: string }) => part.type === "image",
    );
    expect(Array.from(image.image)).toEqual(Array.from(bytes));
    expect(image.mediaType).toBe("image/png");
    const item = await t.run((ctx) => ctx.db.get(itemId));
    expect(item).toMatchObject({ productsStatus: "ready", products: [] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports a deleted photo without calling the model or losing its space", async () => {
    const t = newConvexTest();
    const { itemId, storageId, spaceId } = await photo(t);
    await t.run((ctx) => ctx.storage.delete(storageId));
    await expect(t.action(internal.ai.processItem, { itemId })).rejects.toThrow(
      "stored_image:not_found",
    );
    expect(generateObject).not.toHaveBeenCalled();
    const item = await t.run((ctx) => ctx.db.get(itemId));
    expect(item).toMatchObject({
      status: "failed",
      failureReason: "not_found",
    });
    const membership = await t.run((ctx) =>
      ctx.db
        .query("spaceItems")
        .withIndex("by_item", (q) => q.eq("itemId", itemId))
        .unique(),
    );
    expect(membership).toMatchObject({ spaceId, status: "saved" });
  });

  it.each([
    [new Blob([]), "empty", "not_found"],
    [
      new Blob([new Uint8Array(14 * 1024 * 1024 + 1)]),
      "too_large",
      "image_too_large",
    ],
  ] as const)(
    "makes %s / %s terminal without calling the model",
    async (blob, code, reason) => {
      const t = newConvexTest();
      const { itemId } = await photo(t, blob);
      await expect(
        t.action(internal.ai.processItem, { itemId }),
      ).rejects.toThrow(`stored_image:${code}`);
      expect(generateObject).not.toHaveBeenCalled();
      expect(await t.run((ctx) => ctx.db.get(itemId))).toMatchObject({
        status: "failed",
        failureReason: reason,
      });
    },
  );

  it("makes an absent storage ID terminal", async () => {
    const t = newConvexTest();
    const { itemId } = await photo(t);
    await t.run((ctx) => ctx.db.patch(itemId, { storageId: undefined }));
    await expect(t.action(internal.ai.processItem, { itemId })).rejects.toThrow(
      "stored_image:not_found",
    );
    expect(generateObject).not.toHaveBeenCalled();
    expect(await t.run((ctx) => ctx.db.get(itemId))).toMatchObject({
      status: "failed",
      failureReason: "not_found",
    });
  });

  it("bounds image prompt space data including JSON escapes and multibyte text", async () => {
    const t = newConvexTest();
    const { itemId } = await photo(t);
    await t.run(async (ctx) => {
      for (let i = 0; i < 100; i++)
        await ctx.db.insert("spaces", {
          userId: "photo-user",
          dynamic: true,
          name: `Space ${i}`,
          description: "\u0000😀".repeat(10000),
        });
    });
    await t.action(internal.ai.processItem, { itemId });
    const prompt = generateObject.mock.calls[0][0].messages[0].content[0].text;
    expect(
      new TextEncoder().encode(JSON.stringify(prompt)).byteLength,
    ).toBeLessThan(70 * 1024);
    expect(prompt).toContain('"Space 0"');
    expect(prompt).not.toContain('"Space 99"');
  });

  it("preserves HEIC metadata in both vision calls", async () => {
    const t = newConvexTest();
    const heic = new Uint8Array([
      0, 0, 0, 24, 102, 116, 121, 112, 104, 101, 105, 99,
    ]);
    const { itemId } = await photo(t, new Blob([heic], { type: "image/heic" }));
    await t.action(internal.ai.processItem, { itemId });
    generateObject.mockResolvedValue({ object: { query: "" } });
    await t.action(internal.ai.findProductLinks, { itemId });
    for (const [call] of generateObject.mock.calls) {
      expect(
        call.messages[0].content.find(
          (part: { type: string }) => part.type === "image",
        ),
      ).toMatchObject({ image: heic, mediaType: "image/heic" });
    }
  });
});
