// @vitest-environment jsdom
// Tests for the one shared home-feed subscription. convex/react is stubbed, so
// the pagination states are simulated directly and the provider's contract is
// what's under test: undefined items until the first page, exact load-more
// gating, and one context instance shared by every consumer.
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { HomeFeedProvider, useHomeFeed } from "./home-feed";

const mocks = vi.hoisted(() => ({
  useConvexAuth: vi.fn(),
  usePaginatedQuery: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useConvexAuth: mocks.useConvexAuth,
  usePaginatedQuery: mocks.usePaginatedQuery,
}));
vi.mock("@convex/_generated/api", () => ({
  api: { items: { listItemsPage: "listItemsPage" } },
}));

type HomeFeed = ReturnType<typeof useHomeFeed>;

// Renders nothing; hands the context value it sees to the test.
function Probe({ sink }: { sink: HomeFeed[] }) {
  sink.push(useHomeFeed());
  return null;
}

function stubFeed(status: string, loadMore = vi.fn()) {
  mocks.useConvexAuth.mockReturnValue({ isAuthenticated: true });
  mocks.usePaginatedQuery.mockReturnValue({
    results: [{ _id: "items:1" }],
    status,
    loadMore,
  });
}

describe("HomeFeedProvider", () => {
  it("throws when useHomeFeed runs outside the provider", () => {
    stubFeed("CanLoadMore");
    expect(() => render(<Probe sink={[]} />)).toThrow(
      "useHomeFeed must be used inside HomeFeedProvider",
    );
  });

  it("queries only after auth is ready", () => {
    mocks.useConvexAuth.mockReturnValue({ isAuthenticated: false });
    mocks.usePaginatedQuery.mockReturnValue({
      results: [],
      status: "LoadingFirstPage",
      loadMore: vi.fn(),
    });
    render(
      <HomeFeedProvider>
        <Probe sink={[]} />
      </HomeFeedProvider>,
    );
    expect(mocks.usePaginatedQuery).toHaveBeenCalledWith(
      "listItemsPage",
      "skip",
      { initialNumItems: 40 },
    );
  });

  it.each([
    ["LoadingFirstPage", undefined, false, false],
    ["CanLoadMore", [{ _id: "items:1" }], true, false],
    ["LoadingMore", [{ _id: "items:1" }], false, true],
    ["Exhausted", [{ _id: "items:1" }], false, false],
  ])(
    "maps %s to items=%s, canLoadMore=%s, loadingMore=%s",
    (status, items, canLoadMore, loadingMore) => {
      stubFeed(status);
      const sink: HomeFeed[] = [];
      render(
        <HomeFeedProvider>
          <Probe sink={sink} />
        </HomeFeedProvider>,
      );
      const feed = sink[0];
      expect(feed.items).toEqual(items);
      expect(feed.canLoadMore).toBe(canLoadMore);
      expect(feed.loadingMore).toBe(loadingMore);
    },
  );

  it("loads the next page only while more pages exist", () => {
    const loadMore = vi.fn();

    stubFeed("CanLoadMore", loadMore);
    const sink: HomeFeed[] = [];
    render(
      <HomeFeedProvider>
        <Probe sink={sink} />
      </HomeFeedProvider>,
    );
    sink[0].loadMore();
    expect(loadMore).toHaveBeenCalledTimes(1);
    expect(loadMore).toHaveBeenCalledWith(40);

    stubFeed("Exhausted", loadMore);
    const exhaustedSink: HomeFeed[] = [];
    render(
      <HomeFeedProvider>
        <Probe sink={exhaustedSink} />
      </HomeFeedProvider>,
    );
    exhaustedSink[0].loadMore();
    expect(loadMore).toHaveBeenCalledTimes(1);
  });
});
