// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractBodyText,
  fetchXoEmbed,
  finalRecipe,
  firstLinkedUrl,
  linkEnrichment,
  sanitizeRecipe,
  storePoster,
} from "./ai";

const safeFetch = vi.hoisted(() => vi.fn());
const parseJson = vi.hoisted(() => vi.fn());

vi.mock("./model/safeFetch", () => ({
  decodeWithContentType: vi.fn(),
  isSafeFetchError: vi.fn(),
  parseJson,
  safeFetch,
}));

describe("storePoster", () => {
  beforeEach(() => {
    safeFetch.mockReset();
  });

  it("falls back to the remote URL when Convex storage rejects the poster", async () => {
    safeFetch.mockResolvedValue({
      ok: true,
      finalUrl: "https://example.com/poster.jpg",
      status: 200,
      contentType: "image/jpeg",
      bytes: new Uint8Array([1, 2, 3]),
    });

    const stored = await storePoster(
      {
        storage: {
          store: async () => {
            throw new Error("storage unavailable");
          },
        },
      },
      "https://example.com/poster.jpg",
    );

    expect(stored).toBeUndefined();
  });
});

describe("fetchXoEmbed", () => {
  beforeEach(() => {
    safeFetch.mockReset();
    parseJson.mockReset();
    safeFetch.mockResolvedValue({
      ok: true,
      finalUrl: "https://publish.twitter.com/oembed",
      status: 200,
      contentType: "application/json",
      bytes: new Uint8Array([1]),
    });
  });

  it.each([null, "text", 42, ["html"]])(
    "rejects a %j body as an unreadable page, not a TypeError",
    async (body) => {
      parseJson.mockReturnValue(body);
      const read = fetchXoEmbed("https://x.com/nasa/status/1");
      await expect(read).rejects.not.toBeInstanceOf(TypeError);
      await expect(read).rejects.toMatchObject({ code: "http_error" });
    },
  );

  it("keeps the post paragraph and drops the attribution", async () => {
    parseJson.mockReturnValue({
      html: '<blockquote class="twitter-tweet"><p lang="en">Hello &amp; <a href="https://twitter.com/hashtag/space?src=hash">#space</a></p>&mdash; NASA (@NASA) <a href="https://x.com">May 1</a></blockquote>',
      author_url: "https://twitter.com/NASA",
      author_name: "NASA",
    });
    await expect(fetchXoEmbed("https://x.com/NASA/status/1")).resolves.toEqual({
      title: "Hello & #space",
      siteName: "X",
      author: "@NASA",
      content: "Hello & #space",
    });
  });

  it("keeps the first outside link (a t.co redirect) and skips attached media and the attribution", async () => {
    parseJson.mockReturnValue({
      html: '<blockquote class="twitter-tweet"><p lang="en">Full recipe <a href="https://t.co/media1">pic.twitter.com/abc</a> <a href="https://t.co/recipe1">smittenkitchen.com/2023/03/spring…</a> <a href="https://t.co/second">other.com</a></p>&mdash; SK (@sk) <a href="https://twitter.com/sk/status/1">May 1</a></blockquote>',
      author_url: "https://twitter.com/sk",
    });
    const page = await fetchXoEmbed("https://x.com/sk/status/1");
    expect(page.linkedUrl).toBe("https://t.co/recipe1");
  });
});

describe("firstLinkedUrl", () => {
  it("trims trailing punctuation and skips link hubs and social hosts", () => {
    expect(
      firstLinkedUrl(
        "Recipe in bio https://linktr.ee/cook or here: https://www.budgetbytes.com/dal/. Enjoy!",
      ),
    ).toBe("https://www.budgetbytes.com/dal/");
    expect(
      firstLinkedUrl("watch https://youtu.be/abc and https://x.com/a"),
    ).toBe(undefined);
    expect(firstLinkedUrl("no links here")).toBeUndefined();
    expect(firstLinkedUrl(undefined)).toBeUndefined();
  });

  it("stops a URL at whitespace, quotes, and closing brackets", () => {
    expect(firstLinkedUrl('(see https://example.com/a?b=1&c=2) "x"')).toBe(
      "https://example.com/a?b=1&c=2",
    );
  });
});

describe("finalRecipe", () => {
  const markup = { ingredients: ["1 cup rice"], steps: ["Cook it."] };
  const proposed = { ingredients: ["  2 eggs "], steps: ["Fry."] };

  it("prefers the page's structured recipe over the model's proposal", () => {
    expect(finalRecipe({ recipe: markup }, { recipe: proposed })).toBe(markup);
  });

  it("falls back to the sanitized model proposal when the page has none", () => {
    expect(finalRecipe({}, { recipe: proposed })).toStrictEqual({
      ingredients: ["2 eggs"],
      steps: ["Fry."],
    });
    expect(finalRecipe(undefined, { recipe: proposed })).toStrictEqual({
      ingredients: ["2 eggs"],
      steps: ["Fry."],
    });
  });

  it("is absent when neither source produced one", () => {
    expect(finalRecipe({}, { recipe: null })).toBeUndefined();
    expect(finalRecipe(undefined, {})).toBeUndefined();
  });
});

