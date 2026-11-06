import { t, useAppLocale } from "@/lib/i18n";
import { forgetDeletedSharedItem } from "@/lib/share/share-store";
import { EmptyState } from "@/components/empty-state";
import { HeaderActionMenu } from "@/components/ui/header-icon-button";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { HeaderScrim } from "@/components/ui/header-scrim";
import { ItemDetail, type DetailItem } from "@/components/item-detail";
import { ItemHeader } from "@/components/item-header";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  FlashList,
  type FlashListRef,
  type ViewToken,
} from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { AppEntityView } from "expo-app-intents";
import * as Clipboard from "expo-clipboard";
import { StatusBar } from "expo-status-bar";
import { haptics } from "@/lib/haptics";
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from "expo-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  Alert,
  type LayoutChangeEvent,
  Platform,
  useWindowDimensions,
  View,
} from "react-native";
import { ProgressiveBlurHeader } from "progressive-blur";
import { useReducedMotion } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { confirmItemDelete } from "@/lib/confirm-item-delete";
import { analytics } from "@/lib/analytics";
import { useHomeFeed } from "@/lib/home-feed";
import { pagerResyncIndex } from "@/lib/item-pager";
import { useItemOpen } from "@/lib/use-item-open";
import { useItemShare } from "@/lib/use-item-share";
import { isMediaSave, MEDIA_CANVAS } from "@/lib/media-viewer";

function pagerEndReached(
  items: DetailItem[] | undefined,
  homeFeed: ReturnType<typeof useHomeFeed>,
): (() => void) | undefined {
  return items === homeFeed.items && homeFeed.canLoadMore
    ? homeFeed.loadMore
    : undefined;
}

function pagerHeaderColors(
  activeItem: DetailItem | undefined,
  sheetsUnder: ReadonlySet<string>,
  theme: ReturnType<typeof useUnistyles>["theme"],
): { onMedia: boolean; tint: string; background: string } {
  const onMedia =
    isMediaSave(activeItem) && !sheetsUnder.has(activeItem?._id ?? "");
  return onMedia
    ? { onMedia, tint: "white", background: MEDIA_CANVAS }
    : {
        onMedia,
        tint: theme.colors.primary,
        background: theme.colors.background,
      };
}

function PagerHeaderBackdrop({ onMedia }: { onMedia: boolean }) {
  const { theme } = useUnistyles();
  const navigation = useNavigation() as {
    addListener: (
      type: "beforeRemove" | "transitionStart" | "gestureCancel",
      callback: (e: { data?: { closing?: boolean } }) => void,
    ) => () => void;
    isFocused: () => boolean;
  };
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    const drop = () => setFocused(false);
    const offCancel = navigation.addListener("gestureCancel", () =>
      setFocused(navigation.isFocused()),
    );
    const offRemove = navigation.addListener("beforeRemove", drop);
    const offTransition = navigation.addListener(
      "transitionStart",
      (e: { data?: { closing?: boolean } }) => {
        if (e.data?.closing) drop();
      },
    );
    return () => {
      offRemove();
      offTransition();
      offCancel();
    };
  }, [navigation]);
  if (!onMedia) {
    return <ProgressiveBlurHeader fadePastHeader={theme.gap(1.5)} />;
  }
  return (
    <>
      <HeaderScrim color={MEDIA_CANVAS} />
      {focused ? <StatusBar style="light" /> : null}
    </>
  );
}

export default function ItemScreen() {
  useAppLocale();
  return <ItemScreenContent />;
}

function usePagerParamSync(initialId: string) {
  const navigation = useNavigation() as {
    setParams: (params: { id?: string }) => void;
    isFocused: () => boolean;
  };
  const activeIdRef = useRef(initialId);
  const lastWrittenId = useRef(initialId);
  const paramTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const writeParams = useCallback(
    (nextId: string) => {
      if (lastWrittenId.current === nextId) return;
      lastWrittenId.current = nextId;
      navigation.setParams({ id: nextId });
    },
    [navigation],
  );

  useFocusEffect(
    useCallback(() => {
      writeParams(activeIdRef.current);
      return () => {
        if (paramTimer.current) clearTimeout(paramTimer.current);
      };
    }, [writeParams]),
  );

  const scheduleParamWrite = useCallback(
    (nextId: string) => {
      if (paramTimer.current) clearTimeout(paramTimer.current);
      paramTimer.current = setTimeout(() => writeParams(nextId), 350);
    },
    [writeParams],
  );

  return {
    navigation,
    activeIdRef,
    writeParams,
    scheduleParamWrite,
    cancelParamWrite: useCallback(() => {
      if (paramTimer.current) clearTimeout(paramTimer.current);
    }, []),
  };
}

