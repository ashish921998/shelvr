// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";
import { api, internal } from "@convex/_generated/api";
import {
  extractBodyText,
  fetchInstagram,
  fetchXoEmbed,
  fetchXPost,
  linkEnrichment,
  parseInstagramEmbed,
  storePoster,
} from "./ai";
import articleSyndication from "./testdata/xSyndication/article.json";
import escapedSyndication from "./testdata/xSyndication/escaped.json";
import fxArticle from "./testdata/xSyndication/fxArticle.json";
import fxVideoArticle from "./testdata/xSyndication/fxVideoArticle.json";
import videoArticleSyndication from "./testdata/xSyndication/videoArticle.json";
import fxListArticle from "./testdata/xSyndication/fxListArticle.json";
import gifSyndication from "./testdata/xSyndication/gif.json";
import listArticleSyndication from "./testdata/xSyndication/listArticle.json";
import mediaOnlySyndication from "./testdata/xSyndication/mediaOnly.json";
import longVideoSyndication from "./testdata/xSyndication/longVideo.json";
import oembedText from "./testdata/xSyndication/oembedText.json";
import photoSyndication from "./testdata/xSyndication/photo.json";
import photosSyndication from "./testdata/xSyndication/photos.json";
import textSyndication from "./testdata/xSyndication/text.json";
import tombstoneSyndication from "./testdata/xSyndication/tombstone.json";
import videoSyndication from "./testdata/xSyndication/video.json";

import type { ArticleMedia, PostMedia } from "./model/itemFields";
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

type FakeResponse =
  | { status: number; body?: unknown; raw?: string }
  | { error: "timeout" | "fetch_failed" };

const FXTWITTER = "https://api.fxtwitter.com/2/status/";

function serveX(
  syndication: FakeResponse,
  oembed: FakeResponse,
  fxtwitter: FakeResponse = { status: 599 },
) {
  safeFetch.mockImplementation(async (url: string) => {
    const response = url.startsWith(
      "https://cdn.syndication.twimg.com/tweet-result?",
    )
      ? syndication
      : url.startsWith("https://publish.twitter.com/oembed?")
        ? oembed
        : url.startsWith(FXTWITTER)
          ? fxtwitter
          : { status: 599 };
    if ("error" in response) {
      return { ok: false, code: response.error };
    }
    if (response.status !== 200) {
      return { ok: false, code: "http_error", status: response.status };
    }
    return {
      ok: true,
      finalUrl: url,
      status: 200,
      contentType: "application/json; charset=utf-8",
      bytes: new TextEncoder().encode(
        response.raw ?? JSON.stringify(response.body),
      ),
    };
  });
}

function fxtwitterCalls(): unknown[][] {
  return safeFetch.mock.calls.filter(([url]) =>
    String(url).startsWith(FXTWITTER),
  );
}

const JACK_OEMBED_READ = {
  title: "just setting up my twttr",
  siteName: "X",
  author: "@jack",
  content: "just setting up my twttr",
};

