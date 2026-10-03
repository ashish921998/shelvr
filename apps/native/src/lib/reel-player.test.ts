import { describe, expect, it, vi } from "vitest";

import {
  readReelPlayerMessage,
  redirectsToReel,
  reelEmbedUrl,
  resolveReelEmbedUrl,
} from "./reel-player";

describe("reelEmbedUrl", () => {
  it("plays a full TikTok video link in TikTok's player", () => {
    const uri = reelEmbedUrl(
      "https://www.tiktok.com/@nasa/video/7301234567890123456?is_from_webapp=1",
    );
    expect(uri).toMatch(
      /^https:\/\/www\.tiktok\.com\/player\/v1\/7301234567890123456\?/,
    );
    expect(new URL(uri as string).searchParams.get("autoplay")).toBe("1");
  });

  it("plays Instagram reels and IGTV in Instagram's embed page", () => {
    expect(reelEmbedUrl("https://www.instagram.com/reel/C9abc_-12/")).toBe(
      "https://www.instagram.com/reel/C9abc_-12/embed/",
    );
    expect(reelEmbedUrl("https://instagram.com/reels/C9abc12/?igsh=x")).toBe(
      "https://www.instagram.com/reel/C9abc12/embed/",
    );
    expect(reelEmbedUrl("https://www.instagram.com/nasa/reel/C9abc12/")).toBe(
      "https://www.instagram.com/reel/C9abc12/embed/",
    );
    expect(reelEmbedUrl("https://www.instagram.com/tv/C9abc12/")).toBe(
      "https://www.instagram.com/tv/C9abc12/embed/",
    );
  });

  it("has no player for links that name no video", () => {
    expect(reelEmbedUrl("https://vm.tiktok.com/ZMabc123/")).toBeUndefined();
    expect(reelEmbedUrl("https://www.tiktok.com/@nasa")).toBeUndefined();
    expect(
      reelEmbedUrl("https://www.instagram.com/share/reel/BAabc123/"),
    ).toBeUndefined();
    expect(reelEmbedUrl("https://www.youtube.com/shorts/abc")).toBeUndefined();
    expect(reelEmbedUrl("https://eviltiktok.com/@a/video/1")).toBeUndefined();
    expect(reelEmbedUrl(undefined)).toBeUndefined();
  });
});

describe("redirectsToReel", () => {
  it("follows TikTok short links and Instagram share links only", () => {
    expect(redirectsToReel("https://vm.tiktok.com/ZMabc123/")).toBe(true);
    expect(redirectsToReel("https://www.tiktok.com/t/ZTabc/")).toBe(true);
    expect(
      redirectsToReel("https://www.instagram.com/share/reel/BAabc123/"),
    ).toBe(true);
    expect(redirectsToReel("https://www.instagram.com/reel/C9abc12/")).toBe(
      false,
    );
    expect(redirectsToReel("https://example.com/video")).toBe(false);
    expect(redirectsToReel("https://www.tiktok.com/@nasa")).toBe(false);
    expect(redirectsToReel("https://www.tiktok.com/login")).toBe(false);
  });
});

describe("resolveReelEmbedUrl", () => {
  it("doesn't fetch a link that already names the video", async () => {
    const fetchImpl = vi.fn();
    await expect(
      resolveReelEmbedUrl(
        "https://www.instagram.com/reel/C9abc12/",
        fetchImpl as unknown as typeof fetch,
      ),
    ).resolves.toBe("https://www.instagram.com/reel/C9abc12/embed/");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("plays where a short link lands", async () => {
    const fetchImpl = vi.fn(async () => ({
      url: "https://www.tiktok.com/@nasa/video/7301234567890123456?_r=1",
    }));
    await expect(
      resolveReelEmbedUrl(
        "https://vm.tiktok.com/ZMabc123/",
        fetchImpl as unknown as typeof fetch,
      ),
    ).resolves.toMatch(/\/player\/v1\/7301234567890123456\?/);
  });

  it("gives up when the link lands nowhere playable or fails", async () => {
    const lost = vi.fn(async () => ({ url: "https://www.tiktok.com/login" }));
    await expect(
      resolveReelEmbedUrl(
        "https://vm.tiktok.com/ZMabc123/",
        lost as unknown as typeof fetch,
      ),
    ).resolves.toBeUndefined();
    const offline = vi.fn(async () => {
      throw new TypeError("Network request failed");
    });
    await expect(
      resolveReelEmbedUrl(
        "https://vm.tiktok.com/ZMabc123/",
        offline as unknown as typeof fetch,
      ),
    ).resolves.toBeUndefined();
  });

  it("never fetches other sites", async () => {
    const fetchImpl = vi.fn();
    await expect(
      resolveReelEmbedUrl(
        "https://example.com/v",
        fetchImpl as unknown as typeof fetch,
      ),
    ).resolves.toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("readReelPlayerMessage", () => {
  it("reads the player's own messages and ignores the rest", () => {
    expect(readReelPlayerMessage('{"type":"ready"}')).toBe("ready");
    expect(readReelPlayerMessage('{"type":"open"}')).toBe("open");
    expect(readReelPlayerMessage('{"type":"error"}')).toBe("error");
    expect(readReelPlayerMessage('{"type":"other"}')).toBeUndefined();
    expect(readReelPlayerMessage("not json")).toBeUndefined();
  });
});
