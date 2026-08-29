import { SuggestedBadge } from '@/components/suggested-badge';
import {
  ActionMenu,
  type ActionMenuItem,
} from '@/components/ui/action-menu';
import { memo } from 'react';
import { displayHost } from '@/lib/url';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { useMutation } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { AppSymbolIcon } from '@/components/symbol';
import { Alert, ActivityIndicator, Pressable, Share, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useReducedMotion,
  ZoomOut,
} from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import {
  EASE_OUT,
  REDUCED_FADE_IN,
  REDUCED_FADE_OUT,
} from '@/lib/motion';

export type FeedItem = {
  _id: Id<'items'>;
  type: 'image' | 'link' | 'note';
  status: 'processing' | 'ready' | 'failed';
  title?: string;
  url?: string;
  siteName?: string;
  note?: string;
  imageUrl?: string | null;
  heroImageUrl?: string;
  aspectRatio?: number;
  isSticker?: boolean;
  failureReason?: 'not_found' | 'error';
  enrichment?: 'partial';
  tags: string[];
  // Suggested this item into the current space; it isn't a member
  // until the user accepts. Only ever set by the space screen.
  suggested?: boolean;
};

// Describes which list a card belongs to, so the detail screen can rebuild the
// same ordered sibling set for horizontal swipe-paging.
export type ItemSource =
  | { from: 'home' }
  | { from: 'space'; spaceId: string }
  | { from: 'search'; q: string };

// Standard OpenGraph image shape (1200×630) — the default when a link's real
// hero dimensions weren't captured.
const OG_RATIO = 1.91;

const PROCESSING_ENTER = FadeIn.duration(150).easing(EASE_OUT);
const PROCESSING_EXIT = FadeOut.duration(150).easing(EASE_OUT);

function clampRatio(ratio: number | undefined, fallback: number) {
  const value = ratio && !Number.isNaN(ratio) ? ratio : fallback;
  // Preserve the true aspect ratio so previews aren't cropped; only bound
  // pathological extremes so one very tall/wide image can't hijack a column.
  return Math.min(Math.max(value, 0.5), 2);
}

