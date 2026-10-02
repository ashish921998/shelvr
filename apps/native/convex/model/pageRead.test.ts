import { beforeEach, describe, expect, it, vi } from "vitest";

import { linkEnrichment, pinterestPage, readPage } from "./pageRead";

const safeFetch = vi.hoisted(() => vi.fn());

vi.mock("./safeFetch", async (original) => ({
  ...(await original<typeof import("./safeFetch")>()),
  safeFetch,
}));

const PIN_URL =
  "https://www.pinterest.com/pin/25-easy-chicken-recipes-for-quick-healthy-dinners--643944446743403202/";
const WIDGET_URL =
  "https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=643944446743403202";
const SOURCE_URL = "https://neutraleating.com/chicken-recipes/";

// The fields a probe of this pin's widget answer returned on 2026-09-28. It is
// a video pin: the probe found a V_HLSV4 video (1000x1500) in its video list
// while is_video read false, as it did on every video pin probed.
const videoPin = {
  id: "643944446743403202",
  description:
    "These chicken recipes are all under 30 minutes &#127831; start to finish",
  link: SOURCE_URL,
  domain: "neutraleating.com",
  is_video: false,
  images: {
    "236x": {
      url: "https://i.pinimg.com/236x/7a/11/ce/7a11ce62e83fa836834f96c2e609c759.jpg",
      width: 236,
      height: 354,
    },
    "564x": {
      url: "https://i.pinimg.com/564x/7a/11/ce/7a11ce62e83fa836834f96c2e609c759.jpg",
      width: 564,
      height: 846,
    },
  },
  videos: { video_list: { V_HLSV4: { url: "https://v1.pinimg.com/x.m3u8" } } },
  board: { name: "Dinner Ideas" },
  pinner: { full_name: "Neutral Eating", username: "neutraleating" },
  rich_metadata: { title: "25 Healthy Chicken Recipes - Neutral Eating" },
};

function json(url: string, body: unknown) {
  return {
    ok: true,
    finalUrl: url,
    status: 200,
    contentType: "application/json; charset=utf-8",
    bytes: new TextEncoder().encode(JSON.stringify(body)),
  };
}

function html(url: string, body: string) {
  return {
    ok: true,
    finalUrl: url,
    status: 200,
    contentType: "text/html; charset=utf-8",
    bytes: new TextEncoder().encode(body),
  };
}

const PIN_PAGE =
  '<html><head><meta property="og:title" content="Chicken | recipes"><meta property="og:image" content="https://i.pinimg.com/736x/7a/11/ce/x.jpg"><meta property="og:image:width" content="736"><meta property="og:image:height" content="1104"></head><body></body></html>';

/** A pin page with no image or text, as Pinterest serves for a pin id it has
 * no pin for. */
const EMPTY_PIN_PAGE =
  '<html><head><meta property="og:site_name" content="Pinterest"></head><body></body></html>';

/** Serves `routes` by exact URL; every other fetch fails. */
function serve(routes: Record<string, unknown>) {
  safeFetch.mockImplementation(
    async (url: string) =>
      routes[url] ?? { ok: false, code: "http_error", status: 599 },
  );
}

beforeEach(() => {
  safeFetch.mockReset();
});

describe("pinterestPage", () => {
  it("keeps the description as the only content and the rest as fields", () => {
    expect(pinterestPage(videoPin)).toEqual({
      siteName: "Pinterest",
      author: "Neutral Eating",
      heroImageUrl:
        "https://i.pinimg.com/736x/7a/11/ce/7a11ce62e83fa836834f96c2e609c759.jpg",
      heroAspectRatio: 564 / 846,
      content:
        "These chicken recipes are all under 30 minutes 🍗 start to finish",
      caption: true,
      board: "Dinner Ideas",
      video: true,
      linkedUrl: SOURCE_URL,
      linkedTitle: "25 Healthy Chicken Recipes - Neutral Eating",
    });
  });

  it("does not call a photo pin a video", () => {
    const { videos: _videos, ...photoPin } = videoPin;
    expect(pinterestPage(photoPin)?.video).toBeUndefined();
    expect(
      pinterestPage({ ...photoPin, videos: { video_list: {} } })?.video,
    ).toBeUndefined();
  });

  it("drops a source link that leads back to Pinterest", () => {
    const page = pinterestPage({
      ...videoPin,
      link: "https://in.pinterest.com/pin/1/",
    });
    expect(page?.linkedUrl).toBeUndefined();
    expect(page?.linkedTitle).toBeUndefined();
  });

  it("returns nothing for a pin with neither image nor description", () => {
    expect(pinterestPage({ description: " ", images: {} })).toBeUndefined();
  });
});

