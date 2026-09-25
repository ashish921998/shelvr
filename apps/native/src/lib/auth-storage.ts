import type { TokenStorage } from "@convex-dev/auth/react";
import * as SecureStore from "expo-secure-store";
import { readConvexUrl } from "@/lib/convex-url";

// Convex Auth persists its JWT + refresh token client-side. In React Native we
// must supply the storage ourselves — wrap Keychain-backed expo-secure-store
// behind the awaitable TokenStorage interface the provider expects. Scope the
// keys to the Convex deployment so a development refresh token can never be
// presented to production (or leave auth initialization stuck while testing).
const authStorageNamespace = readConvexUrl().replace(/[^A-Za-z0-9._-]/g, "_");
const authStorageKey = (key: string) => `${authStorageNamespace}_${key}`;

export const authStorage: TokenStorage = {
  getItem: (key) => SecureStore.getItemAsync(authStorageKey(key)),
  setItem: (key, value) => SecureStore.setItemAsync(authStorageKey(key), value),
  removeItem: (key) => SecureStore.deleteItemAsync(authStorageKey(key)),
};
