// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "@convex/_generated/api";
import {
  extractBodyText,
  fetchInstagram,
  fetchXoEmbed,
  linkEnrichment,
  parseInstagramEmbed,
  storePoster,
} from "./ai";
import { newConvexTest } from "./test.setup";

const safeFetch = vi.hoisted(() => vi.fn());
const parseJson = vi.hoisted(() => vi.fn());
const decodeWithContentType = vi.hoisted(() => vi.fn());
const generateObject = vi.hoisted(() => vi.fn());

vi.mock("ai", async (original) => ({
  ...(await original<typeof import("ai")>()),
  generateObject,
}));

vi.mock("./model/safeFetch", () => ({
  decodeWithContentType,
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
      html: '<blockquote class="twitter-tweet"><p lang="en">Hello &amp; <a href="https://t.co/x">#space</a></p>&mdash; NASA (@NASA) <a href="https://x.com">May 1</a></blockquote>',
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

const REEL_PAGE = `<html><head><title>Instagram</title>
<meta name="twitter:image" content="https://scontent.cdninstagram.com/square.jpg?a=1&amp;b=2" />
<meta name="twitter:title" content="National Geographic (&#064;natgeo) &#x2022; Instagram reel" />
<meta property="og:site_name" content="Instagram" />
<meta property="og:image" content="https://scontent.cdninstagram.com/square.jpg?a=1&amp;b=2" />
</head><body><div>Log in Sign up Forgot password?</div></body></html>`;

const REEL_EMBED = `<div class="Embed"><img class="EmbeddedMediaImage" alt="Instagram post shared by &#064;natgeo" src="https://cdn.fbcdn.net/poster.jpg?x=1&amp;y=2" srcset="https://cdn.fbcdn.net/poster.jpg 612w" />
<div class="Caption"><a class="CaptionUsername" href="https://www.instagram.com/natgeo/" target="_blank">natgeo</a><br /><br />Meet the National Geographic 33! <br /><br />We&#039;re honoring modern trailblazers. <a href="/explore/tags/NatGeo33/">#NatGeo33</a><div class="CaptionComments"><a class="CaptionCommentsExpand" href="#">View all comments</a></div></div></div>`;

const REEL_PAGE_WITH_DESCRIPTION = REEL_PAGE.replace(
  "</head>",
  '<meta property="og:description" content="12K likes, 80 comments - natgeo on March 20, 2025: &quot;Meet the 33&quot;" /></head>',
);

const SHELL_PAGE =
  "<html><head><title>Instagram</title></head><body><div>Log in Sign up</div></body></html>";

const encoder = new TextEncoder();

function html(body: string) {
  return {
    ok: true,
    finalUrl: "https://www.instagram.com/",
    status: 200,
    contentType: "text/html; charset=utf-8",
    bytes: encoder.encode(body),
  };
}

type EmbedFailure = { ok: false; code: string; status?: number };

/** Route mocked fetches the way Instagram answers the crawler: the post page,
 * its captioned embed (or how its fetch failed), and the poster image. */
function instagramAnswers(
  page: string,
  embed: string | EmbedFailure | "throws",
) {
  safeFetch.mockImplementation(async (url: string) => {
    if (url.includes("/embed/captioned/")) {
      if (embed === "throws") throw new TypeError("network down");
      return typeof embed === "string" ? html(embed) : embed;
    }
    if (url.startsWith("https://cdn.fbcdn.net/")) {
      return {
        ok: true,
        finalUrl: url,
        status: 200,
        contentType: "image/jpeg",
        bytes: new Uint8Array([1, 2, 3]),
      };
    }
    return html(page);
  });
}

describe("parseInstagramEmbed", () => {
  it("reads the caption without the username, plus the uncropped poster", () => {
    expect(parseInstagramEmbed(REEL_EMBED)).toEqual({
      caption:
        "Meet the National Geographic 33!\n\nWe're honoring modern trailblazers. #NatGeo33",
      username: "natgeo",
      posterUrl: "https://cdn.fbcdn.net/poster.jpg?x=1&y=2",
    });
  });

  it("returns nothing from a page without an embed", () => {
    expect(parseInstagramEmbed(SHELL_PAGE)).toEqual({
      caption: undefined,
      username: undefined,
      posterUrl: undefined,
    });
  });
});

describe("fetchInstagram", () => {
  beforeEach(() => {
    safeFetch.mockReset();
    decodeWithContentType.mockReset();
    decodeWithContentType.mockImplementation((bytes: Uint8Array) =>
      new TextDecoder().decode(bytes),
    );
  });

  it("reads a reel as the crawler sees it, never the login shell", async () => {
    instagramAnswers(REEL_PAGE, REEL_EMBED);
    await expect(
      fetchInstagram("https://www.instagram.com/reel/DHVrPLrIyQ_/?igsh=abc"),
    ).resolves.toEqual({
      title: "Meet the National Geographic 33!",
      description: "National Geographic (@natgeo) • Instagram reel",
      siteName: "Instagram",
      author: "@natgeo",
      heroImageUrl: "https://cdn.fbcdn.net/poster.jpg?x=1&y=2",
      heroAspectRatio: 9 / 16,
      content:
        "Meet the National Geographic 33!\n\nWe're honoring modern trailblazers. #NatGeo33",
    });
    expect(safeFetch).toHaveBeenCalledWith(
      "https://www.instagram.com/reel/DHVrPLrIyQ_/embed/captioned/",
      expect.objectContaining({
        headers: expect.objectContaining({
          "User-Agent": "facebookexternalhit/1.1",
        }),
      }),
    );
  });

  it("falls back to the page card when the embed is unavailable", async () => {
    instagramAnswers(REEL_PAGE, SHELL_PAGE);
    await expect(
      fetchInstagram("https://www.instagram.com/p/DHVrPLrIyQ_/"),
    ).resolves.toEqual({
      title: "National Geographic (@natgeo) • Instagram reel",
      description: undefined,
      siteName: "Instagram",
      author: "@natgeo",
      heroImageUrl: "https://scontent.cdninstagram.com/square.jpg?a=1&b=2",
      heroAspectRatio: 1,
      content: undefined,
    });
  });

  it("uses the page's og:description when the caption is missing", async () => {
    instagramAnswers(REEL_PAGE_WITH_DESCRIPTION, SHELL_PAGE);
    const page = await fetchInstagram(
      "https://www.instagram.com/reel/DHVrPLrIyQ_/",
    );
    expect(page.title).toBe("National Geographic (@natgeo) • Instagram reel");
    expect(page.description).toBe(
      '12K likes, 80 comments - natgeo on March 20, 2025: "Meet the 33"',
    );
    expect(page.incomplete).toBeUndefined();
  });

  it.each<[string, EmbedFailure | "throws"]>([
    ["a server error", { ok: false, code: "http_error", status: 503 }],
    ["rate limiting", { ok: false, code: "http_error", status: 429 }],
    ["a timeout", { ok: false, code: "timeout" }],
    ["a network error", { ok: false, code: "fetch_failed" }],
    ["a thrown fetch", "throws"],
  ])(
    "marks the read incomplete when the caption fetch hits %s",
    async (_, embed) => {
      instagramAnswers(REEL_PAGE, embed);
      const page = await fetchInstagram(
        "https://www.instagram.com/reel/DHVrPLrIyQ_/",
      );
      expect(page.incomplete).toBe(true);
      expect(page.content).toBeUndefined();
      expect(linkEnrichment({ status: "ok", page })).toBe("partial");
    },
  );

  it("treats a caption embed that is not found as no caption", async () => {
    instagramAnswers(REEL_PAGE, { ok: false, code: "http_error", status: 404 });
    const page = await fetchInstagram(
      "https://www.instagram.com/reel/DHVrPLrIyQ_/",
    );
    expect(page.incomplete).toBeUndefined();
    expect(linkEnrichment({ status: "ok", page })).toBe("no_article");
  });

  it.each([
    [
      "the redirected final URL",
      "https://www.instagram.com/reel/DHVrPLrIyQ_/?igsh=abc",
      REEL_PAGE,
    ],
    [
      "og:url",
      "https://www.instagram.com/",
      REEL_PAGE.replace(
        "</head>",
        '<meta property="og:url" content="https://www.instagram.com/reel/DHVrPLrIyQ_/" /></head>',
      ),
    ],
    [
      "the canonical link",
      "https://www.instagram.com/",
      REEL_PAGE.replace(
        "</head>",
        '<link rel="canonical" href="https://www.instagram.com/reel/DHVrPLrIyQ_/" /></head>',
      ),
    ],
    [
      "a relative canonical link",
      "https://www.instagram.com/",
      REEL_PAGE.replace(
        "</head>",
        '<link rel="canonical" href="/reel/DHVrPLrIyQ_/" /></head>',
      ),
    ],
  ])("reads a share link's caption through %s", async (_, finalUrl, page) => {
    instagramAnswers(page, REEL_EMBED);
    const answer = safeFetch.getMockImplementation()!;
    safeFetch.mockImplementation(async (url: string, options: unknown) =>
      url.includes("/share/")
        ? { ...html(page), finalUrl }
        : answer(url, options),
    );
    const read = await fetchInstagram(
      "https://www.instagram.com/share/reel/BAbc123xyz/",
    );
    expect(read.content).toBe(
      "Meet the National Geographic 33!\n\nWe're honoring modern trailblazers. #NatGeo33",
    );
    expect(read.author).toBe("@natgeo");
    expect(safeFetch).toHaveBeenCalledWith(
      "https://www.instagram.com/reel/DHVrPLrIyQ_/embed/captioned/",
      expect.anything(),
    );
    expect(safeFetch).not.toHaveBeenCalledWith(
      expect.stringContaining("BAbc123xyz/embed"),
      expect.anything(),
    );
  });

  it("reads a share link without a resolvable shortcode from its card", async () => {
    instagramAnswers(REEL_PAGE, REEL_EMBED);
    const read = await fetchInstagram(
      "https://www.instagram.com/share/reel/BAbc123xyz/",
    );
    expect(read).toEqual({
      title: "National Geographic (@natgeo) • Instagram reel",
      description: undefined,
      siteName: "Instagram",
      author: "@natgeo",
      heroImageUrl: "https://scontent.cdninstagram.com/square.jpg?a=1&b=2",
      heroAspectRatio: 9 / 16,
      content: undefined,
    });
    expect(safeFetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/embed/captioned/"),
      expect.anything(),
    );
  });

  it("reports a missing post like any gone page", async () => {
    safeFetch.mockResolvedValue({ ok: false, code: "http_error", status: 404 });
    await expect(
      fetchInstagram("https://www.instagram.com/reel/AAAAAAAAAAA/"),
    ).rejects.toMatchObject({ code: "http_error", status: 404 });
  });
});

describe("processItem for Instagram links", () => {
  beforeEach(() => {
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", "");
    safeFetch.mockReset();
    decodeWithContentType.mockReset();
    decodeWithContentType.mockImplementation((bytes: Uint8Array) =>
      new TextDecoder().decode(bytes),
    );
    generateObject.mockReset();
    generateObject.mockResolvedValue({
      object: {
        title: "NatGeo 33",
        description: "A reel honoring modern trailblazers.",
        tags: ["nature"],
        spaceNames: [],
        intents: [],
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function reel(t: ReturnType<typeof newConvexTest>) {
    return await t.run((ctx) =>
      ctx.db.insert("items", {
        userId: "ig-user",
        type: "link",
        url: "https://www.instagram.com/reel/DHVrPLrIyQ_/",
        status: "processing",
        processingRunId: "run-1",
        processingStartedAt: Date.now(),
        tags: [],
        searchText: "",
      }),
    );
  }

  it("stores the reel poster and keeps the caption as content", async () => {
    instagramAnswers(REEL_PAGE, REEL_EMBED);
    const t = newConvexTest();
    const itemId = await reel(t);

    await t.action(internal.ai.processItem, { itemId, runId: "run-1" });

    const item = await t.run((ctx) => ctx.db.get(itemId));
    expect(item).toMatchObject({
      status: "ready",
      title: "NatGeo 33",
      siteName: "Instagram",
      author: "@natgeo",
      aspectRatio: 9 / 16,
      content:
        "Meet the National Geographic 33!\n\nWe're honoring modern trailblazers. #NatGeo33",
    });
    expect(item?.storageId).toBeDefined();
    expect(item?.enrichment).toBeUndefined();
  });

  it("still saves a ready item when Instagram shares nothing", async () => {
    instagramAnswers(SHELL_PAGE, SHELL_PAGE);
    const t = newConvexTest();
    const itemId = await reel(t);

    await t.action(internal.ai.processItem, { itemId, runId: "run-1" });

    const item = await t.run((ctx) => ctx.db.get(itemId));
    expect(item).toMatchObject({
      status: "ready",
      title: "NatGeo 33",
      siteName: "Instagram",
      enrichment: "no_article",
    });
    expect(item?.content).toBeUndefined();
    expect(item?.storageId).toBeUndefined();
  });

  it("offers a retry when the caption fetch fails transiently", async () => {
    instagramAnswers(REEL_PAGE, { ok: false, code: "http_error", status: 502 });
    const t = newConvexTest();
    const itemId = await reel(t);

    await t.action(internal.ai.processItem, { itemId, runId: "run-1" });

    const item = await t.run((ctx) => ctx.db.get(itemId));
    expect(item).toMatchObject({
      status: "ready",
      title: "NatGeo 33",
      siteName: "Instagram",
      author: "@natgeo",
      enrichment: "partial",
    });
    expect(item?.content).toBeUndefined();
  });
});