describe("fetchXPost", () => {
  beforeEach(async () => {
    safeFetch.mockReset();
    parseJson.mockReset();
    const actual =
      await vi.importActual<typeof import("./model/safeFetch")>(
        "./model/safeFetch",
      );
    parseJson.mockImplementation(actual.parseJson);
  });

  it("reads an Article post's title, opening text, and cover", async () => {
    serveX({ status: 200, body: articleSyndication }, { status: 500 });
    await expect(
      fetchXPost("https://x.com/adamtwtz/status/2097073557868056925"),
    ).resolves.toEqual({
      title: "How this GLP-1 app generated 20m+ views",
      siteName: "X",
      author: "@adamtwtz",
      content:
        "An app spent $21,418, generated 23.1M views and scaled from $2k -> $25k mrr within 4 months on Content Rewards.\nit's a GLP-1 tracking app, and they've been running one campaign since April.\nthe…",
      heroImageUrl:
        "https://pbs.twimg.com/media/HRpC3HfbAAARTL7.jpg?name=large",
      heroAspectRatio: 2.5,
    });
  });

  it("keeps the cover of an Article X marks sensitive off the card", async () => {
    serveX(
      {
        status: 200,
        body: { ...articleSyndication, possibly_sensitive: true },
      },
      { status: 500 },
    );
    const read = await fetchXPost(
      "https://x.com/adamtwtz/status/2097073557868056925",
    );
    expect(read.title).toBe("How this GLP-1 app generated 20m+ views");
    expect(read.content).toMatch(/^An app spent \$21,418/);
    expect(read.heroImageUrl).toBeUndefined();
    expect(read.heroAspectRatio).toBeUndefined();
  });

  it("reads a text-only post the same way oEmbed does", async () => {
    serveX({ status: 200, body: textSyndication }, { status: 500 });
    await expect(fetchXPost("https://x.com/jack/status/20")).resolves.toEqual(
      JACK_OEMBED_READ,
    );
  });

  it("reads a photo post's photo as the hero and drops its media link", async () => {
    serveX({ status: 200, body: photoSyndication }, { status: 500 });
    const photo = "https://pbs.twimg.com/media/BhxWutnCEAAtEQ6.jpg?name=large";
    await expect(
      fetchXPost("https://x.com/TheEllenShow/status/440322224407314432"),
    ).resolves.toEqual({
      title: "If only Bradley's arm was longer. Best photo ever. #oscars",
      siteName: "X",
      author: "@TheEllenShow",
      content: "If only Bradley's arm was longer. Best photo ever. #oscars",
      heroImageUrl: photo,
      heroAspectRatio: 1920 / 1080,
      media: [{ kind: "photo", imageUrl: photo, aspectRatio: 1920 / 1080 }],
    });
  });

  it("keeps the media of a post X marks sensitive off the card", async () => {
    serveX(
      { status: 200, body: { ...photoSyndication, possibly_sensitive: true } },
      { status: 500 },
    );
    await expect(
      fetchXPost("https://x.com/TheEllenShow/status/440322224407314432"),
    ).resolves.toEqual({
      title: "If only Bradley's arm was longer. Best photo ever. #oscars",
      siteName: "X",
      author: "@TheEllenShow",
      content: "If only Bradley's arm was longer. Best photo ever. #oscars",
    });
  });

  it("keeps every photo of a multi-photo post in order", async () => {
    serveX({ status: 200, body: photosSyndication }, { status: 500 });
    const read = await fetchXPost(
      "https://x.com/maruyo_/status/1521844593804906496",
    );
    expect(read.content).toBe("GWなので再放送です☺\n #スーパーカブ");
    expect(read.heroImageUrl).toBe(
      "https://pbs.twimg.com/media/FRu0eYvVgAA83Et.jpg?name=large",
    );
    expect(read.heroAspectRatio).toBe(1200 / 1103);
    expect(read.media).toEqual([
      {
        kind: "photo",
        imageUrl: "https://pbs.twimg.com/media/FRu0eYvVgAA83Et.jpg?name=large",
        aspectRatio: 1200 / 1103,
      },
      {
        kind: "photo",
        imageUrl: "https://pbs.twimg.com/media/FRu0eYwVEAAso2d.jpg?name=large",
        aspectRatio: 1200 / 862,
      },
      {
        kind: "photo",
        imageUrl: "https://pbs.twimg.com/media/FRu0eY2UUAE54PD.jpg?name=large",
        aspectRatio: 1200 / 1029,
      },
      {
        kind: "photo",
        imageUrl: "https://pbs.twimg.com/media/FRu0eY9VcAEZluY.jpg?name=large",
        aspectRatio: 1200 / 977,
      },
    ]);
  });

  it("uses a video's poster and shape as the hero", async () => {
    serveX({ status: 200, body: videoSyndication }, { status: 500 });
    const poster =
      "https://pbs.twimg.com/ext_tw_video_thumb/859073467769126913/pu/img/VKHGdXPsqKASBTvm.jpg?name=large";
    await expect(
      fetchXPost("https://x.com/CincinnatiZoo/status/859073537713328129"),
    ).resolves.toMatchObject({
      author: "@CincinnatiZoo",
      content:
        "Fiona loves playing in the hose water just like her parents! 💦 #TeamFiona #fionafix",
      heroImageUrl: poster,
      heroAspectRatio: 1280 / 720,
      media: [{ kind: "video", imageUrl: poster, aspectRatio: 1280 / 720 }],
    });
  });

  it("marks an animated GIF apart from a video", async () => {
    serveX({ status: 200, body: gifSyndication }, { status: 500 });
    await expect(
      fetchXPost("https://x.com/Kekeflipnote/status/1241038667898118144"),
    ).resolves.toMatchObject({
      content: "Quarantine + online",
      heroAspectRatio: 320 / 240,
      media: [
        {
          kind: "gif",
          imageUrl:
            "https://pbs.twimg.com/tweet_video_thumb/ETkN_L3X0AMy1aT.jpg?name=large",
          aspectRatio: 320 / 240,
        },
      ],
    });
  });

  it("marks a truncated long post and keeps its portrait video shape", async () => {
    serveX({ status: 200, body: longVideoSyndication }, { status: 500 });
    const read = await fetchXPost(
      "https://x.com/levelsio/status/2021693766793318833",
    );
    expect(read.content).toBe(
      "🇧🇷 New Brazilian buffet tour\n\nThis one is interesting because it's inside a church\n\nBrazil (like South America) is VERY religious, 87% of the population is Christian\n\nCompare that to the Netherlands, where I'm from, where it's now just 30%, and similar for large parts of Europe,…",
    );
    expect(read.title).toBe(
      "🇧🇷 New Brazilian buffet tour\n\nThis one is interesting because it's inside a church\n\nBrazil (like Sou",
    );
    expect(read.heroAspectRatio).toBe(1080 / 1920);
    expect(read.media?.map((m) => m.kind)).toEqual(["video"]);
  });

  it("reads a media-only post as its media with no text", async () => {
    serveX({ status: 200, body: mediaOnlySyndication }, { status: 500 });
    const poster =
      "https://pbs.twimg.com/tweet_video_thumb/EWHWVrmVcAAp4Vw.jpg?name=large";
    await expect(
      fetchXPost("https://x.com/Nazoani_museum/status/1252517866059907073"),
    ).resolves.toEqual({
      siteName: "X",
      author: "@Nazoani_museum",
      heroImageUrl: poster,
      heroAspectRatio: 1,
      media: [{ kind: "gif", imageUrl: poster, aspectRatio: 1 }],
    });
  });

  it("decodes the entities X escapes in post text", async () => {
    serveX({ status: 200, body: escapedSyndication }, { status: 500 });
    await expect(
      fetchXPost("https://x.com/takobe_t/status/1777662729890730410"),
    ).resolves.toMatchObject({
      content: "ロザリンデ&エルトリンデ\n#ユニコーンオーバーロード",
    });
  });

  it.each([
    ["a deleted post's tombstone", { status: 200, body: tombstoneSyndication }],
    ["an empty body", { status: 200, body: {} }],
    ["a server error", { status: 503 }],
    ["a missing post", { status: 404 }],
  ])("falls back to oEmbed on %s", async (_label, syndication) => {
    serveX(syndication, { status: 200, body: oembedText });
    await expect(fetchXPost("https://x.com/jack/status/20")).resolves.toEqual(
      JACK_OEMBED_READ,
    );
  });

  it("keeps a post oEmbed reports gone as gone", async () => {
    serveX({ status: 404 }, { status: 404 });
    await expect(
      fetchXPost("https://x.com/nasa/status/1999999999999999999"),
    ).rejects.toMatchObject({ code: "http_error", status: 404 });
  });

  it("asks the syndication CDN for the post id with a derived token", async () => {
    serveX({ status: 200, body: textSyndication }, { status: 500 });
    await fetchXPost("https://twitter.com/jack/status/20?s=21");
    expect(safeFetch.mock.calls[0][0]).toBe(
      "https://cdn.syndication.twimg.com/tweet-result?id=20&token=6dq1a2xwd93",
    );
  });
});

