import type { TextMessageKey } from "@/locales/message-types";
import { formattingLocale, t, useAppLocale } from "@/lib/i18n";
import { SuggestedBadge } from "@/components/suggested-badge";
import { clampRatio } from "@/lib/aspect-ratio";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { displayHost, siteMonogram } from "@/lib/url";
import { shortFormSource } from "@convex/model/externalUrl";
import { socialPost } from "@/lib/social-post";
import type {
  enrichmentValidator,
  failureReasonValidator,
  PostMedia,
} from "@convex/model/itemFields";
import type { Infer } from "convex/values";
import type { Id } from "@convex/_generated/dataModel";
import { Image } from "expo-image";
import { AppSymbolIcon, type AppSymbolName } from "@/components/symbol";
import { Text, View } from "react-native";
import Animated, { useReducedMotion, ZoomOut } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { REDUCED_FADE_IN, REDUCED_FADE_OUT } from "@/lib/motion";
import { StitchRing } from "@/components/ui/stitch-loader";

export type FeedItem = {
  _id: Id<"items">;
  _creationTime?: number;
  fixtureKey?: string;
  type: "image" | "link" | "note";
  status: "processing" | "ready" | "failed";
  title?: string;
  description?: string;
  url?: string;
  siteName?: string;
  author?: string;
  note?: string;
  imageUrl?: string | null;
  heroImageUrl?: string;
  aspectRatio?: number;
  media?: PostMedia[];
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
  Record<FeedItem["type"], TextMessageKey>
> = {
  image_too_large: {
    image: "errors.photoTooLargeTitle",
    link: "errors.photoTooLargeTitle",
    note: "errors.photoTooLargeTitle",
  },
  not_found: {
    image: "errors.photoUnavailableTitle",
    link: "errors.pageNotFoundTitle",
    note: "errors.pageNotFoundTitle",
  },
  error: {
    image: "errors.readPhotoTitle",
    link: "errors.itemFailedTitle",
    note: "errors.itemFailedTitle",
  },
};

function failureLabel(item: FeedItem): string | undefined {
  if (item.status !== "failed") return;
  return t(FAILURE_LABELS[item.failureReason ?? "error"][item.type]);
}
// Everything that can name a card, best first. A failed save has no AI title,
// so without its failure label the card is blank forever and indistinguishable
// from one still processing.
export function cardTitles(item: FeedItem): (string | undefined)[] {
  return [
    item.title,
    item.note,
    failureLabel(item),
    item.url ? displayHost(item.url) : undefined,
  ];
}

/**
 * What a card without a picture prints on its face. A link shows its summary
 * and a note its own words, in the display face, with the title in the
 * caption under it like a photo card. Until both exist (still reading, or the
 * save failed) the face carries whichever names the save best and the
 * caption leaves the title out, so it never prints twice.
 */
export function textFaceCopy(
  item: FeedItem,
  failedLabel?: string,
): { body: string; captionTitle?: string } {
  const words = item.type === "note" ? item.note : item.description;
  if (item.title && words) return { body: words, captionTitle: item.title };
  return {
    body: item.title ?? words ?? failedLabel ?? displayHost(item.url),
  };
}

// The mark on a text face when there is no site letter to show.
const FACE_SYMBOL = {
  image: "photo.stack",
  link: "link",
  note: "square.and.pencil",
} as const satisfies Record<FeedItem["type"], AppSymbolName>;

// Standard OpenGraph image shape (1200×630), the default when a link's real
// hero dimensions weren't captured.
const OG_RATIO = 1.91;

type UnistylesTheme = ReturnType<typeof useUnistyles>["theme"];

function CardMedia({
  item,
  failedLabel,
  theme,
}: {
  item: FeedItem;
  failedLabel?: string;
  theme: UnistylesTheme;
}) {
  const imageUri = item.imageUrl ?? item.heroImageUrl;
  const social = socialPost(item);
  const isVideo = social?.playable === true;
  const mediaCount = item.media?.length ?? 0;
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
                0.5,
                2,
              ),
            },
          ]}
        />
        {(isVideo || mediaCount > 1) && (
          <View style={styles.mediaBadges} pointerEvents="none">
            {isVideo ? (
              <View style={styles.mediaBadge}>
                <AppSymbolIcon name="play.fill" size={9} tintColor="white" />
                {item.author ? (
                  <Text style={styles.mediaBadgeText} numberOfLines={1}>
                    {item.author}
                  </Text>
                ) : null}
              </View>
            ) : (
              <View />
            )}
            {mediaCount > 1 ? (
              <View style={[styles.mediaBadge, styles.countBadge]}>
                <AppSymbolIcon name="photo.stack" size={10} tintColor="white" />
                <Text style={styles.mediaBadgeText}>
                  {new Intl.NumberFormat(formattingLocale()).format(mediaCount)}
                </Text>
              </View>
            ) : null}
          </View>
        )}
      </View>
    );
  }
  // No picture: the site's letter (or a note's pencil) over the save's own
  // words, so the tile reads as designed rather than still loading.
  const monogram = item.type === "link" ? siteMonogram(item.url) : undefined;
  return (
    <View style={[styles.textFace, item.type === "note" && styles.noteFace]}>
      <View style={styles.faceMark}>
        {monogram === undefined ? (
          <AppSymbolIcon
            name={FACE_SYMBOL[item.type]}
            size={11}
            tintColor={theme.colors.primaryText}
          />
        ) : (
          <Text
            style={styles.faceMonogram}
            maxFontSizeMultiplier={1}
            accessible={false}
          >
            {monogram}
          </Text>
        )}
      </View>
      <Text style={styles.textFaceBody} numberOfLines={5}>
        {textFaceCopy(item, failedLabel).body}
      </Text>
    </View>
  );
}