describe("linkEnrichment", () => {
  it("preserves readable content with a menu class", () => {
    const content = extractBodyText(
      '<html><head><title>Seasonal menu</title></head><body><main class="menu"><h1>Seasonal menu</h1><p>Our spring tasting menu begins with fresh asparagus, garden peas, and herbs from the kitchen garden.</p><p>The main course pairs roasted vegetables with handmade pasta, followed by a dessert of local strawberries and cream.</p></main></body></html>',
      "https://example.com/menu",
    );
    expect(content).toContain("Our spring tasting menu");
    expect(content).toContain("The main course pairs");
    expect(linkEnrichment({ status: "ok", page: { content } })).toBeUndefined();
  });
  it.each(["article", "main", "div"])(
    "preserves short readable text inside %s",
    (tag) => {
      const content = extractBodyText(
        `<html><head><title>Field notes</title></head><body><${tag}><h1>Field notes</h1><p>We walked along the river at dawn. The water was still and the reeds were full of birds.</p><p>By noon the wind had picked up. We returned along the ridge and watched the clouds gather.</p></${tag}></body></html>`,
        "https://example.com/notes",
      );
      expect(content).toContain("We walked along the river");
      expect(content).toContain("By noon the wind");
      expect(
        linkEnrichment({ status: "ok", page: { content } }),
      ).toBeUndefined();
    },
  );
  it("does not turn page chrome into an article body", () => {
    const content = extractBodyText(
      '<html><head><title>Home</title></head><body><nav>Home About</nav><div class="menu"><a href="/login">Sign in</a><a href="/pricing">Pricing</a></div><div class="cookie-banner">Accept cookies</div><footer>Copyright</footer></body></html>',
      "https://example.com",
    );
    expect(content).toBeUndefined();
    expect(linkEnrichment({ status: "ok", page: { content } })).toBe(
      "no_article",
    );
  });

  it("preserves readable article text", () => {
    const paragraph =
      "A reader follows the winding path through the forest, observing the changing leaves and the quiet stream. Each season brings a different landscape, with new plants and animals to discover. ";
    const content = extractBodyText(
      `<html><head><title>A forest walk</title></head><body><nav>Home</nav><article><h1>A forest walk</h1>${Array.from({ length: 6 }, () => `<p>${paragraph.repeat(3)}</p>`).join("")}</article><footer>Copyright</footer></body></html>`,
      "https://example.com/article",
    );
    expect(content).toContain("A reader follows");
    expect(content).not.toContain("Copyright");
    expect(linkEnrichment({ status: "ok", page: { content } })).toBeUndefined();
  });
  // Mirrors the read outcomes that reach finalizeItem for a link: the fetch
  // failed (retryable, classified from the URL alone), the page read but had
  // no article body (terminal — e.g. an oEmbed-only TikTok read), a fully
  // read article, and no page at all (images/notes never fetch).
  it("flags an unreadable page as partial so the client offers a retry", () => {
    expect(linkEnrichment({ status: "unreadable" })).toBe("partial");
  });

  it("flags a readable page without an article body as no_article", () => {
    expect(linkEnrichment({ status: "ok", page: {} })).toBe("no_article");
  });

  it("flags a fully read page as enriched (undefined)", () => {
    expect(
      linkEnrichment({ status: "ok", page: { content: "Extracted body" } }),
    ).toBeUndefined();
  });

  it("treats a page-less item (image/note) as fully enriched", () => {
    expect(linkEnrichment(undefined)).toBeUndefined();
  });
});

describe("sanitizeRecipe", () => {
  it("passes through a plausible recipe", () => {
    expect(
      sanitizeRecipe({
        name: "Slow braised short ribs",
        servings: "4 servings",
        ingredients: ["3 lb short ribs", "2 cups beef stock"],
        steps: ["Sear the ribs.", "Braise at 325°F for 3 hours."],
      }),
    ).toEqual({
      name: "Slow braised short ribs",
      servings: "4 servings",
      ingredients: ["3 lb short ribs", "2 cups beef stock"],
      steps: ["Sear the ribs.", "Braise at 325°F for 3 hours."],
    });
  });

  it("rejects null and empty ingredient/step lists", () => {
    expect(sanitizeRecipe(null)).toBeUndefined();
    expect(sanitizeRecipe(undefined)).toBeUndefined();
    expect(
      sanitizeRecipe({ ingredients: [], steps: ["Stir."] }),
    ).toBeUndefined();
    expect(
      sanitizeRecipe({ ingredients: ["Salt"], steps: [] }),
    ).toBeUndefined();
  });

  it("trims lines, drops empties and duplicates, and caps counts", () => {
    const ingredients = ["Salt", "", "  salt ", `x`.repeat(400)];
    const steps = Array.from({ length: 80 }, (_, i) => `Step ${i + 1}`);
    const recipe = sanitizeRecipe({ ingredients, steps });
    expect(recipe).toBeDefined();
    expect(recipe!.ingredients[0]).toBe("Salt");
    // Dedupe collapses to "Salt" plus the trimmed long line; counts capped.
    expect(recipe!.ingredients.length).toBeLessThanOrEqual(2);
    expect(recipe!.ingredients.every((l) => l.length <= 300)).toBe(true);
    expect(recipe!.steps.length).toBe(60);
  });

  it("drops blank name/servings after trimming", () => {
    const recipe = sanitizeRecipe({
      name: "   ",
      servings: "  ",
      ingredients: ["Salt"],
      steps: ["Add salt."],
    });
    // Strict: the keys must be absent, not present with an undefined value.
    expect(recipe).toStrictEqual({
      ingredients: ["Salt"],
      steps: ["Add salt."],
    });
  });

  it("caps name and servings length", () => {
    const recipe = sanitizeRecipe({
      name: "n".repeat(200),
      servings: "s".repeat(100),
      ingredients: ["Salt"],
      steps: ["Add salt."],
    });
    expect(recipe?.name).toBe("n".repeat(120));
    expect(recipe?.servings).toBe("s".repeat(60));
  });
});
