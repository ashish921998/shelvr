import { api } from '@convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';
import { useConvexAuth, usePaginatedQuery } from 'convex/react';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

export const HOME_FEED_PAGE_SIZE = 40;

export type HomeFeedItem = FunctionReturnType<typeof api.items.listItemsPage>['page'][number];

type HomeFeed = {
  // `undefined` until the first page has arrived, like a plain query's `data`.
  items: HomeFeedItem[] | undefined;
  canLoadMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
};

const HomeFeedContext = createContext<HomeFeed | null>(null);

/**
 * Owns the one paginated subscription to the home feed. The feed screen renders
 * it and the item detail screen pages through it, so both must see the same
 * ordered set including every page the user has scrolled to. A hook per screen
 * would give each its own pagination id, and the detail pager would only know
 * the first page. Mounted once inside the signed-in tree.
 */
export function HomeFeedProvider({ children }: { children: ReactNode }) {
  // usePaginatedQuery rethrows a server error, so the query must not run
  // before auth is ready: requireUserId would reject it and crash the tree.
  const { isAuthenticated } = useConvexAuth();
  const { results, status, loadMore } = usePaginatedQuery(
    api.items.listItemsPage,
    isAuthenticated ? {} : 'skip',
    { initialNumItems: HOME_FEED_PAGE_SIZE },
  );

  const value = useMemo<HomeFeed>(
    () => ({
      items: status === 'LoadingFirstPage' ? undefined : results,
      canLoadMore: status === 'CanLoadMore',
      loadingMore: status === 'LoadingMore',
      loadMore: () => {
        if (status === 'CanLoadMore') loadMore(HOME_FEED_PAGE_SIZE);
      },
    }),
    [results, status, loadMore],
  );

  return <HomeFeedContext.Provider value={value}>{children}</HomeFeedContext.Provider>;
}

export function useHomeFeed(): HomeFeed {
  const feed = useContext(HomeFeedContext);
  if (feed === null) {
    throw new Error('useHomeFeed must be used inside HomeFeedProvider');
  }
  return feed;
}
