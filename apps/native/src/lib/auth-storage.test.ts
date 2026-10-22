import { describe, expect, it, vi } from "vitest";

import { authStorage, forgetStoredSession } from "./auth-storage";

const { CONVEX_URL, store } = vi.hoisted(() => ({
  CONVEX_URL: "https://happy-otter-123.convex.cloud",
  store: new Map<string, string>(),
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => store.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    store.set(key, value);
  },
  setItem: (key: string, value: string) => store.set(key, value),
  deleteItemAsync: async (key: string) => {
    store.delete(key);
  },
}));
vi.mock("@/lib/convex-url", () => ({ readConvexUrl: () => CONVEX_URL }));

describe("forgetStoredSession", () => {
  it("leaves Convex Auth with no session to read", async () => {
    // Convex Auth's key for each value: `${key}_${namespace}`, the namespace
    // being the deployment URL with every non-alphanumeric character dropped.
    const namespace = CONVEX_URL.replace(/[^a-zA-Z0-9]/g, "");
    const keys = [
      "__convexAuthJWT",
      "__convexAuthRefreshToken",
      "__convexAuthOAuthVerifier",
      "__convexAuthServerStateFetchTime",
    ].map((key) => `${key}_${namespace}`);
    for (const key of keys) await authStorage.setItem(key, "value");

    forgetStoredSession();

    for (const key of keys) expect(await authStorage.getItem(key)).toBeNull();
  });
});
