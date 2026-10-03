import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { shareRefOf } from "./share-link";

vi.mock("react-native", () => ({ Platform: { OS: "ios" }, Share: {} }));
vi.mock("convex/react", () => ({ useMutation: vi.fn() }));
vi.mock("@convex/_generated/api", () => ({ api: { items: {} } }));
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