const ARTICLE_URL = "https://x.com/adamtwtz/status/2097073557868056925";
const ARTICLE_PREVIEW =
  "An app spent $21,418, generated 23.1M views and scaled from $2k -> $25k mrr within 4 months on Content Rewards.\nit's a GLP-1 tracking app, and they've been running one campaign since April.\nthe…";

function withArticleContent(content: unknown, mediaEntities: unknown[] = []) {
  return {
    ...fxArticle,
    status: {
      ...fxArticle.status,
      article: {
        ...fxArticle.status.article,
        content,
        media_entities: mediaEntities,
      },
    },
  };
}

const VIDEO_ARTICLE_URL =
  "https://x.com/jasonzhou1993/status/2099837130927427989?s=20";

function mediaBlock(key: number) {
  return {
    type: "atomic",
    text: " ",
    entityRanges: [{ key, offset: 0, length: 1 }],
  };
}

function mediaEntity(key: number, mediaId: string) {
  return {
    key: String(key),
    value: {
      type: "MEDIA",
      mutability: "Immutable",
      data: { mediaItems: [{ mediaId, mediaCategory: "DraftTweetImage" }] },
    },
  };
}

const PHOTO_ENTITY = {
  media_id: "1",
  media_info: {
    __typename: "ApiImage",
    original_img_url: "https://pbs.twimg.com/media/photo.jpg",
    original_img_width: 2000,
    original_img_height: 1000,
  },
};

const VIDEO_ENTITY = {
  media_id: "2",
  media_info: {
    __typename: "ApiVideo",
    preview_image: {
      original_img_url:
        "https://pbs.twimg.com/amplify_video_thumb/2/img/poster.jpg",
      original_img_width: 720,
      original_img_height: 1280,
    },
  },
};

