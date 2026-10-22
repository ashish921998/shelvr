// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";

import { HomeFeedProvider, useHomeFeed } from "./home-feed";

const mocks = vi.hoisted(() => ({
  useConvexAuth: vi.fn(),
  usePaginatedQuery: vi.fn(),
  useQuery: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useConvexAuth: mocks.useConvexAuth,
  usePaginatedQuery: mocks.usePaginatedQuery,
  useQuery: mocks.useQuery,
}));
vi.mock("@convex/_generated/api", () => ({
  api: {
    items: { listItemsPage: "listItemsPage" },
    users: { getCurrentUser: "getCurrentUser" },
  },
}));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/components/ui/screen-loader", () => ({
  ScreenLoader: vi.fn(() => <div>loader</div>),
}));

type HomeFeed = ReturnType<typeof useHomeFeed>;

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
      expect(feed!.items).toEqual(items);
      expect(feed!.canLoadMore).toBe(canLoadMore);
      expect(feed!.loadingMore).toBe(loadingMore);
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
    sink[0]!.loadMore();
    expect(loadMore).toHaveBeenCalledTimes(1);
    expect(loadMore).toHaveBeenCalledWith(40);

    stubFeed("Exhausted", loadMore);
    const exhaustedSink: HomeFeed[] = [];
    render(
      <HomeFeedProvider>
        <Probe sink={exhaustedSink} />
      </HomeFeedProvider>,
    );
    exhaustedSink[0]!.loadMore();
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it("leaves the account-gone loader once sign-out lands mid-onboarding", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.useQuery.mockReturnValue(null);
    mocks.useConvexAuth.mockReturnValue({ isAuthenticated: true });
    mocks.usePaginatedQuery.mockImplementation(() => {
      throw new Error("Server Error");
    });
    const tree = () => (
      <HomeFeedProvider>
        <div>onboarding</div>
      </HomeFeedProvider>
    );
    const { rerender } = render(tree());
    expect(screen.getByText("loader")).toBeTruthy();

    mocks.useConvexAuth.mockReturnValue({ isAuthenticated: false });
    mocks.usePaginatedQuery.mockReturnValue({
      results: [],
      status: "LoadingFirstPage",
      loadMore: vi.fn(),
    });
    rerender(tree());
    expect(screen.getByText("onboarding")).toBeTruthy();
    expect(screen.queryByText("loader")).toBeNull();
    vi.restoreAllMocks();
  });

  it("keeps the tree under it mounted when the user signs in", () => {
    mocks.useConvexAuth.mockReturnValue({ isAuthenticated: false });
    mocks.usePaginatedQuery.mockReturnValue({
      results: [],
      status: "LoadingFirstPage",
      loadMore: vi.fn(),
    });
    let mounts = 0;
    function Onboarding() {
      useEffect(() => {
        mounts += 1;
      }, []);
      return <div>onboarding</div>;
    }
    const tree = () => (
      <HomeFeedProvider>
        <Onboarding />
      </HomeFeedProvider>
    );
    const { rerender } = render(tree());

    stubFeed("LoadingFirstPage");
    rerender(tree());
    expect(screen.getByText("onboarding")).toBeTruthy();
    expect(mounts).toBe(1);
  });
});
