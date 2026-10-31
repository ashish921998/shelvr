// @vitest-environment edge-runtime
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { newConvexTest, signedInUser } from "./test.setup";

const safeFetch = vi.hoisted(() => vi.fn());
const generateObject = vi.hoisted(() => vi.fn());

vi.mock("ai", async (original) => ({
  ...(await original<typeof import("ai")>()),
  generateObject,
}));

vi.mock("./model/safeFetch", async (original) => ({
  ...(await original<typeof import("./model/safeFetch")>()),
  safeFetch,
}));

const PAGE = "https://www.example.com/best-tacos";
const TIKTOK = "https://www.tiktok.com/@cook/video/7350000000000000000";

const GOOD_SAVE = {
  title: "Best tacos in Austin",
  description: "Where to eat tacos.",
  tags: ["tacos"],
  content: "Go to Luna Tacos on South Congress.",
  siteName: "Example",
  author: "Sam",
  heroImageUrl: "https://www.example.com/hero.jpg",
  recipe: { name: "Salsa", ingredients: ["tomato"], steps: ["Blend."] },
  cities: ["Austin"],
  places: ["Luna Tacos"],
};

function refuses(status: number) {
  safeFetch.mockResolvedValue({ ok: false, code: "http_error", status });
}

function servesPage(body: string) {
  safeFetch.mockResolvedValue({
    ok: true,
    finalUrl: PAGE,
    status: 200,
    contentType: "text/html",
    bytes: new TextEncoder().encode(body),
  });
}

function modelNames(title: string) {
  generateObject.mockResolvedValue({
    object: {
      title,
      description: "From the URL alone.",
      tags: ["guess"],
      spaceNames: [],
      intents: [],
      cities: [],
      places: [],
      recipe: null,
    },
  });
}

async function retried(url = PAGE) {
  const { t, userId } = await signedInUser(newConvexTest(), { pro: true });
  const itemId: Id<"items"> = await t.run((ctx) =>
    ctx.db.insert("items", {
      userId,
      type: "link",
      url,
      status: "ready",
      enrichment: "partial",
      searchText: "best tacos",
      ...GOOD_SAVE,
    }),
  );
  expect(await t.mutation(api.items.reprocessItem, { id: itemId })).toBe(true);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return await t.run((ctx) => ctx.db.get(itemId));
}

beforeEach(() => {
  vi.useFakeTimers();
  safeFetch.mockReset();
  generateObject.mockReset();
  modelNames("Guessed from the URL");
});

afterEach(() => {
  vi.useRealTimers();
});

it("keeps a good save and skips the model when Retry cannot read the page", async () => {
  refuses(503);

  const item = await retried();

  expect(item).toMatchObject({
    ...GOOD_SAVE,
    status: "ready",
    enrichment: "partial",
  });
  expect(item?.failureReason).toBeUndefined();
  expect(generateObject).not.toHaveBeenCalled();
});

it("keeps a good save on Home and offers Retry again when the page is gone", async () => {
  refuses(404);

  const item = await retried();

  expect(item).toMatchObject({
    ...GOOD_SAVE,
    status: "ready",
    enrichment: "partial",
  });
  expect(item?.failureReason).toBeUndefined();
});

it("keeps a good save when the model fails on Retry", async () => {
  servesPage("<html><head><title>Tacos</title></head><body></body></html>");
  generateObject.mockRejectedValue(new Error("model down"));

  const item = await retried();

  expect(item).toMatchObject({
    ...GOOD_SAVE,
    status: "ready",
    enrichment: "partial",
  });
});

it("keeps the caption when a Retry reads a post that has none", async () => {
  safeFetch.mockResolvedValue({
    ok: true,
    finalUrl: TIKTOK,
    status: 200,
    contentType: "application/json",
    bytes: new TextEncoder().encode(
      JSON.stringify({ author_unique_id: "cook" }),
    ),
  });

  const item = await retried(TIKTOK);

  expect(item).toMatchObject({
    ...GOOD_SAVE,
    status: "ready",
    enrichment: "partial",
  });
  expect(generateObject).not.toHaveBeenCalled();
});

it("takes the new reading when Retry reads the page", async () => {
  const article = "Luna Tacos serves the best breakfast tacos. ".repeat(40);
  servesPage(
    `<html><head><title>Fresh</title></head><body><article><p>${article}</p></article></body></html>`,
  );
  modelNames("Fresh tacos guide");

  const item = await retried();

  expect(item?.status).toBe("ready");
  expect(item?.enrichment).toBeUndefined();
  expect(item?.title).toBe("Fresh tacos guide");
  expect(item?.content).toContain("breakfast tacos");
  expect(item?.places).toEqual(["Luna Tacos"]);
});
