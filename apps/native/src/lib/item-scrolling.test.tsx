// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useImperativeHandle, type ReactNode } from "react";
import type { ScrollView } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ItemScreen from "@/app/(app)/item/[id]";
import { MediaViewerPage } from "@/components/media-viewer-page";
import type { DetailItem } from "@/components/item-detail";

const mock = vi.hoisted(() => ({
  reducedMotion: false,
  params: { id: "b", from: "space", spaceId: "space-1" },
  items: [] as DetailItem[],
  scroll: vi.fn(),
  detailsScroll: vi.fn(),
  dismiss: vi.fn(),
  delete: vi.fn(),
  alert: vi.fn(),
  forget: vi.fn(),
  mutation: vi.fn(),
  viewable: null as
    | null
    | ((event: { viewableItems: { item: DetailItem }[] }) => void),
  navigation: {
    setParams: vi.fn(),
    isFocused: () => true,
    addListener: () => () => {},
  },
  router: {
    back: vi.fn(),
    replace: vi.fn(),
    push: vi.fn(),
    canGoBack: vi.fn(() => true),
  },
}));

type ControlProps = {
  children?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
};
function Container({ children }: ControlProps) {
  return <div>{children}</div>;
}
function Control(props: ControlProps) {
  return (
    <button
      onClick={props.onPress}
      disabled={props.disabled}
      aria-label={props.accessibilityLabel}
    >
      {props.children}
    </button>
  );
}

