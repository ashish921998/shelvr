// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shareRefOf, useSettleShareLink, useShareLink } from "./share-link";

const mocks = vi.hoisted(() => ({ settle: vi.fn(), captureError: vi.fn() }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" }, Share: {} }));
vi.mock("convex/react", () => ({ useMutation: () => mocks.settle }));
vi.mock("@convex/_generated/api", () => ({ api: { items: {} } }));
vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mocks.captureError },
}));
vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: async (_algorithm: string, value: string) =>
    createHash("sha256").update(value).digest("hex"),
}));

describe("shareRefOf", () => {
  it("matches the web share page's hash of the token", async () => {
    // Same vector as apps/web/src/lib/shareRef.test.ts.
    expect(await shareRefOf("https://shelvr-web.vercel.app/i/abc")).toBe(
      "ba7816bf8f01cfea",
    );
  });

  it("is undefined for a source URL or no link", async () => {
    expect(await shareRefOf("https://example.com/article")).toBeUndefined();
    expect(await shareRefOf(undefined)).toBeUndefined();
  });
});

describe("useSettleShareLink", () => {
  beforeEach(() => {
    mocks.settle.mockReset();
    mocks.captureError.mockReset();
  });

  it("reports a share that went out and one that was dismissed", () => {
    mocks.settle.mockResolvedValue(null);
    const { result } = renderHook(() => useSettleShareLink());
    result.current("item_1", true);
    result.current("item_1", false);
    expect(mocks.settle.mock.calls).toEqual([
      [{ itemId: "item_1", shared: true }],
      [{ itemId: "item_1", shared: false }],
    ]);
  });

  it("reports a failed settle without throwing at the caller", async () => {
    const failure = new Error("offline");
    mocks.settle.mockRejectedValue(failure);
    const { result } = renderHook(() => useSettleShareLink());
    expect(() => result.current("item_1", false)).not.toThrow();
    await vi.waitFor(() =>
      expect(mocks.captureError).toHaveBeenCalledWith(
        "share_link_settle_failed",
        failure,
      ),
    );
  });
});

describe("useShareLink", () => {
  beforeEach(() => {
    mocks.settle.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("takes back a link that was minted too late to be the one shared", async () => {
    let minted: (token: string) => void = () => {};
    mocks.settle
      .mockReturnValueOnce(
        new Promise<string>((resolve) => {
          minted = resolve;
        }),
      )
      .mockResolvedValue(null);
    const { result } = renderHook(() => useShareLink());

    const link = result.current("item_1");
    await vi.advanceTimersByTimeAsync(3000);
    expect(await link).toBeUndefined();
    expect(mocks.settle.mock.calls).toEqual([
      [{ itemId: "item_1", settles: true }],
    ]);

    minted("abc");
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.settle.mock.calls[1]).toEqual([
      { itemId: "item_1", shared: false },
    ]);
  });
});
