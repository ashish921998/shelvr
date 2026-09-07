// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { beforeEach, describe, expect, it, vi } from "vitest";
import { linkEnrichment, storePoster } from "./ai";

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
  // Mirrors the three states readPage can hand finalizeItem for a link:
  // the fetch failed (retryable, classified from the URL alone), the page read
  // but had no article body (terminal — e.g. an oEmbed-only TikTok read), and
  // a fully read article.
  it("flags an unreadable page as partial so the client offers a retry", () => {
    expect(linkEnrichment(true, undefined)).toBe("partial");
  });

  it("flags a readable page without an article body as no_article", () => {
    expect(linkEnrichment(false, {})).toBe("no_article");
  });

  it("flags a fully read page as enriched (undefined)", () => {
    expect(
      linkEnrichment(false, { content: "Extracted article body" }),
    ).toBeUndefined();
  });
});