vi.mock("react-native", () => ({
  View: Container,
  Text: Container,
  Pressable: Control,
  ScrollView: vi.fn(
    ({ ref, children }: ControlProps & { ref: React.Ref<unknown> }) => {
      useImperativeHandle(ref, () => ({ scrollTo: mock.detailsScroll }));
      return <div>{children}</div>;
    },
  ),
  Platform: { OS: "ios" },
  Alert: { alert: mock.alert },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));
vi.mock("react-native-reanimated", () => ({
  default: { View: Container },
  useReducedMotion: () => mock.reducedMotion,
  useAnimatedStyle: (fn: () => unknown) => fn(),
  withTiming: (value: unknown) => value,
  FadeOutDown: { duration: () => undefined },
  SlideInDown: { duration: () => undefined },
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({
    theme: { gap: (n: number) => n * 8, colors: {}, opacity: { pressed: 0.7 } },
  }),
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  const Toolbar = Object.assign(Container, {
    Menu: Container,
    MenuAction: Control,
  });
  return {
    Stack: { Screen: vi.fn(() => null), Title: Container, Toolbar },
    Link: { AppleZoomTarget: Container },
    useRouter: () => mock.router,
    useLocalSearchParams: () => mock.params,
    useNavigation: () => mock.navigation,
    useFocusEffect: (callback: () => void | (() => void)) =>
      useEffect(callback, [callback]),
  };
});
vi.mock("@shopify/flash-list", () => ({
  FlashList: vi.fn(
    ({
      ref,
      onViewableItemsChanged,
    }: {
      ref: React.Ref<unknown>;
      onViewableItemsChanged: NonNullable<typeof mock.viewable>;
    }) => {
      useImperativeHandle(ref, () => ({ scrollToIndex: mock.scroll }));
      mock.viewable = onViewableItemsChanged;
      return null;
    },
  ),
}));
vi.mock("@convex/_generated/api", () => ({
  api: {
    items: { deleteItem: "delete", searchItems: "search", getItem: "single" },
    spaces: {
      getSpace: "space",
      dismissSuggestion: "dismiss",
      acceptSuggestion: "accept",
      undoAcceptSuggestion: "undo",
    },
    notifications: { markItemOpened: "opened" },
  },
}));
vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (ref: string) => ref,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (ref: string) => ({
    data:
      ref === "space"
        ? { suggestions: mock.items, items: [], name: "Space" }
        : ref === "single"
          ? mock.items.find((item) => item._id === mock.params.id)
          : undefined,
  }),
}));
vi.mock("convex/react", () => ({
  useMutation: (ref: string) =>
    ref === "delete"
      ? mock.delete
      : ref === "dismiss"
        ? mock.dismiss
        : mock.mutation,
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: vi.fn(),
}));
vi.mock("@/lib/home-feed", () => ({
  useHomeFeed: () => ({ items: mock.items }),
}));
vi.mock("@/lib/use-item-open", () => ({ useItemOpen: vi.fn() }));
vi.mock("@/lib/use-item-share", () => ({ useItemShare: () => mock.mutation }));
vi.mock("@/lib/use-find-links", () => ({
  useFindLinks: () => ({ findLinks: mock.mutation, disabled: false }),
}));
vi.mock("@/lib/share/share-store", () => ({
  forgetDeletedSharedItem: mock.forget,
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), itemAction: vi.fn() },
}));
vi.mock("@/components/item-detail", () => ({ ItemDetail: vi.fn(() => null) }));
vi.mock("@/components/item-header", () => ({
  ItemHeader: vi.fn(({ item }: { item: DetailItem }) => (
    <div data-testid="selected">{item._id}</div>
  )),
}));
vi.mock("@/components/item-source-link", () => ({
  ItemSourceLink: vi.fn(() => null),
  openItemSource: vi.fn(),
}));
vi.mock("@/components/post-media-button", () => ({
  PostMediaButton: Container,
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/glass", () => ({ GlassView: Container }));
vi.mock("@/components/empty-state", () => ({ EmptyState: vi.fn(() => null) }));
vi.mock("@/components/ui/header-icon-button", () => ({
  HeaderActionMenu: vi.fn(() => null),
}));
vi.mock("@/components/ui/screen-loader", () => ({
  ScreenLoader: vi.fn(() => null),
}));
vi.mock("@/components/ui/header-scrim", () => ({
  HeaderScrim: vi.fn(() => null),
}));
vi.mock("progressive-blur", () => ({
  ProgressiveBlurHeader: vi.fn(() => null),
}));
vi.mock("expo-app-intents", () => ({ AppEntityView: Container }));
vi.mock("expo-status-bar", () => ({ StatusBar: vi.fn(() => null) }));
vi.mock("expo-image", () => ({ Image: vi.fn(() => null) }));
vi.mock("expo-clipboard", () => ({ setStringAsync: vi.fn() }));
vi.mock("expo-haptics", () => ({ notificationAsync: vi.fn() }));

function item(id: string): DetailItem {
  return { _id: id, type: "image", title: id, status: "ready" } as DetailItem;
}
function selected(id: string) {
  expect(screen.getByTestId("selected").textContent).toBe(id);
}
async function press(label: string) {
  await act(async () => fireEvent.click(screen.getByText(label)));
}
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.items = ["a", "b", "c"].map(item);
  mock.params = { id: "b", from: "space", spaceId: "space-1" };
  mock.dismiss.mockResolvedValue(true);
  mock.delete.mockResolvedValue(undefined);
  mock.router.canGoBack.mockReturnValue(true);
});

describe.each([false, true])("reduced motion %s", (reducedMotion) => {
  beforeEach(() => {
    mock.reducedMotion = reducedMotion;
  });

  it("opens the real media Details at the page height", async () => {
    render(
      <MediaViewerPage
        item={item("b")}
        social={undefined}
        heroUri="fixture-image"
        isZoomTarget={false}
        pageHeight={700}
        headerInset={60}
        reserveFooter={false}
        scrollRef={{ current: null } as React.RefObject<ScrollView | null>}
        notice={null}
        actions={null}
        details={<div>Details content</div>}
      />,
    );
    await press("item.details");
    expect(mock.detailsScroll).toHaveBeenCalledWith({
      y: 700,
      animated: !reducedMotion,
    });
  });

  it.each([
    ["b", "c", 2],
    ["c", "b", 1],
  ])("dismisses %s after scrolling to %s", async (id, neighbor, index) => {
    mock.params.id = id;
    render(<ItemScreen />);
    await press("common.dismiss");
    expect(mock.scroll).toHaveBeenCalledWith({
      index,
      animated: !reducedMotion,
    });
    expect(mock.scroll.mock.invocationCallOrder[0]).toBeLessThan(
      mock.dismiss.mock.invocationCallOrder[0]!,
    );
    expect(mock.dismiss).toHaveBeenCalledWith({
      itemId: id,
      spaceId: "space-1",
    });
    selected(neighbor);
    expect(mock.navigation.setParams).toHaveBeenCalledWith({ id: neighbor });
  });

  it("backs out before dismissing the only suggestion", async () => {
    mock.items = [item("b")];
    render(<ItemScreen />);
    await press("common.dismiss");
    expect(mock.router.back).toHaveBeenCalledOnce();
    expect(mock.router.back.mock.invocationCallOrder[0]).toBeLessThan(
      mock.dismiss.mock.invocationCallOrder[0]!,
    );
    expect(mock.dismiss).toHaveBeenCalledWith({
      itemId: "b",
      spaceId: "space-1",
    });
    expect(mock.scroll).not.toHaveBeenCalled();
  });

  it.each([
    ["b", "c", 1],
    ["c", "b", 1],
  ])(
    "awaits deletion of %s before selecting %s",
    async (id, neighbor, index) => {
      mock.params.id = id;
      const pending = deferred();
      mock.delete.mockReturnValue(pending.promise);
      render(<ItemScreen />);
      await press("common.delete");
      expect(mock.delete).toHaveBeenCalledWith({ id });
      selected(id);
      expect(mock.scroll).not.toHaveBeenCalled();
      expect(mock.navigation.setParams).not.toHaveBeenCalled();
      expect(mock.forget).not.toHaveBeenCalled();
      await act(async () => pending.resolve());
      selected(neighbor);
      expect(mock.forget).toHaveBeenCalledWith(id);
      expect(mock.navigation.setParams).toHaveBeenCalledWith({ id: neighbor });
      expect(mock.scroll).toHaveBeenCalledWith({
        index,
        animated: !reducedMotion,
      });
    },
  );

  it.each([true, false])(
    "deletes a singleton with canGoBack=%s",
    async (back) => {
      mock.items = [item("b")];
      mock.router.canGoBack.mockReturnValue(back);
      render(<ItemScreen />);
      await press("common.delete");
      expect(mock.delete).toHaveBeenCalledWith({ id: "b" });
      expect(mock.scroll).not.toHaveBeenCalled();
      expect(mock.navigation.setParams).not.toHaveBeenCalled();
      if (back) {
        expect(mock.router.back).toHaveBeenCalledOnce();
        expect(mock.router.replace).not.toHaveBeenCalled();
      } else {
        expect(mock.router.replace).toHaveBeenCalledWith("/");
        expect(mock.router.back).not.toHaveBeenCalled();
      }
    },
  );

  it("alerts on rejected deletion without changing selection or navigation", async () => {
    const pending = deferred();
    mock.delete.mockReturnValue(pending.promise);
    render(<ItemScreen />);
    await press("common.delete");
    await act(async () => pending.reject(new Error("fixture failure")));
    expect(mock.alert).toHaveBeenCalledWith(
      "item.deleteFailed",
      "errors.retrySoon",
    );
    selected("b");
    expect(mock.scroll).not.toHaveBeenCalled();
    expect(mock.navigation.setParams).not.toHaveBeenCalled();
    expect(mock.router.back).not.toHaveBeenCalled();
    expect(mock.router.replace).not.toHaveBeenCalled();
    expect(mock.forget).not.toHaveBeenCalled();
  });

  it.each(["common.dismiss", "common.delete"])(
    "cancels a stale swipe param write when pressing %s",
    async (label) => {
      vi.useFakeTimers();
      try {
        mock.params.id = "a";
        const view = render(<ItemScreen />);
        act(() =>
          mock.viewable?.({ viewableItems: [{ item: mock.items[1]! }] }),
        );
        selected("b");
        await press(label);
        selected("c");
        expect(mock.navigation.setParams).toHaveBeenCalledExactlyOnceWith({
          id: "c",
        });
        act(() => vi.advanceTimersByTime(400));
        expect(mock.navigation.setParams).toHaveBeenCalledExactlyOnceWith({
          id: "c",
        });
        expect(
          label === "common.delete" ? mock.delete : mock.dismiss,
        ).toHaveBeenCalledWith(
          label === "common.delete"
            ? { id: "b" }
            : { itemId: "b", spaceId: "space-1" },
        );
        view.unmount();
      } finally {
        vi.useRealTimers();
      }
    },
  );
});
