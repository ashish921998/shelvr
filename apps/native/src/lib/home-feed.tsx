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
  // `undefined` until the first page has arrived, like a plain query's `data`.
  items: HomeFeedItem[] | undefined;
  canLoadMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
};

const HomeFeedContext = createContext<HomeFeed | null>(null);

/**
 * Mounted once around the signed-in tree. The boundary keeps a feed that
 * fails because this account was deleted elsewhere on the loader, not the
 * crash screen, until sign-out lands. Mid-onboarding the tree stays mounted
 * signed out, so the boundary clears its held loader on that edge.
 */
export function HomeFeedProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  return (
    <AccountGoneBoundary signedIn={isAuthenticated}>
      <FeedSubscription>{children}</FeedSubscription>
    </AccountGoneBoundary>
  );
}

/**
 * Owns the one paginated subscription to the home feed. The feed screen renders
 * it and the item detail screen pages through it, so both must see the same
 * ordered set including every page the user has scrolled to. A hook per screen
 * would give each its own pagination id, and the detail pager would only know
 * the first page.
 */
function FeedSubscription({ children }: { children: ReactNode }) {
  // usePaginatedQuery rethrows a server error, so the query must not run
  // before auth is ready: requireUserId would reject it and crash the tree.
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
