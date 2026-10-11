// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SearchScreen from "@/app/(app)/(tabs)/(search)";

const mocks = vi.hoisted(() => ({
  entering: vi.fn(),
  query: vi.fn(),
  results: new Map<string, unknown[]>(),
  tabSearch: "",
  platform: "ios",
  reducedMotion: false,
}));
vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return mocks.platform;
    },
  },
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));
vi.mock("react-native-reanimated", () => {
  function builder() {
    return {
      duration: vi.fn().mockReturnThis(),
      easing: vi.fn().mockReturnThis(),
      reduceMotion: vi.fn().mockReturnThis(),
      delay: vi.fn().mockReturnThis(),
    };
  }
  return {
    default: {
      View: vi.fn(
        ({
          entering,
          children,
        }: {
          entering?: unknown;
          children: ReactNode;
        }) => {
          mocks.entering(entering);
          return <div>{children}</div>;
        },
      ),
    },
    FadeIn: builder(),
    FadeOut: builder(),
    Easing: { bezier: vi.fn() },
    cubicBezier: vi.fn(),
    ReduceMotion: { Never: "never", System: "system" },
    useReducedMotion: () => mocks.reducedMotion,
  };
});
vi.mock("@/lib/i18n", () => ({
  useAppLocale: () => {},
  t: (key: string, values?: { query: string }) =>
    values ? `${key}:${values.query}` : key,
}));
vi.mock("@/lib/header-layout", () => ({ useAppHeaderHeight: () => 50 }));
vi.mock("@/lib/tab-search-query", () => ({
  useTabSearchQuery: () => mocks.tabSearch,
}));
vi.mock("@/components/ui/header-scrim", () => ({
  HeaderScrim: vi.fn(() => null),
}));
vi.mock("@/components/masonry-feed", () => ({
  MasonryFeed: vi.fn(({ items }: { items: unknown[] }) => (
    <div data-testid="feed">{items.length}</div>
  )),
}));
vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (_api: unknown, args: { query: string } | "skip") => {
    mocks.query(args);
    return { queryKey: args === "skip" ? "skip" : args.query };
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string }) => ({
    data: mocks.results.get(queryKey),
  }),
}));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({}),
  Stack: {
    SearchBar: vi.fn(
      ({
        onChangeText,
        onCancelButtonPress,
      }: {
        onChangeText: (event: { nativeEvent: { text: string } }) => void;
        onCancelButtonPress: () => void;
      }) => (
        <>
          <input
            aria-label="Search"
            onChange={(event) =>
              onChangeText({ nativeEvent: { text: event.target.value } })
            }
          />
          <button onClick={onCancelButtonPress}>Cancel</button>
        </>
      ),
    ),
  },
}));

beforeEach(() => {
  vi.useFakeTimers();
  mocks.entering.mockClear();
  mocks.query.mockClear();
  mocks.results.clear();
  mocks.tabSearch = "";
});
afterEach(() => vi.useRealTimers());
async function debounce() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250);
  });
}
function expectImmediate(title: string) {
  expect(screen.getByText(title)).toBeTruthy();
  expect(mocks.entering).toHaveBeenLastCalledWith(undefined);
}

describe.each([false, true])("Reduce Motion enabled: %s", (reducedMotion) => {
  beforeEach(() => {
    mocks.reducedMotion = reducedMotion;
  });

  describe.each(["ios", "android"])("%s search input", (platform) => {
    beforeEach(() => {
      mocks.platform = platform;
    });

    it("skips empty queries and shows both empty states without an entrance", async () => {
      const view = render(<SearchScreen />);
      const change = (text: string) => {
        if (platform === "ios")
          fireEvent.change(screen.getByLabelText("Search"), {
            target: { value: text },
          });
        else {
          mocks.tabSearch = text;
          view.rerender(<SearchScreen />);
        }
      };
      expect(mocks.query).toHaveBeenLastCalledWith("skip");
      expectImmediate("search.emptyTitle");
      change(" missing ");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(249);
      });
      expect(mocks.query).toHaveBeenLastCalledWith("skip");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(mocks.query).toHaveBeenLastCalledWith({ query: "missing" });
      expect(screen.queryByText("search.noResultsTitle")).toBeNull();
      expect(screen.getByTestId("feed").textContent).toBe("0");
      mocks.results.set("missing", []);
      view.rerender(<SearchScreen />);
      expectImmediate("search.noResultsTitle");
      expect(screen.getByText("search.noResults:missing")).toBeTruthy();
    });

    it("handles populated, empty, rapid replacement, and clear without stale copy", async () => {
      mocks.results.set("found", ["item"]);
      mocks.results.set("absent", []);
      const view = render(<SearchScreen />);
      const change = (text: string) => {
        if (platform === "ios")
          fireEvent.change(screen.getByLabelText("Search"), {
            target: { value: text },
          });
        else {
          mocks.tabSearch = text;
          view.rerender(<SearchScreen />);
        }
      };
      change("found");
      await debounce();
      expect(screen.getByTestId("feed").textContent).toBe("1");
      change("absent");
      await debounce();
      expectImmediate("search.noResultsTitle");
      change("found");
      await debounce();
      expect(screen.getByTestId("feed").textContent).toBe("1");
      change("absent");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      change("new");
      await debounce();
      expect(mocks.query).toHaveBeenLastCalledWith({ query: "new" });
      expect(screen.queryByText("search.noResults:absent")).toBeNull();
      if (platform === "ios") fireEvent.click(screen.getByText("Cancel"));
      else change("");
      await debounce();
      expect(mocks.query).toHaveBeenLastCalledWith("skip");
      expectImmediate("search.emptyTitle");
    });
  });
});