describe("readPage for Pinterest pins", () => {
  it("reads the pin from the widget endpoint, not the oversized page", async () => {
    serve({ [WIDGET_URL]: json(WIDGET_URL, { data: [videoPin] }) });
    const read = await readPage(PIN_URL);
    expect(read).toMatchObject({
      status: "ok",
      askForRecipe: true,
      page: { siteName: "Pinterest", caption: true, board: "Dinner Ideas" },
    });
    expect(read).not.toHaveProperty("shortForm");
    expect(safeFetch).not.toHaveBeenCalledWith(PIN_URL, expect.anything());
  });

  it("takes the recipe from the pin's source page markup", async () => {
    const recipe = {
      "@context": "https://schema.org",
      "@type": "Recipe",
      name: "Honey garlic chicken",
      recipeIngredient: ["2 chicken breasts", "3 tbsp honey"],
      recipeInstructions: ["Sear the chicken.", "Glaze with honey."],
    };
    serve({
      [WIDGET_URL]: json(WIDGET_URL, { data: [videoPin] }),
      [SOURCE_URL]: html(
        SOURCE_URL,
        `<html><head><script type="application/ld+json">${JSON.stringify(recipe)}</script></head><body></body></html>`,
      ),
    });
    const read = await readPage(PIN_URL);
    expect(read.status === "ok" && read.page.recipe?.ingredients).toEqual(
      recipe.recipeIngredient,
    );
    expect(read.status === "ok" && read.askForRecipe).toBe(false);
  });

  it("follows a pin.it short link to the pin id", async () => {
    const shortUrl = "https://pin.it/4Vw0y6Zab";
    serve({
      [shortUrl]: html(
        "https://www.pinterest.com/pin/643944446743403202/sent/?invite_code=x",
        "<html></html>",
      ),
      [WIDGET_URL]: json(WIDGET_URL, { data: [videoPin] }),
    });
    const read = await readPage(shortUrl);
    expect(read.status === "ok" && read.page.siteName).toBe("Pinterest");
    // The page cap, not a smaller one: draining a pin page past a 64 KiB cap
    // stalled to the deadline on live Pinterest.
    expect(safeFetch).toHaveBeenCalledWith(
      shortUrl,
      expect.objectContaining({ maxRedirects: 5, maxBytes: 1024 * 1024 }),
    );
  });

  it("falls back to the pin page, not asking for a recipe, when the widget has no pin", async () => {
    serve({
      [WIDGET_URL]: json(WIDGET_URL, { data: [null] }),
      [PIN_URL]: html(PIN_URL, PIN_PAGE),
    });
    const read = await readPage(PIN_URL);
    expect(read).toMatchObject({
      status: "ok",
      askForRecipe: false,
      page: { title: "Chicken | recipes" },
    });
    expect(read.status === "ok" && read.page.incomplete).toBeUndefined();
  });

  it("marks the page read incomplete when the widget fails transiently", async () => {
    serve({
      [WIDGET_URL]: { ok: false, code: "http_error", status: 503 },
      // Even an empty page is kept: the widget may answer on a retry.
      [PIN_URL]: html(PIN_URL, EMPTY_PIN_PAGE),
    });
    const read = await readPage(PIN_URL);
    expect(read.status === "ok" && read.page.incomplete).toBe(true);
    expect(
      linkEnrichment(read.status === "ok" ? read : { status: "unreadable" }),
    ).toBe("partial");
  });

  it("marks the page read incomplete when the widget fetch throws", async () => {
    safeFetch.mockImplementation(async (url: string) => {
      if (url === WIDGET_URL) throw new Error("socket hang up");
      return url === PIN_URL
        ? html(PIN_URL, EMPTY_PIN_PAGE)
        : { ok: false, code: "http_error", status: 599 };
    });
    const read = await readPage(PIN_URL);
    expect(read.status === "ok" && read.page.incomplete).toBe(true);
  });

  it("fails as gone when a deleted pin's page 404s", async () => {
    safeFetch.mockImplementation(async (url: string) =>
      url === WIDGET_URL
        ? json(url, { data: [] })
        : { ok: false, code: "http_error", status: 404 },
    );
    expect((await readPage(PIN_URL)).status).toBe("gone");
  });

  it("fails a deleted pin as gone when its page redirects to Pinterest's home page", async () => {
    serve({
      [WIDGET_URL]: json(WIDGET_URL, { data: [] }),
      [PIN_URL]: html(
        "https://www.pinterest.com/?show_error=true",
        '<html><head><meta property="og:title" content="Pinterest"></head></html>',
      ),
    });
    expect((await readPage(PIN_URL)).status).toBe("gone");
  });

  it("fails a pin id that never existed as gone when Pinterest serves an empty shell", async () => {
    serve({
      [WIDGET_URL]: json(WIDGET_URL, { data: [null] }),
      [PIN_URL]: html(PIN_URL, EMPTY_PIN_PAGE),
    });
    expect((await readPage(PIN_URL)).status).toBe("gone");
  });

  it("keeps a widget-less pin page that was cut off before its tags", async () => {
    serve({
      [WIDGET_URL]: json(WIDGET_URL, { data: [null] }),
      [PIN_URL]: { ...html(PIN_URL, EMPTY_PIN_PAGE), truncated: true },
    });
    expect((await readPage(PIN_URL)).status).toBe("ok");
  });

  it("keeps a widget-less pin page that has only a description", async () => {
    serve({
      [WIDGET_URL]: json(WIDGET_URL, { data: [null] }),
      [PIN_URL]: html(
        PIN_URL,
        '<html><head><meta property="og:description" content="Honey garlic chicken"></head><body></body></html>',
      ),
    });
    expect((await readPage(PIN_URL)).status).toBe("ok");
  });

  it("fails a deleted pin.it pin as gone, reading the resolved pin page", async () => {
    const shortUrl = "https://pin.it/4Vw0y6Zab";
    const pinUrl = "https://www.pinterest.com/pin/643944446743403202/";
    safeFetch.mockImplementation(async (url: string) =>
      url === shortUrl
        ? html(pinUrl, "<html></html>")
        : url === WIDGET_URL
          ? json(url, { data: [] })
          : { ok: false, code: "http_error", status: 404 },
    );
    expect((await readPage(shortUrl)).status).toBe("gone");
    expect(safeFetch).toHaveBeenCalledWith(pinUrl, expect.anything());
    expect(safeFetch).toHaveBeenCalledTimes(3);
  });

  it("fails a pin.it code Pinterest does not know as gone", async () => {
    const shortUrl = "https://pin.it/unknown";
    serve({ [shortUrl]: html("https://www.pinterest.com/", "<html></html>") });
    expect((await readPage(shortUrl)).status).toBe("gone");
    expect(safeFetch).toHaveBeenCalledTimes(1);
  });

  it("does not follow links in the page fallback's body", async () => {
    const outside = "https://recipes.test/other";
    serve({
      [WIDGET_URL]: json(WIDGET_URL, { data: [null] }),
      [PIN_URL]: html(
        PIN_URL,
        `<html><head><meta property="og:title" content="Pin"></head><body><article><p>See ${outside} for the full recipe, and more text so the article body is long enough to be extracted as content here.</p></article></body></html>`,
      ),
    });
    await readPage(PIN_URL);
    expect(safeFetch).not.toHaveBeenCalledWith(outside, expect.anything());
  });
});

describe("readPage for Instagram posts", () => {
  it("still follows the caption's link to its recipe", async () => {
    const postUrl = "https://www.instagram.com/p/ABC123/";
    const embedUrl = "https://www.instagram.com/p/ABC123/embed/captioned/";
    const recipeUrl = "https://example.com/honey-chicken/";
    const recipe = {
      "@context": "https://schema.org",
      "@type": "Recipe",
      name: "Honey chicken",
      recipeIngredient: ["2 chicken breasts", "3 tbsp honey"],
      recipeInstructions: ["Sear the chicken.", "Glaze with honey."],
    };
    serve({
      [postUrl]: html(postUrl, "<html><head></head><body></body></html>"),
      [embedUrl]: html(
        embedUrl,
        `<div class="Caption"><a class="CaptionUsername">cook</a>Honey chicken, recipe at ${recipeUrl}<div class="CaptionComments"></div></div>`,
      ),
      [recipeUrl]: html(
        recipeUrl,
        `<html><head><script type="application/ld+json">${JSON.stringify(recipe)}</script></head><body></body></html>`,
      ),
    });
    const read = await readPage(postUrl);
    expect(read.status === "ok" && read.page.recipe?.ingredients).toEqual(
      recipe.recipeIngredient,
    );
  });
});
