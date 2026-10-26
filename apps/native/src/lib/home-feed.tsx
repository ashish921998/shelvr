import { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useConvexAuth, usePaginatedQuery } from "convex/react";
import { AccountGoneBoundary } from "@/components/account-gone-boundary";
import { replaceEqualDeep } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

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

  const items = useSharedRows(results);

  const value = useMemo<HomeFeed>(
    () => ({
      items: status === "LoadingFirstPage" ? undefined : items,
      canLoadMore: status === "CanLoadMore",
      loadingMore: status === "LoadingMore",
      loadMore: () => {
        if (status === "CanLoadMore") loadMore(HOME_FEED_PAGE_SIZE);
      },
    }),
    [items, status, loadMore],
  );

  return (
    <HomeFeedContext.Provider value={value}>
      {children}
    </HomeFeedContext.Provider>
  );
}

/**
 * Convex decodes a page afresh whenever any row on it changes, so one save
 * finishing processing hands every card on its page a new object and every
 * visible card re-renders. Keep the previous object for each row whose
 * contents are unchanged, so the memoized cards skip all but the changed one.
 */
function useSharedRows(rows: HomeFeedItem[]): HomeFeedItem[] {
  const [last, setLast] = useState({ rows, shared: rows });
  if (last.rows === rows) return last.shared;
  const shared = replaceEqualDeep(last.shared, rows);
  setLast({ rows, shared });
  return shared;
}

export function useHomeFeed(): HomeFeed {
  const feed = useContext(HomeFeedContext);
  if (feed === null) {
    throw new Error("useHomeFeed must be used inside HomeFeedProvider");
  }
  return feed;
}
