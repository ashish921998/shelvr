import type { TokenStorage } from "@convex-dev/auth/react";
import * as SecureStore from "expo-secure-store";

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;

// Convex Auth persists its JWT + refresh token client-side. In React Native we
// must supply the storage ourselves — wrap Keychain-backed expo-secure-store
// behind the awaitable TokenStorage interface the provider expects. Scope the
// keys to the Convex deployment so a development refresh token can never be
// presented to production (or leave auth initialization stuck while testing).
const authStorageNamespace = (convexUrl ?? "default").replace(
  /[^A-Za-z0-9._-]/g,
  "_",
);
const authStorageKey = (key: string) => `${authStorageNamespace}_${key}`;

export const authStorage: TokenStorage = {
  getItem: (key) => SecureStore.getItemAsync(authStorageKey(key)),
  setItem: (key, value) => SecureStore.setItemAsync(authStorageKey(key), value),
  removeItem: (key) => SecureStore.deleteItemAsync(authStorageKey(key)),
};

// Convex Auth names its refresh token `__convexAuthRefreshToken_<namespace>`,
// where the namespace defaults to the client address with every
// non-alphanumeric character removed.
const refreshTokenKey = authStorageKey(
  `__convexAuthRefreshToken_${(convexUrl ?? "").replace(/[^a-zA-Z0-9]/g, "")}`,
);

/**
 * Whether this device still holds a Convex Auth session, read synchronously so
 * it can run before anything renders. An unreadable keychain counts as a
 * session: the caller only acts on a definite absence.
 */
export function hasStoredAuthSession(): boolean {
  try {
    return SecureStore.getItem(refreshTokenKey) !== null;
  } catch {
    return true;
  }
}
