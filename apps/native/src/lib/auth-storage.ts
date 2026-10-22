import type { TokenStorage } from "@convex-dev/auth/react";
import * as SecureStore from "expo-secure-store";
import { readConvexUrl } from "@/lib/convex-url";

const authStorageNamespace = readConvexUrl().replace(/[^A-Za-z0-9._-]/g, "_");
const authStorageKey = (key: string) => `${authStorageNamespace}_${key}`;

export const authStorage: TokenStorage = {
  getItem: (key) => SecureStore.getItemAsync(authStorageKey(key)),
  setItem: (key, value) => SecureStore.setItemAsync(authStorageKey(key), value),
  removeItem: (key) => SecureStore.deleteItemAsync(authStorageKey(key)),
};