// Memoized: feed rows are the highest-churn surface in the app (every live-query
// tick and parent re-render touches the list), so skip re-renders when a row's
// `item` ref is unchanged.
export const ItemCard = memo(function ItemCard({ item, source }: { item: FeedItem; source?: ItemSource }) {
  const { theme } = useUnistyles();
  const reducedMotion = useReducedMotion();
  const deleteItem = useMutation(api.items.deleteItem);
  const acceptSuggestion = useMutation(api.spaces.acceptSuggestion);
  const dismissSuggestion = useMutation(api.spaces.dismissSuggestion);
  const removeItemFromSpace = useMutation(api.spaces.removeItemFromSpace);

  const spaceId =
    source?.from === 'space' ? (source.spaceId as Id<'spaces'>) : undefined;
  const isSuggested = item.suggested === true && spaceId !== undefined;

  const imageUri = item.imageUrl ?? item.heroImageUrl;
  // A failed save has no AI title, so without this the card is blank forever and
  // indistinguishable from one still processing.
  const failedLabel =
    item.status === 'failed'
      ? item.failureReason === 'not_found'
        ? 'Page not found'
        : "Couldn't be saved"
      : undefined;
  const captionTitle =
    item.title ?? item.note ?? failedLabel ?? (item.url ? displayHost(item.url) : undefined);

  // The primary accept gesture: tap the sparkle, the item is in. The badge's
  // exit animation is the confirmation — no navigation, no dialog.
  const accept = () => {
    if (spaceId === undefined) return;
    if (process.env.EXPO_OS === 'ios') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    acceptSuggestion({ itemId: item._id, spaceId });
  };

  const dismiss = () => {
    if (spaceId === undefined) return;
    dismissSuggestion({ itemId: item._id, spaceId });
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete this save?',
      'This removes it from Shelvr and every space. This can\u2019t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteItem({ id: item._id }),
        },
      ],
    );
  };

  const menuActions: ActionMenuItem[] = [];
  if (isSuggested) {
    menuActions.push({ label: 'Add to space', onPress: accept });
    menuActions.push({
      label: 'Dismiss suggestion',
      destructive: true,
      onPress: dismiss,
    });
  } else {
    if (item.url) {
      menuActions.push({
        label: 'Share',
        onPress: () => Share.share({ url: item.url! }),
      });
    }
    if (spaceId !== undefined) {
      menuActions.push({
        label: 'Remove from space',
        onPress: () => removeItemFromSpace({ itemId: item._id, spaceId }),
      });
    }
    menuActions.push({
      label: 'Delete',
      destructive: true,
      onPress: confirmDelete,
    });
  }

  return (
    <Animated.View
      entering={reducedMotion ? undefined : FadeIn.duration(300)}
      style={styles.cell}
    >
      <Link
        href={{ pathname: '/item/[id]', params: { id: item._id, ...source } }}
        asChild
      >
        <Link.Trigger withAppleZoom>
          <Pressable
            style={({ pressed }) => [
              styles.card,
              item.isSticker && styles.cardSticker,
              pressed && { opacity: 0.85 },
            ]}
          >
            {imageUri ? (
              <View style={!item.isSticker && styles.imageContainer}>
                <Image
                  source={{ uri: imageUri }}
                  recyclingKey={item._id}
                  transition={200}
                  contentFit={item.isSticker ? 'contain' : 'cover'}
                  style={[
                    item.isSticker ? styles.sticker : styles.image,
                    { aspectRatio: clampRatio(item.aspectRatio, item.type === 'link' ? OG_RATIO : 1) },
                  ]}
                />
              </View>
            ) : (
              <View style={[styles.textFace, item.type === 'note' && styles.noteFace]}>
                {item.type === 'link' && (
                  <AppSymbolIcon
                    name="link"
                    size={13}
                    tintColor={theme.colors.faint}
                    style={{ marginBottom: 6 }}
                  />
                )}
                <Text style={styles.textFaceTitle} numberOfLines={5}>
                  {item.title ?? item.note ?? failedLabel ?? displayHost(item.url)}
                </Text>
              </View>
            )}

            <View style={styles.caption}>
              <View style={styles.captionText}>
                <Text style={styles.captionTitle} numberOfLines={1}>
                  {captionTitle}
                </Text>
                {item.type === 'link' && item.url ? (
                  <View style={styles.captionHostRow}>
                    <Text style={styles.captionHost} numberOfLines={1}>
                      {displayHost(item.url)}
                    </Text>
                    <AppSymbolIcon
                      name="arrow.up.right"
                      size={9}
                      tintColor={theme.colors.faint}
                    />
                  </View>
                ) : null}
              </View>
              <ActionMenu
                label="Save actions"
                title="Save actions"
                actions={menuActions}
                style={styles.menuButton}
              >
                <AppSymbolIcon name="ellipsis" size={15} tintColor={theme.colors.foreground} />
              </ActionMenu>
            </View>

            {isSuggested && (
              // The badge pops off with a spring when the suggestion resolves
              // (accepted here or anywhere else — the prop flip unmounts it).
              <Animated.View
                exiting={
                  reducedMotion
                    ? REDUCED_FADE_OUT
                    : ZoomOut.springify().damping(14).stiffness(300)
                }
                style={styles.suggestedBadge}
              >
                <SuggestedBadge onPress={accept} />
              </Animated.View>
            )}

            {(item.status === 'processing' || item.status === 'failed') && (
              // One corner slot for the transient states: a spinner while the
              // pipeline runs, a warning once it has failed.
              <Animated.View
                entering={reducedMotion ? REDUCED_FADE_IN : PROCESSING_ENTER}
                exiting={reducedMotion ? REDUCED_FADE_OUT : PROCESSING_EXIT}
                collapsable={false}
                style={styles.processing}
              >
                {item.status === 'processing' ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <AppSymbolIcon
                    name="exclamationmark.triangle.fill"
                    size={13}
                    tintColor={theme.colors.danger}
                  />
                )}
              </Animated.View>
            )}
          </Pressable>
        </Link.Trigger>
        <Link.Preview />
        <Link.Menu>
          {isSuggested ? (
            <>
              <Link.MenuAction title="Add to space" icon="plus" onPress={accept} />
              <Link.MenuAction
                title="Dismiss suggestion"
                icon="xmark"
                destructive
                onPress={dismiss}
              />
            </>
          ) : (
            <>
              {item.url ? (
                <Link.MenuAction
                  title="Share"
                  icon="square.and.arrow.up"
                  onPress={() => Share.share({ url: item.url! })}
                />
              ) : null}
              {spaceId !== undefined ? (
                <Link.MenuAction
                  title="Remove from space"
                  icon="tray.and.arrow.up"
                  onPress={() => removeItemFromSpace({ itemId: item._id, spaceId })}
                />
              ) : null}
              <Link.MenuAction
                title="Delete"
                icon="trash"
                destructive
                onPress={confirmDelete}
              />
            </>
          )}
        </Link.Menu>
      </Link>
    </Animated.View>
  );
});

const styles = StyleSheet.create((theme) => ({
  cell: {
    padding: 4,
  },
  card: {
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  // Stickers are transparent die-cut PNGs — let the drop shadow spill past the
  // tile bounds instead of being clipped by the card's overflow.
  cardSticker: {
    overflow: 'visible',
  },
  image: {
    borderRadius: theme.radius.sm,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surfaceMuted,
  },

  imageContainer: {
    backgroundColor: 'white',
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    padding: theme.gap(0.5),
    boxShadow: `0 0 4px 0 ${theme.colors.imageBorder}`,

  },
  // No fill / border / rounding: the white die-cut edge is baked into the PNG.
  // The iOS layer shadow is cast from the image's opaque pixels, so it hugs the
  // silhouette rather than a rectangle.
  sticker: {
    width: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  textFace: {
    padding: theme.gap(1.5),
    minHeight: 96,
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surfaceMuted,
  },
  noteFace: {
    backgroundColor: theme.colors.primarySoft,
  },
  textFaceTitle: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.foreground,
  },
  caption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.gap(0.5),
    paddingHorizontal: theme.gap(0.5),
    paddingTop: theme.gap(0.75),
  },
  captionText: {
    flex: 1,
    gap: 2,
  },
  captionTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 10,
    lineHeight: 12,
    color: theme.colors.foreground,
  },
  captionHostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  captionHost: {
    flexShrink: 1,
    fontFamily: theme.fonts.bold,
    fontSize: 10,
    lineHeight: 12,
    color: theme.colors.muted,
  },
  menuButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  suggestedBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
  },
  processing: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: 50,
    padding: 5,
    boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
  },
}));
