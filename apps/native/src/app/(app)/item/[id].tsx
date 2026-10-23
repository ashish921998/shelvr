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
import { GlassView } from "@/components/glass";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
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
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { AppSymbolIcon } from "@/components/symbol";
import { ProgressiveBlurHeader } from "progressive-blur";
import Animated, {
  FadeOutDown,
  SlideInDown,
  useReducedMotion,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { analytics } from "@/lib/analytics";
import { useFindLinks } from "@/lib/use-find-links";
import { useHomeFeed } from "@/lib/home-feed";
import { pagerResyncIndex } from "@/lib/item-pager";
import { useItemOpen } from "@/lib/use-item-open";
import { useItemShare } from "@/lib/use-item-share";
import { isMediaSave, MEDIA_CANVAS } from "@/lib/media-viewer";

function spaceQueryArg(
  from?: string,
  spaceId?: string,
): "skip" | { id: Id<"spaces"> } {
  return from === "space" && spaceId ? { id: spaceId as Id<"spaces"> } : "skip";
}

function searchQueryArg(from?: string, q?: string): "skip" | { query: string } {
  return from === "search" && q ? { query: q } : "skip";
}

function acceptedNoticeVisible(
  accepted: { itemId: Id<"items">; spaceId: Id<"spaces"> } | null,
  activeItem: DetailItem | undefined,
  isSuggested: boolean,
  space: { items: { _id: string }[]; name: string } | null | undefined,
): boolean {
  return Boolean(
    !isSuggested &&
    accepted?.itemId === activeItem?._id &&
    space?.items.some((item) => item._id === accepted?.itemId),
  );
}

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
  suggestedIds,
  accepted,
}: {
  width: number;
  windowHeight: number;
  pushedId: string;
  suggestedIds: Set<string>;
  accepted: { itemId: string } | null;
}) {
  const acceptedId = accepted?.itemId;
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
          reserveFooter={suggestedIds.has(item._id) || item._id === acceptedId}
          onSheetUnderHeader={onSheetUnderHeader}
        />
      </AppEntityView>
    ),
    [pageStyle, pushedId, suggestedIds, acceptedId, onSheetUnderHeader],
  );
  return { renderItem, onListLayout, sheetsUnder };
}

function useRemoveFromSpace({
  from,
  spaceId,
  activeId,
  space,
  items,
  listRef,
  goTo,
  writeParams,
  cancelParamWrite,
}: {
  from: string | undefined;
  spaceId: string | undefined;
  activeId: string;
  space: { items: { _id: string }[] } | null | undefined;
  items: DetailItem[] | undefined;
  listRef: RefObject<FlashListRef<DetailItem> | null>;
  goTo: (id: string) => void;
  writeParams: (id: string) => void;
  cancelParamWrite: () => void;
}) {
  const router = useRouter();
  const removeItemFromSpace = useMutation(api.spaces.removeItemFromSpace);
  const available =
    from === "space" &&
    !!spaceId &&
    !!space?.items.some((item) => item._id === activeId);
  const pending = useRef(false);
  const remove = useCallback(async () => {
    if (!spaceId || !activeId || !items || pending.current) return;
    pending.current = true;
    cancelParamWrite();
    const idx = items.findIndex((i) => i._id === activeId);
    const neighbor = items[idx + 1] ?? items[idx - 1];
    const membership = {
      itemId: activeId as Id<"items">,
      spaceId: spaceId as Id<"spaces">,
    };
    try {
      await removeItemFromSpace(membership);
      analytics.capture("item_space_membership_changed", {
        membership_added: false,
        item_id: membership.itemId,
        space_id: membership.spaceId,
        undone: false,
      });
      if (neighbor) {
        listRef.current?.scrollToIndex({
          index: Math.min(idx, items.length - 2),
          animated: true,
        });
        goTo(neighbor._id);
        writeParams(neighbor._id);
      } else if (router.canGoBack()) router.back();
      else router.replace("/(app)/(tabs)/(home)");
    } catch {
      Alert.alert(t("spaces.changeFailed"), t("spaces.changeFailedBody"));
    } finally {
      pending.current = false;
    }
  }, [
    spaceId,
    activeId,
    items,
    listRef,
    goTo,
    writeParams,
    cancelParamWrite,
    removeItemFromSpace,
    router,
  ]);
  return {
    available,
    remove,
    deleteLabel: available ? t("item.deleteEverywhere") : t("common.delete"),
    menuActions: available
      ? [{ label: t("spaces.removeFromSpace"), onPress: remove }]
      : [],
  };
}

function usePagerScroll() {
  const listRef = useRef<FlashListRef<DetailItem>>(null);
  const reducedMotion = useReducedMotion();
  return { listRef, reducedMotion };
}