describe("fetchXPost for an Article's full body", () => {
  let warn: MockInstance<typeof console.warn>;

  beforeEach(async () => {
    safeFetch.mockReset();
    parseJson.mockReset();
    const actual =
      await vi.importActual<typeof import("./model/safeFetch")>(
        "./model/safeFetch",
      );
    parseJson.mockImplementation(actual.parseJson);
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  function loggedEvents() {
    return warn.mock.calls.map(([line]: unknown[]) => {
      const fields = JSON.parse(String(line));
      return { event: fields.event, error_category: fields.error_category };
    });
  }

  it("stores every text block of the Article as a paragraph", async () => {
    serveX(
      { status: 200, body: articleSyndication },
      { status: 500 },
      { status: 200, body: fxArticle },
    );
    const read = await fetchXPost(ARTICLE_URL);
    expect(read).toMatchObject({
      title: "How this GLP-1 app generated 20m+ views",
      siteName: "X",
      author: "@adamtwtz",
      heroImageUrl:
        "https://pbs.twimg.com/media/HRpC3HfbAAARTL7.jpg?name=large",
      heroAspectRatio: 2.5,
    });
    expect(read).not.toHaveProperty("media");
    const paragraphs = read.content?.split("\n\n");
    expect(paragraphs).toHaveLength(60);
    expect(paragraphs?.slice(0, 6)).toEqual([
      "An app spent $21,418, generated 23.1M views and scaled from $2k -> $25k mrr within 4 months on Content Rewards.",
      "it's a GLP-1 tracking app, and they've been running one campaign since April.",
      "the content is faceless AI slideshows posted on tiktok, and they are running with an effective CPM of $0.91",
      "here's exactly how the whole campaign worked",
      "why GLP-1 apps can't run ads",
      "running ads is already a stupid option on its own, due to the crazy high cpms and low af conversion rates",
    ]);
    expect(paragraphs).toContain(
      '"For weight loss products that require prescription, please refer to Drugs and Pharmaceuticals ads policy and comply with the geo-targeting, and written permission requirements."',
    );
    expect(paragraphs?.at(-1)).toBe(
      "Book a call (https://cal.com/team/content-rewards/discovery-call?a=glp)",
    );
    expect(read.content).not.toMatch(/\n{3,}| \n|\n /);
    expect(loggedEvents()).toEqual([]);
  });

  it("places an Article's images and videos between its paragraphs", async () => {
    serveX(
      { status: 200, body: videoArticleSyndication },
      { status: 500 },
      { status: 200, body: fxVideoArticle },
    );
    const read = await fetchXPost(VIDEO_ARTICLE_URL);
    expect(read).not.toHaveProperty("media");
    expect(read.content?.split("\n\n")).toHaveLength(66);
    expect(read.articleMedia?.map((m) => `${m.paragraph}:${m.kind}`)).toEqual([
      "0:video",
      "2:photo",
      "7:video",
      "12:photo",
      "17:photo",
      "21:photo",
      "22:photo",
      "26:photo",
      "27:photo",
      "30:photo",
      "40:photo",
      "41:photo",
      "56:photo",
    ]);
    expect(read.articleMedia?.slice(1, 3)).toEqual([
      {
        paragraph: 2,
        kind: "photo",
        imageUrl: "https://pbs.twimg.com/media/HSO3PBTa0AAFXp6.jpg?name=large",
        aspectRatio: 2452 / 1334,
      },
      {
        paragraph: 7,
        kind: "video",
        imageUrl:
          "https://pbs.twimg.com/amplify_video_thumb/2099726256006918145/img/a-PSxh1BV--3EMR3.jpg?name=large",
        aspectRatio: 720 / 1280,
      },
    ]);
    expect(loggedEvents()).toEqual([]);
  });

  it("skips Article media it cannot read and keeps the rest in place", async () => {
    serveX(
      { status: 200, body: articleSyndication },
      { status: 500 },
      {
        status: 200,
        body: withArticleContent(
          {
            blocks: [
              mediaBlock(0),
              { type: "unstyled", text: "One", entityRanges: [] },
              mediaBlock(1),
              mediaBlock(2),
              { type: "unstyled", text: "Two", entityRanges: [] },
              mediaBlock(3),
            ],
            entityMap: [
              mediaEntity(0, "1"),
              mediaEntity(1, "missing"),
              mediaEntity(2, "2"),
              mediaEntity(3, "3"),
            ],
          },
          [
            PHOTO_ENTITY,
            VIDEO_ENTITY,
            { media_id: "3", media_info: { __typename: "ApiAudio" } },
          ],
        ),
      },
    );
    const read = await fetchXPost(ARTICLE_URL);
    expect(read.content).toBe("One\n\nTwo");
    expect(read.articleMedia).toEqual([
      {
        paragraph: 0,
        kind: "photo",
        imageUrl: "https://pbs.twimg.com/media/photo.jpg?name=large",
        aspectRatio: 2,
      },
      {
        paragraph: 1,
        kind: "video",
        imageUrl:
          "https://pbs.twimg.com/amplify_video_thumb/2/img/poster.jpg?name=large",
        aspectRatio: 0.5625,
      },
    ]);
  });

  it("keeps the body when an Article's media reference is malformed", async () => {
    serveX(
      { status: 200, body: articleSyndication },
      { status: 500 },
      {
        status: 200,
        body: withArticleContent(
          {
            blocks: [
              mediaBlock(0),
              { type: "unstyled", text: "One", entityRanges: [] },
              mediaBlock(1),
            ],
            entityMap: [
              {
                key: "0",
                value: { type: "MEDIA", data: { mediaItems: "broken" } },
              },
              mediaEntity(1, "1"),
            ],
          },
          [PHOTO_ENTITY],
        ),
      },
    );
    const read = await fetchXPost(ARTICLE_URL);
    expect(read.content).toBe("One");
    expect(read.articleMedia?.map((m) => `${m.paragraph}:${m.kind}`)).toEqual([
      "1:photo",
    ]);
  });

  it("does not repeat a cover that opens the Article", async () => {
    const cover = articleSyndication.article.cover_media.media_info;
    serveX(
      { status: 200, body: articleSyndication },
      { status: 500 },
      {
        status: 200,
        body: withArticleContent(
          {
            blocks: [
              mediaBlock(0),
              { type: "unstyled", text: "One", entityRanges: [] },
              mediaBlock(1),
            ],
            entityMap: [mediaEntity(0, "9"), mediaEntity(1, "9")],
          },
          [{ media_id: "9", media_info: { ...cover, __typename: "ApiImage" } }],
        ),
      },
    );
    const read = await fetchXPost(ARTICLE_URL);
    expect(read.heroImageUrl).toBe(
      "https://pbs.twimg.com/media/HRpC3HfbAAARTL7.jpg?name=large",
    );
    expect(read.articleMedia).toEqual([
      {
        paragraph: 1,
        kind: "photo",
        imageUrl: "https://pbs.twimg.com/media/HRpC3HfbAAARTL7.jpg?name=large",
        aspectRatio: 2.5,
      },
    ]);
  });

  it("drops media after the part of a long Article it cannot store", async () => {
    serveX(
      { status: 200, body: articleSyndication },
      { status: 500 },
      {
        status: 200,
        body: withArticleContent(
          {
            blocks: [
              { type: "unstyled", text: "a".repeat(60_000), entityRanges: [] },
              mediaBlock(0),
              { type: "unstyled", text: "b".repeat(60_000), entityRanges: [] },
              mediaBlock(1),
            ],
            entityMap: [mediaEntity(0, "1"), mediaEntity(1, "2")],
          },
          [PHOTO_ENTITY, VIDEO_ENTITY],
        ),
      },
    );
    const read = await fetchXPost(ARTICLE_URL);
    expect(read.content?.length).toBe(100_000);
    expect(read.articleMedia?.map((m) => `${m.paragraph}:${m.kind}`)).toEqual([
      "1:photo",
    ]);
  });

  it("leaves out articleMedia when an Article has none", async () => {
    serveX(
      { status: 200, body: articleSyndication },
      { status: 500 },
      {
        status: 200,
        body: withArticleContent({
          blocks: [{ type: "unstyled", text: "Only words", entityRanges: [] }],
          entityMap: [],
        }),
      },
    );
    const read = await fetchXPost(ARTICLE_URL);
    expect(read.content).toBe("Only words");
    expect(read).not.toHaveProperty("articleMedia");
  });

  it("marks list items and leaves links to X profiles as plain text", async () => {
    serveX(
      { status: 200, body: listArticleSyndication },
      { status: 500 },
      { status: 200, body: fxListArticle },
    );
    const read = await fetchXPost(
      "https://x.com/pauldix/status/2006423514446749965",
    );
    const paragraphs = read.content?.split("\n\n") ?? [];
    expect(paragraphs).toHaveLength(28);
    expect(paragraphs.slice(12, 20)).toEqual([
      "How to think about software development in 2026",
      expect.stringMatching(/^Organizations that update their processes/),
      "- review bandwidth / ownership",
      "- testing and validation",
      "- release/rollback confidence",
      "- security/compliance gates",
      "- product decision latency (what to build next)",
      expect.stringMatching(/^The software delivery process should be updated/),
    ]);
  });

  it("numbers ordered lists and restarts the count after other blocks", async () => {
    serveX(
      { status: 200, body: articleSyndication },
      { status: 500 },
      {
        status: 200,
        body: withArticleContent({
          blocks: [
            {
              type: "ordered-list-item",
              text: "Pick a niche",
              entityRanges: [],
            },
            {
              type: "ordered-list-item",
              text: "Write a brief",
              entityRanges: [],
            },
            { type: "header-two", text: "Next", entityRanges: [] },
            { type: "ordered-list-item", text: "Fund it", entityRanges: [] },
          ],
          entityMap: [],
        }),
      },
    );
    const read = await fetchXPost(ARTICLE_URL);
    expect(read.content).toBe(
      "1. Pick a niche\n\n2. Write a brief\n\nNext\n\n1. Fund it",
    );
  });

  it("keeps the count across empty items and images in an ordered list", async () => {
    serveX(
      { status: 200, body: articleSyndication },
      { status: 500 },
      {
        status: 200,
        body: withArticleContent({
          blocks: [
            { type: "ordered-list-item", text: " ", entityRanges: [] },
            {
              type: "ordered-list-item",
              text: "Pick a niche",
              entityRanges: [],
            },
            { type: "atomic", text: " ", entityRanges: [] },
            {
              type: "ordered-list-item",
              text: "Write a brief",
              entityRanges: [],
            },
          ],
          entityMap: [],
        }),
      },
    );
    const read = await fetchXPost(ARTICLE_URL);
    expect(read.content).toBe("1. Pick a niche\n\n2. Write a brief");
  });

  it("places a link after its text when emoji come before it", async () => {
    serveX(
      { status: 200, body: articleSyndication },
      { status: 500 },
      {
        status: 200,
        body: withArticleContent({
          blocks: [
            {
              type: "unstyled",
              text: "🚀😆 read HERE and follow @nasa",
              entityRanges: [
                { key: 0, offset: 8, length: 4 },
                { key: 1, offset: 24, length: 5 },
                { key: 2, offset: 0, length: 1 },
              ],
            },
          ],
          entityMap: [
            {
              key: "0",
              value: {
                type: "LINK",
                mutability: "Mutable",
                data: { url: "https://example.com/guide" },
              },
            },
            {
              key: "1",
              value: {
                type: "LINK",
                mutability: "Mutable",
                data: { url: "https://x.com/nasa" },
              },
            },
            {
              key: "2",
              value: {
                type: "TWEMOJI",
                mutability: "Immutable",
                data: {
                  url: "https://abs-0.twimg.com/emoji/v2/svg/1f680.svg",
                },
              },
            },
          ],
        }),
      },
    );
    const read = await fetchXPost(ARTICLE_URL);
    expect(read.content).toBe(
      "🚀😆 read HERE (https://example.com/guide) and follow @nasa",
    );
  });

  it("asks fxtwitter for the post id only, as Shelvr, with a short deadline", async () => {
    serveX(
      { status: 200, body: articleSyndication },
      { status: 500 },
      { status: 200, body: fxArticle },
    );
    await fetchXPost(
      "https://twitter.com/adamtwtz/status/2097073557868056925?s=46&t=abc",
    );
    expect(fxtwitterCalls()).toEqual([
      [
        "https://api.fxtwitter.com/2/status/2097073557868056925",
        expect.objectContaining({
          timeoutMs: 5000,
          maxRedirects: 0,
          headers: {
            "User-Agent": "Shelvr/1.0 (+https://shelvr.app)",
            Accept: "application/json",
          },
        }),
      ],
    ]);
  });

  it.each([
    ["a timeout", { error: "timeout" }, "fetch:timeout"],
    ["a network error", { error: "fetch_failed" }, "fetch:fetch_failed"],
    ["a rate limit", { status: 429 }, "fetch:http_error:429"],
    ["a missing post", { status: 404 }, "fetch:http_error:404"],
    ["malformed JSON", { status: 200, raw: "<html>oops" }, "unreadable_json"],
    [
      "an unexpected shape",
      {
        status: 200,
        body: { code: 200, status: { id: "2097073557868056925" } },
      },
      "schema_mismatch",
    ],
    [
      "another post's body",
      {
        status: 200,
        body: { ...fxArticle, status: { ...fxArticle.status, id: "20" } },
      },
      "id_mismatch",
    ],
    [
      "an Article with no content blocks",
      { status: 200, body: withArticleContent({ blocks: [], entityMap: [] }) },
      "empty_body",
    ],
    [
      "an Article with only images and dividers",
      {
        status: 200,
        body: withArticleContent({
          blocks: [
            {
              type: "atomic",
              text: " ",
              entityRanges: [{ key: 0, offset: 0, length: 1 }],
            },
            { type: "unstyled", text: "  ", entityRanges: [] },
          ],
          entityMap: [
            {
              key: "0",
              value: { type: "DIVIDER", mutability: "Immutable", data: {} },
            },
          ],
        }),
      },
      "empty_body",
    ],
  ] as const)(
    "keeps the syndication preview on %s",
    async (_label, fxtwitter, category) => {
      serveX(
        { status: 200, body: articleSyndication },
        { status: 500 },
        fxtwitter,
      );
      await expect(fetchXPost(ARTICLE_URL)).resolves.toEqual({
        title: "How this GLP-1 app generated 20m+ views",
        siteName: "X",
        author: "@adamtwtz",
        content: ARTICLE_PREVIEW,
        heroImageUrl:
          "https://pbs.twimg.com/media/HRpC3HfbAAARTL7.jpg?name=large",
        heroAspectRatio: 2.5,
      });
      expect(loggedEvents()).toEqual([
        { event: "x_article_body_fallback", error_category: category },
      ]);
    },
  );

  it.each([
    ["a text post", "https://x.com/jack/status/20", textSyndication],
    [
      "a photo post",
      "https://x.com/TheEllenShow/status/440322224407314432",
      photoSyndication,
    ],
    [
      "a video post",
      "https://x.com/CincinnatiZoo/status/859073537713328129",
      videoSyndication,
    ],
    [
      "a truncated long post",
      "https://x.com/levelsio/status/2021693766793318833",
      longVideoSyndication,
    ],
  ])("never asks fxtwitter about %s", async (_label, url, syndication) => {
    serveX(
      { status: 200, body: syndication },
      { status: 500 },
      { status: 200, body: fxArticle },
    );
    await fetchXPost(url);
    expect(fxtwitterCalls()).toEqual([]);
  });

  it("never asks fxtwitter when syndication fails and oEmbed answers", async () => {
    serveX(
      { status: 503 },
      { status: 200, body: oembedText },
      { status: 200, body: fxArticle },
    );
    await fetchXPost("https://x.com/jack/status/20");
    expect(fxtwitterCalls()).toEqual([]);
  });
});

describe("processItem for X posts", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    safeFetch.mockReset();
    parseJson.mockReset();
    const actual =
      await vi.importActual<typeof import("./model/safeFetch")>(
        "./model/safeFetch",
      );
    parseJson.mockImplementation(actual.parseJson);
    generateObject.mockReset();
    generateObject.mockResolvedValue({
      object: {
        title: "GLP-1 App Growth",
        description: "How a GLP-1 app scaled on Content Rewards.",
        tags: ["growth"],
        spaceNames: [],
        intents: [],
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function saveLink(
    url: string,
    fields: { media?: PostMedia[]; articleMedia?: ArticleMedia[] } = {},
  ) {
    const t = newConvexTest().withIdentity({ subject: "x-user|session-1" });
    const itemId = await t.run((ctx) =>
      ctx.db.insert("items", {
        userId: "x-user",
        type: "link",
        url,
        status: "processing",
        processingRunId: "run-1",
        processingStartedAt: Date.now(),
        tags: [],
        searchText: "",
        ...fields,
      }),
    );
    await t.action(internal.ai.processItem, { itemId, runId: "run-1" });
    const cards = await t.query(api.items.listItemsPage, {
      paginationOpts: { numItems: 1, cursor: null },
    });
    return {
      item: await t.query(api.items.getItem, { id: itemId }),
      card: cards.page[0],
    };
  }

  it("saves an Article's images and videos for the reader but not the feed card", async () => {
    serveX(
      { status: 200, body: videoArticleSyndication },
      { status: 500 },
      { status: 200, body: fxVideoArticle },
    );
    const { item, card } = await saveLink(VIDEO_ARTICLE_URL);
    expect(item).toMatchObject({ status: "ready", author: "@jasonzhou1993" });
    expect(item).not.toHaveProperty("media");
    expect(item?.articleMedia).toHaveLength(13);
    expect(item?.articleMedia?.[0]).toEqual({
      paragraph: 0,
      kind: "video",
      imageUrl:
        "https://pbs.twimg.com/amplify_video_thumb/2099832515431407616/img/Wp1ZhlvD-TyQAPiJ.jpg?name=large",
      aspectRatio: 1920 / 1080,
    });
    expect(card?._id).toBe(item?._id);
    expect(card).not.toHaveProperty("articleMedia");
    expect(card).not.toHaveProperty("content");
  });

  it("clears Article media a retry could not read again", async () => {
    serveX({ status: 200, body: videoArticleSyndication }, { status: 500 });
    const { item } = await saveLink(VIDEO_ARTICLE_URL, {
      articleMedia: [
        {
          paragraph: 0,
          kind: "photo",
          imageUrl: "https://pbs.twimg.com/media/stale.jpg?name=large",
          aspectRatio: 1,
        },
      ],
    });
    expect(item?.status).toBe("ready");
    expect(item).not.toHaveProperty("articleMedia");
  });

  it("saves an Article post with its opening text and cover, classified from its title", async () => {
    serveX({ status: 200, body: articleSyndication }, { status: 500 });
    const { item } = await saveLink(
      "https://x.com/adamtwtz/status/2097073557868056925",
    );
    expect(item).toMatchObject({
      status: "ready",
      title: "GLP-1 App Growth",
      siteName: "X",
      author: "@adamtwtz",
      heroImageUrl:
        "https://pbs.twimg.com/media/HRpC3HfbAAARTL7.jpg?name=large",
      aspectRatio: 2.5,
      imageUrl: null,
    });
    expect(item?.content).toMatch(/^An app spent \$21,418/);
    expect(item?.enrichment).toBeUndefined();
    expect(item).not.toHaveProperty("media");
    expect(generateObject.mock.calls[0][0].prompt).toContain(
      "Page title: How this GLP-1 app generated 20m+ views",
    );
  });

  it("saves an Article's full body and classifies from its opening", async () => {
    serveX(
      { status: 200, body: articleSyndication },
      { status: 500 },
      { status: 200, body: fxArticle },
    );
    const { item } = await saveLink(ARTICLE_URL);
    expect(item).toMatchObject({
      status: "ready",
      title: "GLP-1 App Growth",
      siteName: "X",
      author: "@adamtwtz",
      heroImageUrl:
        "https://pbs.twimg.com/media/HRpC3HfbAAARTL7.jpg?name=large",
      aspectRatio: 2.5,
    });
    expect(item?.enrichment).toBeUndefined();
    expect(item).not.toHaveProperty("media");
    expect(item?.content?.split("\n\n")).toHaveLength(60);
    expect(item?.content).toContain("\n\nthe numbers so far\n\n");
    expect(
      item?.content?.endsWith(
        "Book a call (https://cal.com/team/content-rewards/discovery-call?a=glp)",
      ),
    ).toBe(true);
    const prompt: string = generateObject.mock.calls[0][0].prompt;
    expect(prompt).toContain(
      "Page title: How this GLP-1 app generated 20m+ views",
    );
    expect(prompt).toContain(
      "Page content:\nAn app spent $21,418, generated 23.1M views",
    );
    expect(prompt).toContain("\n\nwhy GLP-1 apps can't run ads\n\n");
  });

  it("saves every photo of a multi-photo post and serves them to the client", async () => {
    serveX({ status: 200, body: photosSyndication }, { status: 500 });
    const { item } = await saveLink(
      "https://x.com/maruyo_/status/1521844593804906496",
    );
    expect(item?.heroImageUrl).toBe(
      "https://pbs.twimg.com/media/FRu0eYvVgAA83Et.jpg?name=large",
    );
    expect(item?.aspectRatio).toBe(1200 / 1103);
    expect(item?.media?.map((m) => [m.kind, m.imageUrl])).toEqual([
      ["photo", "https://pbs.twimg.com/media/FRu0eYvVgAA83Et.jpg?name=large"],
      ["photo", "https://pbs.twimg.com/media/FRu0eYwVEAAso2d.jpg?name=large"],
      ["photo", "https://pbs.twimg.com/media/FRu0eY2UUAE54PD.jpg?name=large"],
      ["photo", "https://pbs.twimg.com/media/FRu0eY9VcAEZluY.jpg?name=large"],
    ]);
  });

  it("still saves a TikTok from oEmbed with its poster copied to storage", async () => {
    const poster = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    safeFetch.mockImplementation(async (url: string) =>
      url.startsWith("https://www.tiktok.com/oembed?")
        ? {
            ok: true,
            finalUrl: url,
            status: 200,
            contentType: "application/json",
            bytes: new TextEncoder().encode(
              JSON.stringify({
                title: "Scramble up ur name & I’ll try to guess it😍❤️",
                author_name: "Scout, Suki & Stella",
                author_unique_id: "scout2015",
                thumbnail_url: "https://p16-sign-va.tiktokcdn.com/poster.jpeg",
                thumbnail_width: 720,
                thumbnail_height: 1280,
              }),
            ),
          }
        : url === "https://p16-sign-va.tiktokcdn.com/poster.jpeg"
          ? {
              ok: true,
              finalUrl: url,
              status: 200,
              contentType: "image/jpeg",
              bytes: poster,
            }
          : { ok: false, code: "http_error", status: 599 },
    );
    const { item } = await saveLink(
      "https://www.tiktok.com/@scout2015/video/6718335390845095173",
    );
    expect(item).toMatchObject({
      siteName: "TikTok",
      author: "@scout2015",
      content: "Scramble up ur name & I’ll try to guess it😍❤️",
      heroImageUrl: "https://p16-sign-va.tiktokcdn.com/poster.jpeg",
      aspectRatio: 720 / 1280,
    });
    expect(item).not.toHaveProperty("media");
    expect(item?.imageUrl).toEqual(expect.stringContaining("/api/storage/"));
  });

  it("clears media a retried post no longer has", async () => {
    serveX({ status: 200, body: textSyndication }, { status: 500 });
    const { item } = await saveLink("https://x.com/jack/status/20", {
      media: [
        {
          kind: "photo",
          imageUrl: "https://pbs.twimg.com/media/stale.jpg?name=large",
          aspectRatio: 1,
        },
      ],
    });
    expect(item).toMatchObject({
      content: "just setting up my twttr",
      author: "@jack",
    });
    expect(item).not.toHaveProperty("media");
    expect(item).not.toHaveProperty("heroImageUrl");
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

  it("flags a page with an empty media list as no_article", () => {
    expect(linkEnrichment({ status: "ok", page: { media: [] } })).toBe(
      "no_article",
    );
  });

  it("flags a post read as media alone as enriched (undefined)", () => {
    expect(
      linkEnrichment({
        status: "ok",
        page: {
          media: [
            {
              kind: "photo",
              imageUrl: "https://pbs.twimg.com/a",
              aspectRatio: 1,
            },
          ],
        },
      }),
    ).toBeUndefined();
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
