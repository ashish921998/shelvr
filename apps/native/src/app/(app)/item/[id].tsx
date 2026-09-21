import { t, useAppLocale } from "@/lib/i18n";
import { EmptyState } from "@/components/empty-state";
import { HeaderActionMenu } from "@/components/ui/header-icon-button";
import { ScreenLoader } from "@/components/ui/screen-loader";
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
import * as Clipboard from "expo-clipboard";
import { GlassView } from "@/components/glass";
import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { AppSymbolIcon } from "@/components/symbol";
import { ProgressiveBlurHeader } from "progressive-blur";
import Animated, { FadeOutDown, SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { analytics } from "@/lib/analytics";
import { useFindLinks } from "@/lib/use-find-links";
import { useHomeFeed } from "@/lib/home-feed";
import { useItemOpen } from "@/lib/use-item-open";
import { useItemShare } from "@/lib/use-item-share";

// Conditional queries use the 'skip' sentinel, not `enabled`: a disabled
// React Query still subscribes through the Convex adapter, and an invalid
// arg (e.g. an empty-string id) throws ArgumentValidationError on every
// socket reconnect, which the server answers by closing the WebSocket.
function spaceQueryArg(
  from?: string,
  spaceId?: string,
): "skip" | { id: Id<"spaces"> } {
  return from === "space" && spaceId ? { id: spaceId as Id<"spaces"> } : "skip";
}

function searchQueryArg(from?: string, q?: string): "skip" | { query: string } {
  return from === "search" && q ? { query: q } : "skip";
}

// The undo notice shows only while the accepted item is really a member of
// this space — the accept may have raced a swipe away or an unmount.
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

// The pager shows the feed's loaded pages, so swiping toward their end must
// fetch the next one just as scrolling the feed does; otherwise a swipe that
// started on page one stops at its last item.
function pagerEndReached(
  items: DetailItem[] | undefined,
  homeFeed: ReturnType<typeof useHomeFeed>,
): (() => void) | undefined {
  return items === homeFeed.items && homeFeed.canLoadMore
    ? homeFeed.loadMore
    : undefined;
}

export default function ItemScreen() {
  useAppLocale();
  return <ItemScreenContent />;
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
  const listRef = useRef<FlashListRef<DetailItem>>(null);

  // Rebuild the ordered sibling list from whichever list the user opened from.
  // The home feed is paginated and shared through HomeFeedProvider, so every
  // page the user scrolled to is already here; the other two queries are warm
  // in the cache from the source screen. Either way this is a cache read, not
  // a network round-trip.
  // Conditional queries use the 'skip' sentinel, not `enabled`: a disabled
  // React Query still subscribes through the Convex adapter, and an invalid
  // arg (e.g. an empty-string id) throws ArgumentValidationError on every
  // socket reconnect, which the server answers by closing the WebSocket.
  const homeFeed = useHomeFeed();
  const spaceQ = useQuery(
    convexQuery(api.spaces.getSpace, spaceQueryArg(from, spaceId)),
  );
  const searchQ = useQuery(
    convexQuery(api.items.searchItems, searchQueryArg(from, q)),
  );

  // A single-item fallback for deep links (no source) or a stale list that no
  // longer contains this id.
  const { data: single } = useQuery(
    convexQuery(api.items.getItem, { id: id as Id<"items"> }),
  );

  // Mirror the space screen's feed order exactly (suggestions first, then
  // saved) so swiping pages through what the user saw in the grid.
  const list = useMemo<DetailItem[] | undefined>(() => {
    if (from === "space") {
      return spaceQ.data
        ? [...spaceQ.data.suggestions, ...spaceQ.data.items]
        : undefined;
    }
    if (from === "search") return searchQ.data;
    return homeFeed.items;
  }, [from, spaceQ.data, searchQ.data, homeFeed.items]);

  const suggestedIds = useMemo(
    () => new Set(spaceQ.data?.suggestions.map((i) => i._id) ?? []),
    [spaceQ.data],
  );

  const startIndex = list ? list.findIndex((i) => i._id === id) : -1;

  // Prefer the sibling list when it contains this item; otherwise page over the
  // single item alone. `undefined` means we're still loading.
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

  // The id the screen was pushed with owns the Apple-zoom target; captured once
  // so swiping (which rewrites the `id` param) never re-pairs the transition.
  const [pushedId] = useState(id);
  const [activeId, setActiveId] = useState(id);

  // Keeping the route `id` param in sync writes navigation state, which
  // re-renders the entire native-stack tree — a ~16ms cascade profiled as the
  // single most expensive JS event per swipe. `activeId` (local state) already
  // drives the header/toolbar/actions, so only the deep-link/restore URL needs
  // the param. Debounce it so a run of swipes writes once, after it settles,
  // instead of paying the cascade on every page.
  const paramTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onViewable = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<DetailItem>[] }) => {
      const first = viewableItems[0]?.item as DetailItem | undefined;
      if (!first) return;
      setActiveId(first._id);
      if (paramTimer.current) clearTimeout(paramTimer.current);
      paramTimer.current = setTimeout(() => {
        router.setParams({ id: first._id });
      }, 350);
    },
    [router],
  );
  useEffect(
    () => () => {
      if (paramTimer.current) clearTimeout(paramTimer.current);
    },
    [],
  );
  const viewabilityConfig = useMemo(
    () => ({ itemVisiblePercentThreshold: 60 }),
    [],
  );

  // Stable so an ItemScreen re-render (setActiveId on every swipe) doesn't hand
  // FlashList a fresh renderItem/style and force every mounted page to re-render.
  const pageStyle = useMemo(() => ({ width, height }), [width, height]);
  const keyExtractor = useCallback((item: DetailItem) => item._id, []);
  const renderItem = useCallback(
    ({ item }: { item: DetailItem }) => (
      // Each page is bounded to the screen so the inner vertical ScrollView
      // has a fixed height to scroll within (rather than growing to fit).
      <View style={pageStyle}>
        <ItemDetail item={item} isZoomTarget={item._id === pushedId} />
      </View>
    ),
    [pageStyle, pushedId],
  );

  const activeItem = items?.find((i) => i._id === activeId) ?? items?.[0];

  // List rows are card-shaped (no article body, no shopping status), so the
  // toolbar reads those from getItem. `single` follows the debounced `id`
  // param and can lag a swipe, hence the identity check.
  const activeFull =
    single && single._id === activeItem?._id ? single : undefined;

  const markOpened = useCallback(
    ({ itemId }: { itemId: string }) =>
      markItemOpened({ itemId: itemId as Id<"items"> }),
    [markItemOpened],
  );
  useItemOpen(activeItem, from ?? "direct", markOpened);

  // A link shares its URL; a saved image/sticker shares the picture itself.
  // Prefers the full getItem row when it has caught up, so link saves can use
  // the extracted article content a card row does not carry.
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

  // Same picker the inline control opens, so membership behavior (and the
  // formSheet presentation) is identical whichever entry point is used.
  const openSpaces = useCallback(() => {
    if (!activeItem) return;
    router.push({
      pathname: "/manage-spaces",
      params: { itemId: activeItem._id },
    });
  }, [activeItem, router]);

  // Suggested items (opened from a space) trade the normal footer for an
  // Add / Dismiss decision bar. Accepting keeps the page open — the bar just
  // drops away as the suggestion becomes a real membership.
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
    // Cancel any pending debounced setParams so it doesn't revert the
    // immediate param write below to the just-dismissed item.
    if (paramTimer.current) clearTimeout(paramTimer.current);
    // The dismissed item leaves the space's list; slide to a neighbour first,
    // mirroring delete, so the pager never lands on a vanished page.
    const idx = items.findIndex((i) => i._id === activeId);
    const neighbor = items[idx + 1] ?? items[idx - 1];
    const dismissedId = activeId as Id<"items">;
    if (neighbor) {
      listRef.current?.scrollToIndex({
        index: items.indexOf(neighbor),
        animated: true,
      });
      setActiveId(neighbor._id);
      router.setParams({ id: neighbor._id });
    } else {
      router.back();
    }
    const changed = await dismissSuggestion({
      itemId: dismissedId,
      spaceId: spaceId as Id<"spaces">,
    });
    if (changed) analytics.capture("suggestion_dismissed");
  }, [spaceId, activeId, items, dismissSuggestion, router]);

  const onDelete = useCallback(async () => {
    if (!activeItem || !items) return;
    if (paramTimer.current) clearTimeout(paramTimer.current);
    const idx = items.findIndex((item) => item._id === activeItem._id);
    const neighbor = items[idx + 1] ?? items[idx - 1];
    try {
      await deleteItem({ id: activeItem._id });
      analytics.capture("item_deleted", { item_type: activeItem.type });
      if (neighbor) {
        setActiveId(neighbor._id);
        router.setParams({ id: neighbor._id });
        listRef.current?.scrollToIndex({
          index: Math.min(idx, items.length - 2),
          animated: true,
        });
      } else if (router.canGoBack()) router.back();
      else router.replace("/");
    } catch {
      Alert.alert(t("item.deleteFailed"), t("errors.retrySoon"));
    }
  }, [activeItem, items, deleteItem, router]);

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
          ...(Platform.OS === "android"
            ? {
                // Android has no progressive-blur band, so a transparent
                // header leaves scrolled content running through the title
                // text. Give the toolbar the opaque treatment the space
                // screen uses; content then starts below it natively.
                headerTransparent: false,
                headerStyle: { backgroundColor: theme.colors.background },
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
        <ItemHeader item={activeItem} />
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
        data={items}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={keyExtractor}
        initialScrollIndex={startIndex >= 0 ? startIndex : 0}
        renderItem={renderItem}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={viewabilityConfig}
        onEndReached={onEndReached}
        onEndReachedThreshold={2}
      />

      {/* A pinned blur band behind the transparent iOS header: without it,
          scrolled article text and photos pass right through the header's
          title and date. Android has no blur band, so it gets the opaque
          toolbar below instead.

          This header stacks a title over a date, filling the band down to its
          bottom edge, so the default fade (which dissolves inside the band)
          would leave that text in front of barely-blurred content. Carry the
          blur across the whole band and land the fade where the reader
          layout's content begins — the same gap(1.5) — so nothing at rest is
          hazed. */}
      <ProgressiveBlurHeader fadePastHeader={theme.gap(1.5)} />

      {activeIsSuggested ? (
        // SlideInDown (not a fade) so the bar never mounts at opacity 0 — a
        // GlassView whose parent starts fully transparent silently fails to
        // render the liquid glass (expo/expo#41024).
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
  // Shared glass surface for both decision buttons. No backgroundColor/border —
  // the liquid glass provides the material; the CTA sets it via tintColor.
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