function ItemScreenContent() {
  const { id, from, spaceId, q } = useLocalSearchParams<{
    id: string;
    from?: string;
    spaceId?: string;
    q?: string;
  }>();
  const router = useRouter();
  const { theme } = useUnistyles();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const deleteItem = useMutation(api.items.deleteItem);
  const markItemOpened = useMutation(api.notifications.markItemOpened);
  const acceptSuggestion = useMutation(api.spaces.acceptSuggestion);
  const dismissSuggestion = useMutation(api.spaces.dismissSuggestion);
  const undoAcceptSuggestion = useMutation(api.spaces.undoAcceptSuggestion);
  const [accepted, setAccepted] = useState<{
    itemId: Id<"items">;
    spaceId: Id<"spaces">;
  } | null>(null);
  const decisionPending = useRef(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const { listRef, reducedMotion } = usePagerScroll();

  const homeFeed = useHomeFeed();
  const spaceQ = useQuery(
    convexQuery(api.spaces.getSpace, spaceQueryArg(from, spaceId)),
  );
  const searchQ = useQuery(
    convexQuery(api.items.searchItems, searchQueryArg(from, q)),
  );

  const { data: single } = useQuery(
    convexQuery(api.items.getItem, { id: id as Id<"items"> }),
  );

  const list = useMemo<DetailItem[] | undefined>(() => {
    if (from === "space") {
      return spaceQ.data
        ? [...spaceQ.data.suggestions, ...spaceQ.data.items]
        : undefined;
    }
    if (from === "search") return searchQ.data;
    // On Android a deep start index in the home pager drew an empty page.
    if (from === "next-up") return undefined;
    return homeFeed.items;
  }, [from, spaceQ.data, searchQ.data, homeFeed.items]);

  const suggestedIds = useMemo(
    () => new Set(spaceQ.data?.suggestions.map((i) => i._id) ?? []),
    [spaceQ.data],
  );

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
    suggestedIds,
    accepted,
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
    if (process.env.EXPO_OS === "ios") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [activeItem]);

  const { findLinks: onFindLinks, disabled: searchDisabled } = useFindLinks(
    activeFull ?? activeItem,
  );

  const openSpaces = useCallback(() => {
    if (!activeItem) return;
    router.push({
      pathname: "/manage-spaces",
      params: { itemId: activeItem._id },
    });
  }, [activeItem, router]);

  const activeIsSuggested =
    from === "space" &&
    !!spaceId &&
    !!activeId &&
    suggestedIds.has(activeId as Id<"items">);

  const onAccept = useCallback(async () => {
    if (!spaceId || !activeId || decisionPending.current) return;
    decisionPending.current = true;
    setDecisionBusy(true);
    if (process.env.EXPO_OS === "ios") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    const membership = {
      itemId: activeId as Id<"items">,
      spaceId: spaceId as Id<"spaces">,
    };
    try {
      const changed = await acceptSuggestion(membership);
      if (changed) {
        analytics.capture("suggestion_accepted");
        setAccepted(membership);
      }
    } catch {
      Alert.alert(t("spaces.addFailed"), t("errors.pleaseRetry"));
    } finally {
      decisionPending.current = false;
      setDecisionBusy(false);
    }
  }, [spaceId, activeId, acceptSuggestion]);

  const undoAccept = async () => {
    if (!accepted || decisionPending.current) return;
    decisionPending.current = true;
    setDecisionBusy(true);
    try {
      const changed = await undoAcceptSuggestion(accepted);
      if (changed) {
        analytics.capture("item_space_membership_changed", {
          item_id: accepted.itemId,
          space_id: accepted.spaceId,
          membership_added: false,
          undone: true,
        });
      }
      setAccepted(null);
    } catch {
      Alert.alert(t("spaces.undoFailed"), t("spaces.undoFailedBody"));
    } finally {
      decisionPending.current = false;
      setDecisionBusy(false);
    }
  };

  const onDismiss = useCallback(async () => {
    if (!spaceId || !activeId || !items) return;
    cancelParamWrite();
    const idx = items.findIndex((i) => i._id === activeId);
    const neighbor = items[idx + 1] ?? items[idx - 1];
    const dismissedId = activeId as Id<"items">;
    if (neighbor) {
      listRef.current?.scrollToIndex({
        index: items.indexOf(neighbor),
        animated: !reducedMotion,
      });
      goTo(neighbor._id);
      writeParams(neighbor._id);
    } else {
      router.back();
    }
    const changed = await dismissSuggestion({
      itemId: dismissedId,
      spaceId: spaceId as Id<"spaces">,
    });
    if (changed) analytics.capture("suggestion_dismissed");
  }, [
    spaceId,
    activeId,
    items,
    dismissSuggestion,
    router,
    goTo,
    writeParams,
    cancelParamWrite,
    listRef,
    reducedMotion,
  ]);

  const onDelete = useCallback(async () => {
    if (!activeItem || !items) return;
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

  const removeFromSpace = useRemoveFromSpace({
    from,
    spaceId,
    activeId,
    space: spaceQ.data,
    items,
    listRef,
    goTo,
    writeParams,
    cancelParamWrite,
  });

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
                      ...(activeItem?.status === "ready"
                        ? [{ label: t("spaces.addItem"), onPress: openSpaces }]
                        : []),
                      { label: t("common.share"), onPress: shareActive },
                      ...(activeItem?.url
                        ? [{ label: t("item.copyLink"), onPress: copyLink }]
                        : []),
                      ...(activeItem?.status === "ready" &&
                      activeItem.type !== "note"
                        ? [
                            {
                              label: t("products.findLinks"),
                              onPress: onFindLinks,
                              disabled: searchDisabled,
                            },
                          ]
                        : []),
                      ...removeFromSpace.menuActions,
                      {
                        label: removeFromSpace.deleteLabel,
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
            {activeItem?.status === "ready" ? (
              <Stack.Toolbar.MenuAction
                icon="rectangle.stack"
                onPress={openSpaces}
              >
                {t("spaces.addItem")}
              </Stack.Toolbar.MenuAction>
            ) : null}
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
            {activeItem?.status === "ready" && activeItem.type !== "note" ? (
              <Stack.Toolbar.MenuAction
                icon="bag"
                onPress={onFindLinks}
                disabled={searchDisabled}
              >
                {t("products.findLinks")}
              </Stack.Toolbar.MenuAction>
            ) : null}
            <Stack.Toolbar.MenuAction
              icon="minus.circle"
              hidden={!removeFromSpace.available}
              onPress={removeFromSpace.remove}
            >
              {t("spaces.removeFromSpace")}
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction
              icon="trash"
              destructive
              onPress={onDelete}
            >
              {removeFromSpace.deleteLabel}
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

      {activeIsSuggested ? (
        <Animated.View
          entering={SlideInDown.duration(250)}
          exiting={FadeOutDown.duration(200)}
          style={[
            styles.decisionBar,
            { bottom: insets.bottom + theme.gap(1.5) },
          ]}
        >
          <Pressable
            onPress={onDismiss}
            disabled={decisionBusy}
            style={styles.dismissWrap}
          >
            <GlassView
              glassEffectStyle="regular"
              isInteractive
              style={styles.decisionButton}
              fallbackStyle={{ backgroundColor: theme.colors.surface }}
            >
              <Text style={styles.dismissText}>{t("common.dismiss")}</Text>
            </GlassView>
          </Pressable>
          <Pressable
            onPress={onAccept}
            disabled={decisionBusy}
            style={styles.acceptWrap}
          >
            <GlassView
              glassEffectStyle="regular"
              isInteractive
              tintColor={theme.colors.primary}
              style={styles.decisionButton}
              fallbackStyle={{ backgroundColor: theme.colors.primary }}
            >
              <AppSymbolIcon
                name="sparkles"
                size={15}
                tintColor={theme.colors.primaryForeground}
              />
              <Text style={styles.acceptText}>{t("spaces.addItem")}</Text>
            </GlassView>
          </Pressable>
        </Animated.View>
      ) : null}
      {acceptedNoticeVisible(
        accepted,
        activeItem,
        activeIsSuggested,
        spaceQ.data,
      ) ? (
        <View
          style={[
            styles.acceptedNotice,
            { bottom: insets.bottom + theme.gap(1.5) },
          ]}
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.acceptedLabel} numberOfLines={2}>
            {t("spaces.addedTo", { space: spaceQ.data?.name ?? "" })}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("spaces.undoAdd")}
            disabled={decisionBusy}
            onPress={undoAccept}
            style={styles.undoButton}
          >
            <Text style={styles.undoText}>{t("common.undo")}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  acceptedNotice: {
    position: "absolute",
    left: theme.gap(2),
    right: theme.gap(2),
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
    paddingHorizontal: theme.gap(1.5),
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  acceptedLabel: {
    flex: 1,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    color: theme.colors.foreground,
  },
  undoButton: {
    minHeight: 44,
    minWidth: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  undoText: {
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    color: theme.colors.primaryText,
  },
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
  decisionBar: {
    position: "absolute",
    left: theme.gap(2),
    right: theme.gap(2),
    flexDirection: "row",
    gap: theme.gap(1),
  },
  dismissWrap: {
    flex: 1,
  },
  acceptWrap: {
    flex: 2,
  },
  decisionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.gap(0.75),
    paddingVertical: theme.gap(1.75),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  dismissText: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  acceptText: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: theme.colors.primaryForeground,
  },
}));
