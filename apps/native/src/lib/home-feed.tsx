import { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useConvexAuth, usePaginatedQuery } from "convex/react";
import { AccountGoneBoundary } from "@/components/account-gone-boundary";
import { createContext, useContext, useMemo, type ReactNode } from "react";

const HOME_FEED_PAGE_SIZE = 40;

type HomeFeedItem = FunctionReturnType<
  typeof api.items.listItemsPage
>["page"][number];

type HomeFeed = {
  items: HomeFeedItem[] | undefined;
  canLoadMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
};

const HomeFeedContext = createContext<HomeFeed | null>(null);

export function HomeFeedProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  return (
    <AccountGoneBoundary signedIn={isAuthenticated}>
      <FeedSubscription>{children}</FeedSubscription>
    </AccountGoneBoundary>
  );
}

function FeedSubscription({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const { results, status, loadMore } = usePaginatedQuery(
    api.items.listItemsPage,
    isAuthenticated ? {} : "skip",
    { initialNumItems: HOME_FEED_PAGE_SIZE },
  );

  const value = useMemo<HomeFeed>(
    () => ({
      items: status === "LoadingFirstPage" ? undefined : results,
      canLoadMore: status === "CanLoadMore",
      loadingMore: status === "LoadingMore",
      loadMore: () => {
        if (status === "CanLoadMore") loadMore(HOME_FEED_PAGE_SIZE);
      },
    }),
    [results, status, loadMore],
  );

  return (
    <HomeFeedContext.Provider value={value}>
      {children}
    </HomeFeedContext.Provider>
  );
}

export function useHomeFeed(): HomeFeed {
  const feed = useContext(HomeFeedContext);
  if (feed === null) {
    throw new Error("useHomeFeed must be used inside HomeFeedProvider");
  }
  return feed;
}