function usePageStyle(width: number, windowHeight: number) {
  const [listHeight, setListHeight] = useState<number | null>(null);
  const onListLayout = useCallback(
    (e: LayoutChangeEvent) => setListHeight(e.nativeEvent.layout.height),
    [],
  );
  const height = listHeight ?? windowHeight;
  const pageStyle = useMemo(() => ({ width, height }), [width, height]);
  return { pageStyle, onListLayout };
}

const pagerKey = (item: DetailItem) => item._id;
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 60 };

function usePagerFollowsActive(
  listRef: RefObject<FlashListRef<DetailItem> | null>,
  items: DetailItem[] | undefined,
  activeIdRef: RefObject<string>,
) {
  const previousItems = useRef(items);
  useEffect(() => {
    const index = pagerResyncIndex(
      previousItems.current,
      items,
      activeIdRef.current,
    );
    previousItems.current = items;
    if (index !== null) {
      listRef.current?.scrollToIndex({ index, animated: false });
    }
  }, [listRef, items, activeIdRef]);
}

function usePagerPages({
  width,
  windowHeight,
  pushedId,
}: {
  width: number;
  windowHeight: number;
  pushedId: string;
}) {
  const { pageStyle, onListLayout } = usePageStyle(width, windowHeight);
  const [sheetsUnder, setSheetsUnder] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const onSheetUnderHeader = useCallback(
    (itemId: string, under: boolean) =>
      setSheetsUnder((current) => {
        if (current.has(itemId) === under) return current;
        const next = new Set(current);
        if (under) next.add(itemId);
        else next.delete(itemId);
        return next;
      }),
    [],
  );
  const renderItem = useCallback(
    ({ item }: { item: DetailItem }) => (
      <AppEntityView entity="item" entityId={item._id} style={pageStyle}>
        <ItemDetail
          item={item}
          isZoomTarget={item._id === pushedId}
          pageHeight={pageStyle.height}
          reserveFooter={false}
          onSheetUnderHeader={onSheetUnderHeader}
        />
      </AppEntityView>
    ),
    [pageStyle, pushedId, onSheetUnderHeader],
  );
  return { renderItem, onListLayout, sheetsUnder };
}

function usePagerScroll() {
  const listRef = useRef<FlashListRef<DetailItem>>(null);
  const reducedMotion = useReducedMotion();
  return { listRef, reducedMotion };
}

