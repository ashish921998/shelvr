import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { linkEnrichment, pinterestPage, readPage } from "./pageRead";

const safeFetch = vi.hoisted(() => vi.fn());
const logEvent = vi.hoisted(() => vi.fn());

vi.mock("./log", () => ({ logEvent }));

vi.mock("./safeFetch", async (original) => ({
  ...(await original<typeof import("./safeFetch")>()),
  safeFetch,
}));

const PIN_URL =
  "https://www.pinterest.com/pin/25-easy-chicken-recipes-for-quick-healthy-dinners--643944446743403202/";
const WIDGET_URL =
  "https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=643944446743403202";
const SOURCE_URL = "https://neutraleating.com/chicken-recipes/";

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

function video(snippet: Record<string, unknown>, id = "Ab_cd-Ef123") {
  return { items: [{ id, snippet }] };
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

const EMPTY_PIN_PAGE =
  '<html><head><meta property="og:site_name" content="Pinterest"></head><body></body></html>';

function serve(routes: Record<string, unknown>) {
  safeFetch.mockImplementation(
    async (url: string) =>
      routes[url] ?? { ok: false, code: "http_error", status: 599 },
  );
}

beforeEach(() => {
  safeFetch.mockReset();
  logEvent.mockReset();
  vi.stubEnv("YOUTUBE_API_KEY", "");
});

afterEach(() => vi.unstubAllEnvs());

describe("YouTube description reader", () => {
  const url = "https://www.youtube.com/watch?v=Ab_cd-Ef123";
  const oembed = {
    title: "Fallback title",
    author_name: "Fallback channel",
    thumbnail_url: "https://i.ytimg.com/fallback.jpg",
    thumbnail_width: 480,
    thumbnail_height: 360,
  };
  function serveVideo(snippet: Record<string, unknown>) {
    vi.stubEnv("YOUTUBE_API_KEY", "fixture-key");
    safeFetch.mockImplementation(async (endpoint: string) =>
      new URL(endpoint).hostname === "www.googleapis.com"
        ? json(
            endpoint,
            video({
              title: "Soup",
              channelTitle: "Cook",
              thumbnails: {
                high: {
                  url: "https://i.ytimg.com/soup.jpg",
                  width: 1280,
                  height: 720,
                },
              },
              ...snippet,
            }),
          )
        : json(endpoint, oembed),
    );
  }
  it.each([
    [1280, 720],
    [720, 1280],
  ])(
    "maps verified snippet fields and dimensions %i x %i",
    async (width, height) => {
      serveVideo({
        description: "Ingredients: beans. Simmer until tender.",
        thumbnails: {
          high: { url: "https://i.ytimg.com/soup.jpg", width, height },
        },
      });
      const result = await readPage(url);
      expect(result).toMatchObject({
        status: "ok",
        askForRecipe: true,
        page: {
          title: "Soup",
          author: "Cook",
          siteName: "YouTube",
          caption: true,
          content: "Ingredients: beans. Simmer until tender.",
          heroImageUrl: "https://i.ytimg.com/soup.jpg",
          heroAspectRatio: width / height,
        },
      });
      const [endpoint, options] = safeFetch.mock.calls[0]!;
      expect(new URL(endpoint).searchParams.get("part")).toBe("snippet");
      expect(new URL(endpoint).searchParams.get("id")).toBe("Ab_cd-Ef123");
      expect(options).toMatchObject({ timeoutMs: 15000, maxBytes: 64 * 1024 });
      expect(options.allowContentType("application/json")).toBe(true);
      expect(options.allowContentType("text/html")).toBe(false);
    },
  );
  it.each([undefined, "", "x".repeat(6001)])(
    "does not transcribe missing or over-limit descriptions",
    async (description) => {
      serveVideo({ description });
      expect(await readPage(url)).toMatchObject({
        status: "ok",
        askForRecipe: false,
      });
    },
  );
  it.each([
    {
      thumbnails: {
        high: { url: "https://i.ytimg.com/high.jpg", width: 480, height: 360 },
        maxres: {
          url: "https://i.ytimg.com/maxres.jpg",
          width: 1280,
          height: 720,
        },
        default: {
          url: "https://i.ytimg.com/default.jpg",
          width: 120,
          height: 90,
        },
      },
      selected: "https://i.ytimg.com/maxres.jpg",
      ratio: 1280 / 720,
    },
    {
      thumbnails: { high: { url: "https://i.ytimg.com/high.jpg" } },
      selected: "https://i.ytimg.com/high.jpg",
      ratio: undefined,
    },
  ])(
    "selects the best thumbnail without inventing missing dimensions: %#",
    async ({ thumbnails, selected, ratio }) => {
      serveVideo({ description: "Beans. Simmer.", thumbnails });
      const result = await readPage(url);
      expect(result).toMatchObject({
        status: "ok",
        askForRecipe: true,
        page: { heroImageUrl: selected },
      });
      expect(
        result.status === "ok" ? result.page.heroAspectRatio : "failed",
      ).toBe(ratio);
      expect(safeFetch).toHaveBeenCalledTimes(1);
    },
  );
  it("follows description links and lets markup win", async () => {
    serveVideo({ description: "Recipe: https://recipes.example/soup" });
    const primary = safeFetch.getMockImplementation()!;
    safeFetch.mockImplementation(async (endpoint: string) =>
      endpoint === "https://recipes.example/soup"
        ? html(
            endpoint,
            `<script type="application/ld+json">${JSON.stringify({
              "@type": "Recipe",
              name: "Soup",
              recipeIngredient: ["1 cup beans"],
              recipeInstructions: ["Simmer beans."],
            })}</script>`,
          )
        : primary(endpoint),
    );
    expect(await readPage(url)).toMatchObject({
      status: "ok",
      askForRecipe: false,
      page: { recipe: { ingredients: ["1 cup beans"] } },
    });
    const linkedOptions = safeFetch.mock.calls.find(
      ([endpoint]) => endpoint === "https://recipes.example/soup",
    )?.[1];
    expect(linkedOptions).toMatchObject({
      timeoutMs: 15000,
      maxBytes: 1024 * 1024,
    });
    expect(linkedOptions.allowContentType("text/html")).toBe(true);
    expect(linkedOptions.allowContentType("application/json")).toBe(false);
  });
  it.each(["https://linktr.ee/cook", "https://recipes.example/missing"])(
    "keeps captions when a linked recipe is skipped or fails: %s",
    async (link) => {
      serveVideo({ description: `Beans, simmer. ${link}` });
      const primary = safeFetch.getMockImplementation()!;
      safeFetch.mockImplementation(async (endpoint: string) =>
        endpoint === link
          ? { ok: false, code: "blocked_host" }
          : primary(endpoint),
      );
      expect(await readPage(url)).toMatchObject({
        status: "ok",
        askForRecipe: true,
      });
      expect(safeFetch).toHaveBeenCalledTimes(
        link.includes("linktr.ee") ? 1 : 2,
      );
    },
  );
  it.each([
    [
      "markup-less HTML",
      html(
        "https://recipes.example/soup",
        "<html><body>No structured recipe here.</body></html>",
      ),
    ],
    ["transient timeout", { ok: false, code: "timeout" }],
    ["transient network failure", { ok: false, code: "network_error" }],
  ])(
    "retains the exact caption result after linked %s",
    async (_, linkedResponse) => {
      const link = "https://recipes.example/soup";
      serveVideo({ description: `Beans. Simmer. ${link}` });
      const primary = safeFetch.getMockImplementation()!;
      safeFetch.mockImplementation(async (endpoint: string) =>
        endpoint === link ? linkedResponse : primary(endpoint),
      );
      expect(await readPage(url)).toEqual({
        status: "ok",
        askForRecipe: true,
        page: {
          title: "Soup",
          author: "Cook",
          siteName: "YouTube",
          heroImageUrl: "https://i.ytimg.com/soup.jpg",
          heroAspectRatio: 1280 / 720,
          content: `Beans. Simmer. ${link}`,
          caption: true,
        },
      });
      expect(safeFetch).toHaveBeenCalledTimes(2);
      expect(safeFetch.mock.calls[1]![0]).toBe(link);
    },
  );
  it.each([
    "https://www.youtube.com/watch?v=Ab_cd-Ef123",
    "https://www.instagram.com/p/ABC123/",
  ])("skips social description links just like link hubs: %s", async (link) => {
    serveVideo({ description: `Beans. Simmer. ${link}` });
    expect(await readPage(url)).toMatchObject({
      status: "ok",
      askForRecipe: true,
      page: { caption: true, content: `Beans. Simmer. ${link}` },
    });
    expect(safeFetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    [
      { ok: false, code: "http_error", status: 403 },
      "page_fetch_error:http_error",
    ],
    [
      { ok: false, code: "http_error", status: 401 },
      "page_fetch_error:http_error",
    ],
    [
      { ok: false, code: "http_error", status: 500 },
      "page_fetch_error:http_error",
    ],
    [{ ok: false, code: "network_error" }, "page_fetch_error:network_error"],
    [json(url, { items: [] }), "unreadable_video"],
    [json(url, video({ title: 42 })), "unreadable_video"],
    [json(url, null), "unreadable_video"],
    [
      json(url, video({ title: "Wrong video" }, "differentID")),
      "unreadable_video",
    ],
    [json(url, video({ title: "Soup", description: 42 })), "unreadable_video"],
    [
      { ...json(url, {}), bytes: new TextEncoder().encode("{bad") },
      "unexpected_error:SyntaxError",
    ],
    [new Error("fixture network rejection"), "unexpected_error:Error"],
    [
      {
        ...json(url, video({ title: "Soup", description: "Cut ingredients" })),
        truncated: true,
      },
      "unreadable_video",
    ],
  ])(
    "preserves the exact no-key oEmbed result on optional API failure %#",
    async (failure, category) => {
      safeFetch.mockImplementation(async (endpoint: string) =>
        json(endpoint, oembed),
      );
      const baseline = await readPage(url);
      expect(safeFetch).toHaveBeenCalledTimes(1);
      vi.stubEnv("YOUTUBE_API_KEY", "fixture-key");
      safeFetch.mockImplementation(async (endpoint: string) => {
        if (new URL(endpoint).hostname !== "www.googleapis.com")
          return json(endpoint, oembed);
        if (failure instanceof Error) throw failure;
        return failure;
      });
      expect(await readPage(url)).toEqual(baseline);
      expect(logEvent).toHaveBeenCalledExactlyOnceWith(
        "warn",
        "youtube_data_api_fallback",
        { error_category: category },
      );
    },
  );
  it.each([
    "https://youtube.com/shorts/Ab_cd-Ef123/extra",
    "https://youtube.com/watch",
    "https://youtube.com/watch?v=short",
    "https://youtu.be/",
    "https://youtube.com/embed/not-an-id",
    "https://youtube.com/live/Ab_cd-Ef123",
  ])(
    "does not request the Data API for unsupported video URLs: %s",
    async (unsupportedUrl) => {
      vi.stubEnv("YOUTUBE_API_KEY", "fixture-key");
      safeFetch.mockImplementation(async (endpoint: string) =>
        json(endpoint, oembed),
      );
      await readPage(unsupportedUrl);
      expect(safeFetch).toHaveBeenCalledTimes(1);
      expect(safeFetch.mock.calls[0]![0]).toContain("/oembed?");
    },
  );
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

  it("decodes a pinner name Pinterest encoded more than once", () => {
    const pin = {
      ...videoPin,
      pinner: { full_name: "CatPawPrintables &amp;amp;amp; TheKnitNut" },
    };
    expect(pinterestPage(pin)?.author).toBe("CatPawPrintables & TheKnitNut");
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

const INSTAGRAM_SHELL =
  '<html><head><title>Instagram</title><meta property="og:title" content="Instagram" /></head><body></body></html>';

const BROKEN_EMBED =
  '<div class="_aa4c"><div class="EmbedBrokenMedia"><p>This post may be broken, or the post may have been removed.</p></div></div>';

describe("readPage for Instagram posts", () => {
  it.each([
    ["Beans. Simmer for 20 minutes.", false, true],
    ["A lovely sunset today.", false, true],
    ["Beans…", true, false],
    ["x".repeat(6001), false, false],
    ["Beans. Simmer.", true, false],
    ["", false, false],
  ])(
    "uses only complete verified captions: %#",
    async (caption, truncated, eligible) => {
      const url = "https://www.instagram.com/p/ABC123/";
      const embedUrl = `${url}embed/captioned/`;
      serve({
        [url]: html(url, INSTAGRAM_SHELL),
        [embedUrl]: {
          ...html(
            embedUrl,
            `<div class="Caption"><a class="CaptionUsername">cook</a>${caption}<div class="CaptionComments"></div></div>`,
          ),
          truncated,
        },
      });
      const result = await readPage(url);
      expect(result).toMatchObject({ status: "ok", askForRecipe: eligible });
      if (result.status === "ok") {
        expect(result.page.caption).toBe(caption === "" ? undefined : true);
        expect(result.page.recipe).toBeUndefined();
      }
    },
  );
  it("fails a deleted reel as gone instead of saving it blank", async () => {
    const reelUrl = "https://www.instagram.com/reel/AAAAAAAAAAA/";
    serve({
      [reelUrl]: html(reelUrl, INSTAGRAM_SHELL),
      [`${reelUrl}embed/captioned/`]: html(reelUrl, BROKEN_EMBED),
    });
    await expect(readPage(reelUrl)).resolves.toMatchObject({ status: "gone" });
  });

  it("fails a share link to a deleted reel as gone", async () => {
    const shareUrl = "https://www.instagram.com/share/reel/BAbc123xyz/";
    const reelUrl = "https://www.instagram.com/reel/AAAAAAAAAAA/";
    serve({
      [shareUrl]: html(reelUrl, INSTAGRAM_SHELL),
      [`${reelUrl}embed/captioned/`]: html(reelUrl, BROKEN_EMBED),
    });
    await expect(readPage(shareUrl)).resolves.toMatchObject({
      status: "gone",
    });
  });

  it.each([
    ["the page", true, false, BROKEN_EMBED],
    ["the embed", false, true, BROKEN_EMBED],
    ["the embed, before its broken-media box,", false, true, "<html><body>"],
  ])(
    "keeps a post retryable, not gone, when %s was cut short",
    async (_, pageCut, embedCut, embedBody) => {
      const reelUrl = "https://www.instagram.com/reel/AAAAAAAAAAA/";
      const cut = (read: ReturnType<typeof html>, isCut: boolean) =>
        isCut ? { ...read, truncated: true } : read;
      serve({
        [reelUrl]: cut(html(reelUrl, INSTAGRAM_SHELL), pageCut),
        [`${reelUrl}embed/captioned/`]: cut(html(reelUrl, embedBody), embedCut),
      });
      const read = await readPage(reelUrl);
      expect(read).toMatchObject({
        status: "ok",
        page: { truncated: true, incomplete: true },
      });
      expect(linkEnrichment(read.status === "ok" ? read : undefined)).toBe(
        "partial",
      );
    },
  );

  it.each([
    ["a /share/p/ link", "https://www.instagram.com/share/p/BAbc123xyz/", "p"],
    ["a /tv/ link", "https://www.instagram.com/tv/AAAAAAAAAAA/", "tv"],
  ])("fails %s to a deleted post as gone", async (_, url, kind) => {
    const postUrl = `https://www.instagram.com/${kind}/AAAAAAAAAAA/`;
    serve({
      [url]: html(postUrl, INSTAGRAM_SHELL),
      [`${postUrl}embed/captioned/`]: html(postUrl, BROKEN_EMBED),
    });
    await expect(readPage(url)).resolves.toMatchObject({ status: "gone" });
  });

  it("marks a /p/ post short-form video when its card says video", async () => {
    const postUrl = "https://www.instagram.com/p/fA9uwTtkSN/";
    serve({
      [postUrl]: html(
        postUrl,
        '<html><head><meta name="twitter:title" content="Diego (@diegoquinteiro) &#x2022; Instagram video" /></head></html>',
      ),
    });
    const read = await readPage(postUrl);
    expect(read).toMatchObject({
      status: "ok",
      page: { video: true },
      shortForm: { site: "Instagram", video: true },
    });
  });

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
    expect(read).toMatchObject({
      askForRecipe: false,
      page: { caption: true },
    });
  });
});

describe("readPage for YouTube videos", () => {
  const videoUrl = "https://youtu.be/dQw4w9WgXcQ";
  const oEmbedUrl = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(videoUrl)}`;

  it("reads the title, channel and thumbnail from oEmbed", async () => {
    serve({
      [oEmbedUrl]: json(oEmbedUrl, {
        title: "Never Gonna Give You Up",
        author_name: "Rick Astley",
        thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        thumbnail_width: 480,
        thumbnail_height: 360,
      }),
    });
    await expect(readPage(videoUrl)).resolves.toMatchObject({
      status: "ok",
      page: {
        title: "Never Gonna Give You Up",
        siteName: "YouTube",
        author: "Rick Astley",
        heroImageUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        heroAspectRatio: 480 / 360,
      },
    });
    expect(safeFetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to the page when oEmbed refuses the link", async () => {
    serve({
      [oEmbedUrl]: { ok: false, code: "http_error", status: 401 },
      [videoUrl]: html(
        videoUrl,
        '<html><head><meta property="og:title" content="A private video"></head><body></body></html>',
      ),
    });
    await expect(readPage(videoUrl)).resolves.toMatchObject({
      status: "ok",
      page: { title: "A private video" },
    });
    const read = await readPage(videoUrl);
    expect(read.status === "ok" && read.page.incomplete).toBeFalsy();
  });

  it.each([
    ["times out", { ok: false, code: "timeout" }],
    ["is rate limited", { ok: false, code: "http_error", status: 429 }],
    ["answers without a title", json(oEmbedUrl, {})],
  ])("keeps the save retryable when oEmbed %s", async (_, answer) => {
    serve({
      [oEmbedUrl]: answer,
      [videoUrl]: html(
        videoUrl,
        "<html><head><title>Before you continue to YouTube</title></head><body></body></html>",
      ),
    });
    await expect(readPage(videoUrl)).resolves.toMatchObject({
      status: "ok",
      page: { incomplete: true },
    });
  });
});
