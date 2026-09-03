// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { beforeEach, describe, expect, it, vi } from "vitest";
import { storePoster } from "./ai";

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
