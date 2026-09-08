import { EmptyState } from '@/components/empty-state';
import { HeaderActionMenu } from '@/components/ui/header-icon-button';
import { ScreenLoader } from '@/components/ui/screen-loader';
import { ItemDetail, type DetailItem } from '@/components/item-detail';
import { ItemHeader } from '@/components/item-header';
import { convexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { FlashList, type FlashListRef, type ViewToken } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { useMutation } from 'convex/react';
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import { GlassView } from '@/components/glass';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  Share,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import { AppSymbolIcon } from '@/components/symbol';
import Animated, { FadeOutDown, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { analytics } from '@/lib/analytics';
import { useFindLinks } from '@/lib/use-find-links';
import { useItemOpen } from '@/lib/use-item-open';

export default function ItemScreen() {
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
  const [accepted, setAccepted] = useState<{ itemId: Id<'items'>; spaceId: Id<'spaces'> } | null>(null);
  const decisionPending = useRef(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const listRef = useRef<FlashListRef<DetailItem>>(null);

  // Rebuild the ordered sibling list from whichever list the user opened from.
  // Each of these queries is already warm in the cache from the source screen,
  // so this is a cache read, not a network round-trip.
  // Conditional queries use the 'skip' sentinel, not `enabled`: a disabled
  // React Query still subscribes through the Convex adapter, and an invalid
  // arg (e.g. an empty-string id) throws ArgumentValidationError on every
  // socket reconnect, which the server answers by closing the WebSocket.
  const listQ = useQuery(
    convexQuery(
      api.items.listItems,
      from !== 'space' && from !== 'search' ? {} : 'skip',
    ),
  );
  const spaceQ = useQuery(
    convexQuery(
      api.spaces.getSpace,
      from === 'space' && spaceId ? { id: spaceId as Id<'spaces'> } : 'skip',
    ),
  );
  const searchQ = useQuery(
    convexQuery(api.items.searchItems, from === 'search' && q ? { query: q } : 'skip'),
  );

  // A single-item fallback for deep links (no source) or a stale list that no
  // longer contains this id.
  const { data: single } = useQuery(
    convexQuery(api.items.getItem, { id: id as Id<'items'> }),
  );

  // Mirror the space screen's feed order exactly (suggestions first, then
  // saved) so swiping pages through what the user saw in the grid.
  const list = useMemo<DetailItem[] | undefined>(() => {
    if (from === 'space') {
      return spaceQ.data
        ? [...spaceQ.data.suggestions, ...spaceQ.data.items]
        : undefined;
    }
    if (from === 'search') return searchQ.data;
    return listQ.data;
  }, [from, spaceQ.data, searchQ.data, listQ.data]);

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

  const markOpened = useCallback(({ itemId }: { itemId: string }) =>
    markItemOpened({ itemId: itemId as Id<'items'> }), [markItemOpened]);
  useItemOpen(activeItem, from ?? 'direct', markOpened);

  // A link shares its URL; a saved image/sticker shares the picture itself.
  // `expo-sharing` needs a local file, so the remote image is cached first.
  const shareActive = useCallback(async () => {
    if (!activeItem) return;

    let shared = false;
    let shareSheetOnly = false;
    try {
      if (activeItem.type === 'note') {
        const message = activeItem.note ?? activeItem.content ?? activeItem.description ?? activeItem.title;
        if (!message) return;
        const result = await Share.share({ message });
        shared = result.action !== Share.dismissedAction;
      } else if (!activeItem.imageUrl) {
        if (!activeItem.url) return;
        const result = await Share.share({ url: activeItem.url });
        shared = result.action !== Share.dismissedAction;
      } else if (!(await Sharing.isAvailableAsync())) {
        if (!activeItem.url) return;
        const result = await Share.share({ url: activeItem.url });
        shared = result.action !== Share.dismissedAction;
      } else {
        const ext = activeItem.isSticker ? 'png' : 'jpg';
        const file = new File(Paths.cache, `${activeItem._id}.${ext}`);
        if (file.exists) file.delete();
        await File.downloadFileAsync(activeItem.imageUrl, file);
        await Sharing.shareAsync(file.uri, {
          mimeType: activeItem.isSticker ? 'image/png' : 'image/jpeg',
          UTI: activeItem.isSticker ? 'public.png' : 'public.jpeg',
          dialogTitle: activeItem.title ?? 'Share',
        });
        shared = true;
        shareSheetOnly = true;
      }
    } catch {
      // User cancelled the sheet, or the download/share failed — nothing to do.
    }

    if (shared) {
      analytics.capture('item_shared');
      analytics.itemAction(activeItem, shareSheetOnly ? 'share_sheet_opened' : 'share');
    }
  }, [activeItem]);

  const copyLink = useCallback(async () => {
    if (!activeItem?.url) return;
    await Clipboard.setStringAsync(activeItem.url);
    analytics.capture('item_link_copied');
    analytics.itemAction(activeItem, 'copy');
    if (process.env.EXPO_OS === 'ios') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [activeItem]);

  const { findLinks: onFindLinks, disabled: searchDisabled } = useFindLinks(activeItem);

  // Suggested items (opened from a space) trade the normal footer for an
  // Add / Dismiss decision bar. Accepting keeps the page open — the bar just
  // drops away as the suggestion becomes a real membership.
  const activeIsSuggested =
    from === 'space' &&
    !!spaceId &&
    !!activeId &&
    suggestedIds.has(activeId as Id<'items'>);

  const onAccept = useCallback(async () => {
    if (!spaceId || !activeId || decisionPending.current) return;
    decisionPending.current = true;
    setDecisionBusy(true);
    if (process.env.EXPO_OS === 'ios') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    const membership = { itemId: activeId as Id<'items'>, spaceId: spaceId as Id<'spaces'> };
    try {
      const changed = await acceptSuggestion(membership);
      if (changed) {
        analytics.capture('suggestion_accepted');
        setAccepted(membership);
      }
    } catch {
      Alert.alert("Couldn't add to space", 'Please try again.');
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
      await undoAcceptSuggestion(accepted);
      analytics.capture('item_space_membership_changed', {
        item_id: accepted.itemId, space_id: accepted.spaceId, membership_added: false, undone: true,
      });
      setAccepted(null);
    } catch {
      Alert.alert("Couldn't undo", 'The save is still in this Space. Please try again.');
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
    const dismissedId = activeId as Id<'items'>;
    if (neighbor) {
      listRef.current?.scrollToIndex({ index: items.indexOf(neighbor), animated: true });
      setActiveId(neighbor._id);
      router.setParams({ id: neighbor._id });
    } else {
      router.back();
    }
    const changed = await dismissSuggestion({
      itemId: dismissedId,
      spaceId: spaceId as Id<'spaces'>,
    });
    if (changed) analytics.capture('suggestion_dismissed');
  }, [spaceId, activeId, items, dismissSuggestion, router]);

  const onDelete = useCallback(async () => {
    if (!activeItem || !items) return;
    if (paramTimer.current) clearTimeout(paramTimer.current);
    const idx = items.findIndex((item) => item._id === activeItem._id);
    const neighbor = items[idx + 1] ?? items[idx - 1];
    try {
      await deleteItem({ id: activeItem._id });
      analytics.capture('item_deleted');
      if (neighbor) {
        setActiveId(neighbor._id);
        router.setParams({ id: neighbor._id });
        listRef.current?.scrollToIndex({ index: Math.min(idx, items.length - 2), animated: true });
      } else if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch {
      Alert.alert("Couldn't delete save", 'Please try again in a moment.');
    }
  }, [activeItem, items, deleteItem, router]);

  if (items === undefined) {
    return (
      <ScreenLoader label="Opening save" />
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.loading}>
        <EmptyState title="Gone" message="This save no longer exists." />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerBackButtonDisplayMode: 'minimal',
          ...(Platform.OS === 'android'
            ? {
                headerRight: () => (
                  <HeaderActionMenu
                    icon="ellipsis"
                    label="Save actions"
                    title={activeItem?.title ?? activeItem?.note ?? 'Save actions'}
                    actions={[
                      { label: 'Share', onPress: shareActive },
                      ...(activeItem?.url ? [{ label: 'Copy link', onPress: copyLink }] : []),
                      ...(activeItem?.status === 'ready'
                        ? [{ label: 'Find links', onPress: onFindLinks, disabled: searchDisabled }]
                        : []),
                      { label: 'Delete', destructive: true, onPress: onDelete },
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
      {Platform.OS === 'ios' ? <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu icon="ellipsis">
          <Stack.Toolbar.MenuAction icon="square.and.arrow.up" onPress={shareActive}>
            Share
          </Stack.Toolbar.MenuAction>
          {activeItem?.url ? (
            <Stack.Toolbar.MenuAction icon="doc.on.doc" onPress={copyLink}>
              Copy link
            </Stack.Toolbar.MenuAction>
          ) : null}
          {activeItem?.status === 'ready' ? (
            <Stack.Toolbar.MenuAction icon="bag" onPress={onFindLinks} disabled={searchDisabled}>
              Find links
            </Stack.Toolbar.MenuAction>
          ) : null}
          <Stack.Toolbar.MenuAction icon="trash" destructive onPress={onDelete}>
            Delete
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar> : null}


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
      />

      {activeIsSuggested ? (
        // SlideInDown (not a fade) so the bar never mounts at opacity 0 — a
        // GlassView whose parent starts fully transparent silently fails to
        // render the liquid glass (expo/expo#41024).
        <Animated.View
          entering={SlideInDown.duration(250)}
          exiting={FadeOutDown.duration(200)}
          style={[styles.decisionBar, { bottom: insets.bottom + theme.gap(1.5) }]}
        >
          <Pressable onPress={onDismiss} disabled={decisionBusy} style={styles.dismissWrap}>
            <GlassView
              glassEffectStyle="regular"
              isInteractive
              style={styles.decisionButton}
              fallbackStyle={{ backgroundColor: theme.colors.surface }}
            >
              <Text style={styles.dismissText}>Dismiss</Text>
            </GlassView>
          </Pressable>
          <Pressable onPress={onAccept} disabled={decisionBusy} style={styles.acceptWrap}>
            <GlassView
              glassEffectStyle="regular"
              isInteractive
              tintColor={theme.colors.primary}
              style={styles.decisionButton}
              fallbackStyle={{ backgroundColor: theme.colors.primary }}
            >
              <AppSymbolIcon name="sparkles" size={15} tintColor="#fff" />
              <Text style={styles.acceptText}>Add to space</Text>
            </GlassView>
          </Pressable>
        </Animated.View>
      ) : null}
      {!activeIsSuggested && accepted?.itemId === activeItem?._id && spaceQ.data?.items.some((item) => item._id === accepted?.itemId) ? (
        <View style={[styles.acceptedNotice, { bottom: insets.bottom + theme.gap(1.5) }]} accessibilityLiveRegion="polite">
          <Text style={styles.acceptedLabel} numberOfLines={2}>Added to {spaceQ.data?.name ?? 'space'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Undo add to space" disabled={decisionBusy} onPress={undoAccept} style={styles.undoButton}>
            <Text style={styles.undoText}>Undo</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  acceptedNotice: {
    position: 'absolute', left: theme.gap(2), right: theme.gap(2),
    flexDirection: 'row', alignItems: 'center', gap: theme.gap(1),
    paddingHorizontal: theme.gap(1.5), backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border,
  },
  acceptedLabel: { flex: 1, fontFamily: theme.fonts.medium, fontSize: 14, color: theme.colors.foreground },
  undoButton: { minHeight: 44, minWidth: 60, alignItems: 'center', justifyContent: 'center' },
  undoText: { fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.primaryText },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
  decisionBar: {
    position: 'absolute',
    left: theme.gap(2),
    right: theme.gap(2),
    flexDirection: 'row',
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.gap(0.75),
    paddingVertical: theme.gap(1.75),
    borderRadius: theme.radius.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  dismissText: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  acceptText: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: '#fff',
  },
}));