function CardCaption({
  item,
  captionTitle,
  menuActions,
  theme,
}: {
  item: FeedItem;
  captionTitle: string | undefined;
  menuActions: ActionMenuItem[];
  theme: UnistylesTheme;
}) {
  return (
    <View style={styles.caption}>
      <View style={styles.captionText}>
        {captionTitle !== undefined ? (
          <Text style={styles.captionTitle} numberOfLines={1}>
            {captionTitle}
          </Text>
        ) : null}
        {item.type === "link" && item.url ? (
          <View style={styles.captionHostRow}>
            <Text style={styles.captionHost} numberOfLines={1}>
              {shortFormSource(item.url)?.site ?? displayHost(item.url)}
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
        label={t("item.actions")}
        title={t("item.actions")}
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

function CardStatusCorner({
  item,
  theme,
}: {
  item: FeedItem;
  theme: UnistylesTheme;
}) {
  return (
    <Animated.View
      entering={REDUCED_FADE_IN}
      exiting={REDUCED_FADE_OUT}
      collapsable={false}
      style={styles.processing}
    >
      {item.status === "processing" ? (
        <StitchRing size={16} />
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
/**
 * The visual body of a feed card: media, caption, suggested badge and status
 * corner. Plain props only, so it renders anywhere; `ItemCard` wraps it with
 * navigation and the save's actions.
 */
export function ItemCardFace({
  item,
  menuActions,
  suggested,
  onAcceptSuggestion,
  pressed,
}: {
  item: FeedItem;
  menuActions: ActionMenuItem[];
  suggested?: boolean;
  onAcceptSuggestion?: () => void;
  pressed?: boolean;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  const reducedMotion = useReducedMotion();
  const failedLabel = failureLabel(item);
  // Under a picture the caption names the save; under a text face it names it
  // only when the face shows other words (see textFaceCopy).
  const hasMedia = Boolean(item.imageUrl ?? item.heroImageUrl);
  const captionTitle = hasMedia
    ? cardTitles(item).find((title) => title !== undefined)
    : textFaceCopy(item, failedLabel).captionTitle;
  return (
    <View
      style={[
        styles.card,
        item.isSticker && styles.cardSticker,
        pressed && { opacity: 0.85 },
      ]}
    >
      <CardMedia item={item} failedLabel={failedLabel} theme={theme} />
      <CardCaption
        item={item}
        captionTitle={captionTitle}
        menuActions={menuActions}
        theme={theme}
      />

      {suggested && (
        // The badge pops off with a spring when the suggestion resolves
        // (accepted here or anywhere else: the prop flip unmounts it).
        <Animated.View
          exiting={
            reducedMotion
              ? REDUCED_FADE_OUT
              : ZoomOut.springify().damping(14).stiffness(300)
          }
          style={styles.suggestedBadge}
        >
          <SuggestedBadge onPress={onAcceptSuggestion} />
        </Animated.View>
      )}

      {(item.status === "processing" || item.status === "failed") && (
        <CardStatusCorner item={item} theme={theme} />
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  // Stickers are transparent die-cut PNGs. Let the drop shadow spill past the
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
    backgroundColor: theme.colors.frame,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    padding: theme.gap(0.5),
    boxShadow: `0 0 4px 0 ${theme.colors.imageBorder}`,
  },
  mediaBadges: {
    position: "absolute",
    left: theme.gap(1.25),
    right: theme.gap(1.25),
    bottom: theme.gap(1.25),
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
  },
  mediaBadge: {
    flexShrink: 1,
    maxWidth: "80%",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 50,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  countBadge: {
    flexShrink: 0,
  },
  mediaBadgeText: {
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
    minHeight: 112,
    gap: theme.gap(1.25),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  noteFace: {
    backgroundColor: theme.colors.primarySoft,
  },
  faceMark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.background,
  },
  faceMonogram: {
    fontFamily: theme.fonts.display,
    fontSize: 14,
    lineHeight: 17,
    color: theme.colors.primaryText,
  },
  textFaceBody: {
    ...theme.type.displaySmall,
    lineHeight: 22,
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
    ...theme.type.captionStrong,
    lineHeight: 15,
    color: theme.colors.foreground,
  },
  captionHostRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  captionHost: {
    flexShrink: 1,
    ...theme.type.finePrint,
    fontFamily: theme.fonts.medium,
    lineHeight: 14,
    color: theme.colors.muted,
  },
  // 44pt touch target; the negative margin keeps the caption's footprint at 40
  // so the grid rhythm does not change.
  menuButton: {
    width: 44,
    height: 44,
    margin: -2,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
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
