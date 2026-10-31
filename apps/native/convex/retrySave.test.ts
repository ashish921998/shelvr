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

function servesArticle() {
  const article = "Luna Tacos serves the best breakfast tacos. ".repeat(40);
  servesPage(
    `<html><head><title>Fresh</title></head><body><article><p>${article}</p></article></body></html>`,
  );
}

function servesTikTokWithoutCaption() {
  safeFetch.mockResolvedValue({
    ok: true,
    finalUrl: TIKTOK,
    status: 200,
    contentType: "application/json",
    bytes: new TextEncoder().encode(
      JSON.stringify({ author_unique_id: "cook" }),
    ),
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

async function retried(
  url = PAGE,
  save: Partial<typeof GOOD_SAVE> = GOOD_SAVE,
) {
  const { t, userId } = await signedInUser(newConvexTest(), { pro: true });
  const itemId: Id<"items"> = await t.run((ctx) =>
    ctx.db.insert("items", {
      userId,
      type: "link",
      url,
      status: "ready",
      enrichment: "partial",
      searchText: "best tacos",
      tags: [],
      ...save,
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
  servesArticle();
  generateObject.mockRejectedValue(new Error("model down"));

  const item = await retried();

  expect(item).toMatchObject({
    ...GOOD_SAVE,
    status: "ready",
    enrichment: "partial",
  });
});

it("keeps a caption-less save when a Retry finds no caption either", async () => {
  servesTikTokWithoutCaption();
  const { content: _content, ...noCaption } = GOOD_SAVE;

  const item = await retried(TIKTOK, noCaption);

  expect(item).toMatchObject({
    ...noCaption,
    status: "ready",
    enrichment: "partial",
  });
  expect(generateObject).not.toHaveBeenCalled();
});

it("keeps a good save and its Retry when the page answers with an empty shell", async () => {
  servesPage(
    "<html><head><title>Just a moment</title></head><body></body></html>",
  );

  const item = await retried();

  expect(item).toMatchObject({
    ...GOOD_SAVE,
    status: "ready",
    enrichment: "partial",
  });
  expect(generateObject).not.toHaveBeenCalled();
});

it("still asks the model when a save has nothing to lose", async () => {
  servesTikTokWithoutCaption();

  const item = await retried(TIKTOK, { title: "A TikTok" });

  expect(generateObject).toHaveBeenCalled();
  expect(item?.title).toBe("Guessed from the URL");
});

function servesCard() {
  servesPage(
    `<html><head><title>Fresh tacos</title><meta name="description" content="A taco guide."><meta property="og:image" content="https://www.example.com/new.jpg"></head><body></body></html>`,
  );
}

it("leaves a save with a body alone when Retry finds only a title and image", async () => {
  servesCard();

  const item = await retried();

  expect(generateObject).not.toHaveBeenCalled();
  expect(item).toMatchObject({
    ...GOOD_SAVE,
    status: "ready",
    enrichment: "partial",
  });
});

it("takes a real title and keeps the places when a save has no body", async () => {
  servesCard();
  modelNames("Fresh tacos");
  const thin = {
    title: "best-tacos",
    places: GOOD_SAVE.places,
    cities: GOOD_SAVE.cities,
    author: GOOD_SAVE.author,
  };

  const item = await retried(PAGE, thin);

  expect(generateObject).toHaveBeenCalled();
  expect(item).toMatchObject({
    title: "Fresh tacos",
    places: GOOD_SAVE.places,
    cities: GOOD_SAVE.cities,
    author: GOOD_SAVE.author,
    heroImageUrl: "https://www.example.com/new.jpg",
    status: "ready",
    enrichment: "partial",
  });
});

it("keeps the words and the Retry when a blocked save reads an empty shell", async () => {
  servesPage(
    "<html><head><title>Just a moment</title></head><body></body></html>",
  );
  const blocked = {
    title: GOOD_SAVE.title,
    description: GOOD_SAVE.description,
    tags: GOOD_SAVE.tags,
  };

  const item = await retried(PAGE, blocked);

  expect(generateObject).not.toHaveBeenCalled();
  expect(item).toMatchObject({
    ...blocked,
    status: "ready",
    enrichment: "partial",
  });
});

it("keeps the recipe and hero when Retry reads a body without them", async () => {
  servesArticle();
  modelNames("Fresh tacos guide");

  const item = await retried();

  expect(item?.content).toContain("breakfast tacos");
  expect(item?.recipe).toEqual(GOOD_SAVE.recipe);
  expect(item?.heroImageUrl).toBe(GOOD_SAVE.heroImageUrl);
});

it("takes the new reading when Retry reads the page", async () => {
  servesArticle();
  modelNames("Fresh tacos guide");

  const item = await retried();

  expect(item?.status).toBe("ready");
  expect(item?.enrichment).toBeUndefined();
  expect(item?.title).toBe("Fresh tacos guide");
  expect(item?.content).toContain("breakfast tacos");
  expect(item?.places).toEqual(["Luna Tacos"]);
});
