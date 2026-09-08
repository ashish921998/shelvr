// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractBodyText, linkEnrichment, storePoster } from "./ai";

const safeFetch = vi.hoisted(() => vi.fn());

vi.mock("./model/safeFetch", () => ({
  decodeWithContentType: vi.fn(),
  isSafeFetchError: vi.fn(),
  parseJson: vi.fn(),
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

describe("linkEnrichment", () => {
  it.each(["article", "main", "div"])("preserves short readable text inside %s", (tag) => {
    const content = extractBodyText(`<html><head><title>Field notes</title></head><body><${tag}><h1>Field notes</h1><p>We walked along the river at dawn. The water was still and the reeds were full of birds.</p><p>By noon the wind had picked up. We returned along the ridge and watched the clouds gather.</p></${tag}></body></html>`, "https://example.com/notes");
    expect(content).toContain("We walked along the river");
    expect(content).toContain("By noon the wind");
    expect(linkEnrichment({ status: "ok", page: { content } })).toBeUndefined();
  });
  it("does not turn page chrome into an article body", () => {
    const content = extractBodyText('<html><head><title>Home</title></head><body><nav>Home About</nav><div class="menu"><a href="/login">Sign in</a><a href="/pricing">Pricing</a></div><div class="cookie-banner">Accept cookies</div><footer>Copyright</footer></body></html>', "https://example.com");
    expect(content).toBeUndefined();
    expect(linkEnrichment({ status: "ok", page: { content } })).toBe("no_article");
  });

  it("preserves readable article text", () => {
    const paragraph = "A reader follows the winding path through the forest, observing the changing leaves and the quiet stream. Each season brings a different landscape, with new plants and animals to discover. ";
    const content = extractBodyText(`<html><head><title>A forest walk</title></head><body><nav>Home</nav><article><h1>A forest walk</h1>${Array.from({ length: 6 }, () => `<p>${paragraph.repeat(3)}</p>`).join("")}</article><footer>Copyright</footer></body></html>`, "https://example.com/article");
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
