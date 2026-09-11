import { SuggestedBadge } from "@/components/suggested-badge";
import { analytics } from "@/lib/analytics";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { memo } from "react";
import { displayHost } from "@/lib/url";
import { isTikTokUrl } from "@convex/model/externalUrl";
import {
  enrichmentValidator,
  failureReasonValidator,
} from "@convex/model/itemFields";
import type { Infer } from "convex/values";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Link, useRouter } from "expo-router";
import { AppSymbolIcon } from "@/components/symbol";
import {
  Alert,
  ActivityIndicator,
  Pressable,
  Share,
  Text,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  useReducedMotion,
  ZoomOut,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { EASE_OUT, REDUCED_FADE_IN, REDUCED_FADE_OUT } from "@/lib/motion";

export type FeedItem = {
  _id: Id<"items">;
  _creationTime?: number;
  fixtureKey?: string;
  type: "image" | "link" | "note";
  status: "processing" | "ready" | "failed";
  title?: string;
  url?: string;
  siteName?: string;
  author?: string;
  note?: string;
  imageUrl?: string | null;
  heroImageUrl?: string;
  aspectRatio?: number;
  isSticker?: boolean;
  failureReason?: Infer<typeof failureReasonValidator>;
  enrichment?: Infer<typeof enrichmentValidator>;
  tags: string[];
  // Suggested this item into the current space; it isn't a member
  // until the user accepts. Only ever set by the space screen.
  suggested?: boolean;
};

const FAILURE_LABELS: Record<
  NonNullable<FeedItem["failureReason"]>,
  Record<FeedItem["type"], string>
> = {
  image_too_large: {
    image: "Photo too large",
    link: "Photo too large",
    note: "Photo too large",
  },
  not_found: {
    image: "Photo unavailable",
    link: "Page not found",
    note: "Page not found",
  },
  error: {
    image: "Couldn't read photo",
    link: "Couldn't be saved",
    note: "Couldn't be saved",
  },
};

function failureLabel(item: FeedItem): string | undefined {
  if (item.status !== "failed") return;
  return FAILURE_LABELS[item.failureReason ?? "error"][item.type];
}

// Describes which list a card belongs to, so the detail screen can rebuild the
// same ordered sibling set for horizontal swipe-paging.
export type ItemSource =
  | { from: "home" }
  | { from: "space"; spaceId: string }
  | { from: "search"; q: string };

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

// In-card action menu; mirrors CardLinkMenu (the iOS long-press context menu).
function cardMenuActions({
  isSuggested,
  hasUrl,
  isReady,
  accept,
  dismiss,
  share,
  changeSpaces,
  confirmDelete,
}: {
  isSuggested: boolean;
  hasUrl: boolean;
  isReady: boolean;
  accept: () => void;
  dismiss: () => void;
  share: () => void;
  changeSpaces: () => void;
  confirmDelete: () => void;
}): ActionMenuItem[] {
  if (isSuggested) {
    return [
      { label: "Add to space", onPress: accept },
      { label: "Dismiss suggestion", destructive: true, onPress: dismiss },
    ];
  }
  const actions: ActionMenuItem[] = [];
  if (hasUrl) {
    actions.push({ label: "Share", onPress: share });
  }
  if (isReady) {
    actions.push({ label: "Change spaces", onPress: changeSpaces });
  }
  actions.push({ label: "Delete", destructive: true, onPress: confirmDelete });
  return actions;
}

// The card face: a framed image or video poster when one exists, otherwise
// the text face (title/note/failure/host), so a failed or text save still
// renders a usable tile.
function CardMedia({
  item,
  failedLabel,
}: {
  item: FeedItem;
  failedLabel?: string;
}) {
  const { theme } = useUnistyles();
  const imageUri = item.imageUrl ?? item.heroImageUrl;
  // Video saves get a 9:16 poster with a play badge and the creator handle.
  const isVideo = item.type === "link" && isTikTokUrl(item.url);
  if (imageUri) {
    return (
      <View style={!item.isSticker && styles.imageContainer}>
        <Image
          source={{ uri: imageUri }}
          recyclingKey={item._id}
          transition={200}
          contentFit={item.isSticker ? "contain" : "cover"}
          style={[
            item.isSticker ? styles.sticker : styles.image,
            {
              aspectRatio: clampRatio(
                item.aspectRatio,
                isVideo ? 9 / 16 : item.type === "link" ? OG_RATIO : 1,
              ),
            },
          ]}
        />
        {isVideo && (
          <View style={styles.videoBadge}>
            <AppSymbolIcon name="play.fill" size={9} tintColor="white" />
            {item.author ? (
              <Text style={styles.videoBadgeText} numberOfLines={1}>
                {item.author}
              </Text>
            ) : null}
          </View>
        )}
      </View>
    );
  }
  return (
    <View style={[styles.textFace, item.type === "note" && styles.noteFace]}>
      {item.type === "link" && (
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
  );
}

function CardCaption({
  item,
  captionTitle,
  menuActions,
}: {
  item: FeedItem;
  captionTitle: string | undefined;
  menuActions: ActionMenuItem[];
}) {
  const { theme } = useUnistyles();
  return (
    <View style={styles.caption}>
      <View style={styles.captionText}>
        <Text style={styles.captionTitle} numberOfLines={1}>
          {captionTitle}
        </Text>
        {item.type === "link" && item.url ? (
          <View style={styles.captionHostRow}>
            <Text style={styles.captionHost} numberOfLines={1}>
              {item.siteName === "TikTok" ? "TikTok" : displayHost(item.url)}
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
        <AppSymbolIcon
          name="ellipsis"
          size={15}
          tintColor={theme.colors.foreground}
        />
      </ActionMenu>
    </View>
  );
}

// One corner slot for the transient states: a spinner while the pipeline
// runs, a warning once it has failed.
function CardStatusCorner({ item }: { item: FeedItem }) {
  const { theme } = useUnistyles();
  const reducedMotion = useReducedMotion();
  if (item.status !== "processing" && item.status !== "failed") {
    return null;
  }
  return (
    <Animated.View
      entering={reducedMotion ? REDUCED_FADE_IN : PROCESSING_ENTER}
      exiting={reducedMotion ? REDUCED_FADE_OUT : PROCESSING_EXIT}
      collapsable={false}
      style={styles.processing}
    >
      {item.status === "processing" ? (
        <ActivityIndicator size="small" color={theme.colors.primary} />
      ) : (
        <AppSymbolIcon
          name="exclamationmark.triangle.fill"
          size={13}
          tintColor={theme.colors.danger}
        />
      )}
    </Animated.View>
  );
}

// iOS long-press context menu; mirrors the in-card ActionMenu.
function CardLinkMenu({
  item,
  isSuggested,
  accept,
  dismiss,
  share,
  changeSpaces,
  confirmDelete,
}: {
  item: FeedItem;
  isSuggested: boolean;
  accept: () => void;
  dismiss: () => void;
  share: () => void;
  changeSpaces: () => void;
  confirmDelete: () => void;
}) {
  if (isSuggested) {
    return (
      <>
        <Link.MenuAction title="Add to space" icon="plus" onPress={accept} />
        <Link.MenuAction
          title="Dismiss suggestion"
          icon="xmark"
          destructive
          onPress={dismiss}
        />
      </>
    );
  }
  return (
    <>
      {item.url ? (
        <Link.MenuAction
          title="Share"
          icon="square.and.arrow.up"
          onPress={share}
        />
      ) : null}
      {item.status === "ready" ? (
        <Link.MenuAction
          title="Change spaces"
          icon="tray.and.arrow.up"
          onPress={changeSpaces}
        />
      ) : null}
      <Link.MenuAction
        title="Delete"
        icon="trash"
        destructive
        onPress={confirmDelete}
      />
    </>
  );
}

// Memoized: feed rows are the highest-churn surface in the app (every live-query
// tick and parent re-render touches the list), so skip re-renders when a row's
// `item` ref is unchanged.
export const ItemCard = memo(function ItemCard({
  item,
  source,
}: {
  item: FeedItem;
  source?: ItemSource;
}) {
  const reducedMotion = useReducedMotion();
  const router = useRouter();
  const deleteItem = useMutation(api.items.deleteItem);
  const acceptSuggestion = useMutation(api.spaces.acceptSuggestion);
  const dismissSuggestion = useMutation(api.spaces.dismissSuggestion);

  const spaceId =
    source?.from === "space" ? (source.spaceId as Id<"spaces">) : undefined;
  const isSuggested = item.suggested === true && spaceId !== undefined;
  const changeSpaces = () =>
    router.push({ pathname: "/manage-spaces", params: { itemId: item._id } });
  const share = async () => {
    if (!item.url) return;
    try {
      const result = await Share.share({ url: item.url });
      if (
        result.action === Share.sharedAction &&
        item._creationTime !== undefined
      ) {
        analytics.itemAction(
          { ...item, _creationTime: item._creationTime },
          "share",
        );
      }
    } catch {
      // A dismissed or failed share is not a completed action.
    }
  };

  // A failed save has no AI title, so without this the card is blank forever and
  // indistinguishable from one still processing.
  const failedLabel = failureLabel(item);
  const captionTitle =
    item.title ??
    item.note ??
    failedLabel ??
    (item.url ? displayHost(item.url) : undefined);

  // The primary accept gesture: tap the sparkle, the item is in. The badge's
  // exit animation is the confirmation — no navigation, no dialog.
  const accept = () => {
    if (spaceId === undefined) return;
    if (process.env.EXPO_OS === "ios") {
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
      "Delete this save?",
      "This removes it from Shelvr and every space. This can\u2019t be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteItem({ id: item._id }),
        },
      ],
    );
  };

  const menuActions = cardMenuActions({
    isSuggested,
    hasUrl: item.url !== undefined,
    isReady: item.status === "ready",
    accept,
    dismiss,
    share,
    changeSpaces,
    confirmDelete,
  });

  return (
    <Animated.View
      entering={reducedMotion ? undefined : FadeIn.duration(300)}
      style={styles.cell}
    >
      <Link
        href={{ pathname: "/item/[id]", params: { id: item._id, ...source } }}
        asChild
      >
        <Link.Trigger withAppleZoom>
          <Pressable
            testID={
              item.fixtureKey ? `fixture-item-${item.fixtureKey}` : undefined
            }
            style={({ pressed }) => [
              styles.card,
              item.isSticker && styles.cardSticker,
              pressed && { opacity: 0.85 },
            ]}
          >
            <CardMedia item={item} failedLabel={failedLabel} />
            <CardCaption
              item={item}
              captionTitle={captionTitle}
              menuActions={menuActions}
            />

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

            <CardStatusCorner item={item} />
          </Pressable>
        </Link.Trigger>
        <Link.Preview />
        <CardLinkMenu
          item={item}
          isSuggested={isSuggested}
          accept={accept}
          dismiss={dismiss}
          share={share}
          changeSpaces={changeSpaces}
          confirmDelete={confirmDelete}
        />
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
    borderCurve: "continuous",
    overflow: "hidden",
  },
  // Stickers are transparent die-cut PNGs — let the drop shadow spill past the
  // tile bounds instead of being clipped by the card's overflow.
  cardSticker: {
    overflow: "visible",
  },
  image: {
    borderRadius: theme.radius.sm,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },

  imageContainer: {
    backgroundColor: "white",
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    padding: theme.gap(0.5),
    boxShadow: `0 0 4px 0 ${theme.colors.imageBorder}`,
  },
  videoBadge: {
    position: "absolute",
    left: theme.gap(1.25),
    bottom: theme.gap(1.25),
    maxWidth: "80%",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 50,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  videoBadgeText: {
    flexShrink: 1,
    fontFamily: theme.fonts.bold,
    fontSize: 10,
    lineHeight: 12,
    color: "white",
  },
  // No fill / border / rounding: the white die-cut edge is baked into the PNG.
  // The iOS layer shadow is cast from the image's opaque pixels, so it hugs the
  // silhouette rather than a rectangle.
  sticker: {
    width: "100%",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  textFace: {
    padding: theme.gap(1.5),
    minHeight: 96,
    justifyContent: "center",
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
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
    flexDirection: "row",
    alignItems: "flex-start",
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
    flexDirection: "row",
    alignItems: "center",
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
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  suggestedBadge: {
    position: "absolute",
    top: 10,
    right: 10,
  },
  processing: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: 50,
    padding: 5,
    boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
  },
}));