function ItemScreenContent() {
  const { id, from } = useLocalSearchParams<{
    id: string;
    from?: string;
  }>();
  const router = useRouter();
  const { theme } = useUnistyles();
  const { width, height } = useWindowDimensions();
  const deleteItem = useMutation(api.items.deleteItem);
  const markItemOpened = useMutation(api.notifications.markItemOpened);
  const { listRef, reducedMotion } = usePagerScroll();

  const homeFeed = useHomeFeed();

  const { data: single } = useQuery(
    convexQuery(api.items.getItem, { id: id as Id<"items"> }),
  );

  // On Android a deep start index in the home pager drew an empty page.
  const list = from === "next-up" ? undefined : homeFeed.items;

  const startIndex = list ? list.findIndex((i) => i._id === id) : -1;

  const items = useMemo<DetailItem[] | undefined>(
    () =>
      startIndex >= 0
        ? list
        : single
          ? [single]
          : single === null
            ? []
            : undefined,
    [startIndex, list, single],
  );

  const onEndReached = pagerEndReached(items, homeFeed);

  const [pushedId] = useState(id);
  const [activeId, setActiveId] = useState(id);
  const {
    navigation,
    activeIdRef,
    writeParams,
    scheduleParamWrite,
    cancelParamWrite,
  } = usePagerParamSync(id);
  const goTo = useCallback(
    (nextId: string) => {
      activeIdRef.current = nextId;
      setActiveId(nextId);
    },
    [activeIdRef],
  );

  const onViewable = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<DetailItem>[] }) => {
      const first = viewableItems[0]?.item;
      if (!first) return;
      if (first._id === activeIdRef.current) return;
      if (!navigation.isFocused()) return;
      goTo(first._id);
      scheduleParamWrite(first._id);
    },
    [navigation, activeIdRef, goTo, scheduleParamWrite],
  );

  const { renderItem, onListLayout, sheetsUnder } = usePagerPages({
    width,
    windowHeight: height,
    pushedId,
  });

  usePagerFollowsActive(listRef, items, activeIdRef);

  const activeItem = items?.find((i) => i._id === activeId) ?? items?.[0];

  const media = pagerHeaderColors(activeItem, sheetsUnder, theme);

  const activeFull =
    single && single._id === activeItem?._id ? single : undefined;

  const markOpened = useCallback(
    ({ itemId }: { itemId: string }) =>
      markItemOpened({ itemId: itemId as Id<"items"> }),
    [markItemOpened],
  );
  useItemOpen(activeItem, from ?? "direct", markOpened);

  const shareActive = useItemShare(activeFull ?? activeItem);

  const copyLink = useCallback(async () => {
    if (!activeItem?.url) return;
    await Clipboard.setStringAsync(activeItem.url);
    analytics.capture("item_link_copied");
    analytics.itemAction(activeItem, "copy");
    void haptics.success();
  }, [activeItem]);

  const onDelete = useCallback(() => {
    if (!activeItem || !items) return;
    confirmItemDelete(async () => {
      cancelParamWrite();
      const idx = items.findIndex((item) => item._id === activeItem._id);
      const neighbor = items[idx + 1] ?? items[idx - 1];
      try {
        await deleteItem({ id: activeItem._id });
        forgetDeletedSharedItem(activeItem._id);
        analytics.itemDeleted(activeItem, "item_detail");
        if (neighbor) {
          goTo(neighbor._id);
          writeParams(neighbor._id);
          listRef.current?.scrollToIndex({
            index: Math.min(idx, items.length - 2),
            animated: !reducedMotion,
          });
        } else if (router.canGoBack()) router.back();
        else router.replace("/(app)/(tabs)/(home)");
      } catch {
        Alert.alert(t("item.deleteFailed"), t("errors.retrySoon"));
      }
    });
  }, [
    activeItem,
    items,
    deleteItem,
    router,
    goTo,
    writeParams,
    cancelParamWrite,
    listRef,
    reducedMotion,
  ]);

  if (items === undefined) {
    return <ScreenLoader label={t("loading.item")} />;
  }

  if (items.length === 0) {
    return (
      <View style={styles.loading}>
        <EmptyState title={t("item.goneTitle")} message={t("item.goneBody")} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerBackButtonDisplayMode: "minimal",
          headerTintColor: media.tint,
          ...(Platform.OS === "android"
            ? {
                headerTransparent: false,
                headerStyle: { backgroundColor: media.background },
                headerTitleAlign: "center",
                headerRight: () => (
                  <HeaderActionMenu
                    icon="ellipsis"
                    label={t("item.actions")}
                    title={
                      activeItem?.title ?? activeItem?.note ?? t("item.actions")
                    }
                    actions={[
                      { label: t("common.share"), onPress: shareActive },
                      ...(activeItem?.url
                        ? [{ label: t("item.copyLink"), onPress: copyLink }]
                        : []),
                      {
                        label: t("common.delete"),
                        destructive: true,
                        onPress: onDelete,
                      },
                    ]}
                  />
                ),
              }
            : {}),
        }}
      />
      <Stack.Title asChild>
        <ItemHeader item={activeItem} onMedia={media.onMedia} />
      </Stack.Title>
      {Platform.OS === "ios" ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Menu icon="ellipsis">
            <Stack.Toolbar.MenuAction
              icon="square.and.arrow.up"
              onPress={shareActive}
            >
              {t("common.share")}
            </Stack.Toolbar.MenuAction>
            {activeItem?.url ? (
              <Stack.Toolbar.MenuAction icon="doc.on.doc" onPress={copyLink}>
                {t("item.copyLink")}
              </Stack.Toolbar.MenuAction>
            ) : null}
            <Stack.Toolbar.MenuAction
              icon="trash"
              destructive
              onPress={onDelete}
            >
              {t("common.delete")}
            </Stack.Toolbar.MenuAction>
          </Stack.Toolbar.Menu>
        </Stack.Toolbar>
      ) : null}

      <FlashList
        ref={listRef}
        style={styles.container}
        onLayout={onListLayout}
        data={items}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={pagerKey}
        initialScrollIndex={startIndex >= 0 ? startIndex : 0}
        renderItem={renderItem}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={VIEWABILITY_CONFIG}
        onEndReached={onEndReached}
        onEndReachedThreshold={2}
      />

      <PagerHeaderBackdrop onMedia={media.onMedia} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.background,
  },
}));
