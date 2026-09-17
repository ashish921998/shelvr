import { describe, expect, it } from "vitest";

import { socialPost } from "./social-post";

const photo = {
  kind: "photo" as const,
  imageUrl: "https://pbs.twimg.com/a",
  aspectRatio: 1,
};
const video = {
  kind: "video" as const,
  imageUrl: "https://pbs.twimg.com/b",
  aspectRatio: 0.5625,
};
const gif = {
  kind: "gif" as const,
  imageUrl: "https://pbs.twimg.com/c",
  aspectRatio: 1,
};

describe("socialPost", () => {
  it("treats a TikTok link as a video post", () => {
    expect(
      socialPost({
        type: "link",
        url: "https://www.tiktok.com/@nasa/video/1",
        siteName: "TikTok",
      }),
    ).toEqual({ site: "TikTok", playable: true });
  });

  it("treats an Instagram reel as a video post and a /p/ link as a still one", () => {
    expect(
      socialPost({
        type: "link",
        url: "https://www.instagram.com/reel/abc/",
        siteName: "Instagram",
      }),
    ).toEqual({ site: "Instagram", playable: true });
    expect(
      socialPost({
        type: "link",
        url: "https://www.instagram.com/p/abc/",
        siteName: "Instagram",
      }),
    ).toEqual({ site: "Instagram", playable: false });
  });

  it("plays an X post whose first attachment is a video or GIF", () => {
    const url = "https://x.com/nasa/status/1";
    expect(
      socialPost({ type: "link", url, siteName: "X", media: [video, photo] }),
    ).toEqual({
      site: "X",
      playable: true,
    });
    expect(
      socialPost({ type: "link", url, siteName: "X", media: [gif] }),
    ).toEqual({
      site: "X",
      playable: true,
    });
  });

  it("shows an X photo post as a still post", () => {
    expect(
      socialPost({
        type: "link",
        url: "https://x.com/nasa/status/1",
        siteName: "X",
        media: [photo, video],
      }),
    ).toEqual({ site: "X", playable: false });
  });

  it("leaves articles, text-only posts, and non-links to the article layouts", () => {
    expect(
      socialPost({
        type: "link",
        url: "https://x.com/nasa/status/1",
        siteName: "X",
      }),
    ).toBe(undefined);
    expect(
      socialPost({
        type: "link",
        url: "https://example.com/a",
        siteName: "Example",
      }),
    ).toBe(undefined);
    expect(socialPost({ type: "image", media: [photo] })).toBe(undefined);
  });
});
