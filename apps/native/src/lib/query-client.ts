import { ConvexQueryClient } from "@convex-dev/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { ConvexReactClient } from "convex/react";
import { createMMKV } from "react-native-mmkv";
import { readConvexUrl } from "@/lib/convex-url";

export const convex = new ConvexReactClient(readConvexUrl(), {
  unsavedChangesWarning: false,
});

const convexQueryClient = new ConvexQueryClient(convex);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryKeyHashFn: convexQueryClient.hashFn(),
      queryFn: convexQueryClient.queryFn(),
      staleTime: Infinity,
      gcTime: 1000 * 60 * 60 * 24,
    },
  },
});

convexQueryClient.connect(queryClient);

export function restartConvexSubscription(queryHash: string): void {
  const subscription = convexQueryClient.subscriptions[queryHash];
  if (!subscription) return;
  subscription.unsubscribe();
  subscription.unsubscribe = subscription.watch.onUpdate(() => {
    convexQueryClient.onUpdateQueryKeyHash(queryHash);
  });
}

const mmkv = createMMKV({ id: "tanstack-query-cache" });

const clientStorage = {
  setItem: (key: string, value: string) => mmkv.set(key, value),
  getItem: (key: string) => {
    const value = mmkv.getString(key);
    return value === undefined ? null : value;
  },
  removeItem: (key: string) => {
    mmkv.remove(key);
  },
};

export const persister = createSyncStoragePersister({ storage: clientStorage });
