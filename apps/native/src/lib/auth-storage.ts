import type { TokenStorage } from "@convex-dev/auth/react";
import * as SecureStore from "expo-secure-store";
import { readConvexUrl } from "@/lib/convex-url";

const authStorageNamespace = readConvexUrl().replace(/[^A-Za-z0-9._-]/g, "_");
const authStorageKey = (key: string) => `${authStorageNamespace}_${key}`;

export const authStorage: TokenStorage = {
  // "" is a cleared value (see forgetStoredSession), never a token.
  getItem: async (key) =>
    (await SecureStore.getItemAsync(authStorageKey(key))) || null,
  setItem: (key, value) => SecureStore.setItemAsync(authStorageKey(key), value),
  removeItem: (key) => SecureStore.deleteItemAsync(authStorageKey(key)),
};

// Convex Auth's own key names: `${key}_${namespace}`, the namespace being the
// deployment URL with every non-alphanumeric character dropped.
const CONVEX_AUTH_KEYS = [
  "__convexAuthJWT",
  "__convexAuthRefreshToken",
  "__convexAuthOAuthVerifier",
  "__convexAuthServerStateFetchTime",
];

/** Signs the device out before Convex Auth reads its tokens. Synchronous, so it must run at boot. */
export function forgetStoredSession(): void {
  const namespace = readConvexUrl().replace(/[^a-zA-Z0-9]/g, "");
  for (const key of CONVEX_AUTH_KEYS) {
    SecureStore.setItem(authStorageKey(`${key}_${namespace}`), "");
  }
}
