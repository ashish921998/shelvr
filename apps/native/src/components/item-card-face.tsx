import type { TextMessageKey } from "@/locales/message-types";
import { formattingLocale, t, useAppLocale } from "@/lib/i18n";
import { SuggestedBadge } from "@/components/suggested-badge";
import { clampRatio, letterboxedVideoRatio } from "@/lib/aspect-ratio";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { displayHost, siteMonogram } from "@/lib/url";
import { shortFormSource } from "@convex/model/externalUrl";
import { socialPost } from "@/lib/social-post";
import type {
  enrichmentValidator,
  failureReasonValidator,
  intentValidator,
  PostMedia,
} from "@convex/model/itemFields";
import type { Infer } from "convex/values";
import type { Id } from "@convex/_generated/dataModel";
import { Image } from "expo-image";
import { AppSymbolIcon, type AppSymbolName } from "@/components/symbol";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
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
  intents?: Infer<typeof intentValidator>[];
  tags: string[];
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
export function cardTitles(item: FeedItem): (string | undefined)[] {
  return [
    item.title,
    item.note,
    failureLabel(item),
    item.url ? displayHost(item.url) : undefined,
  ];
}

export function textFaceCopy(
  item: FeedItem,
  failedLabel?: string,
): { body: string; captionTitle?: string } {
  const title = item.title || undefined;
  const words =
    (item.type === "note"
      ? afterOwnHeading(item.note, title)
      : item.description) || undefined;
  if (title && words) return { body: words, captionTitle: title };
  const name = item.type === "note" ? item.note || title : (title ?? words);
  return { body: name ?? failedLabel ?? displayHost(item.url) };
}

const NOTE_TITLE_CUT = 80;

const FILLER_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "my",
  "of",
  "the",
  "to",
]);

function headingWords(text: string): Set<string> {
  const words = text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(
    words.filter((word) => word.length > 1 && !FILLER_WORDS.has(word)),
  );
}

function afterOwnHeading(
  note: string | undefined,
  title: string | undefined,
): string | undefined {
  if (!note || !title) return note;
  const [first = "", ...rest] = note.trim().split("\n");
  const line = first.trim();
  const cut = title.trim();
  if (
    line.length > NOTE_TITLE_CUT &&
    line.slice(0, NOTE_TITLE_CUT).trim() === cut
  ) {
    return undefined;
  }
  const heading = headingWords(line);
  const named = headingWords(title);
  const same =
    line === cut ||
    (heading.size > 0 &&
      heading.size === named.size &&
      [...heading].every((word) => named.has(word)));
  return same ? rest.join("\n").trim() || undefined : note;
}

/**
 * A text face with nothing to caption carries its menu in its top corner, so
 * the card does not end in a row holding only the ellipsis.
 */
export function menuSitsOnFace(item: FeedItem, suggested?: boolean): boolean {
  return (
    !(item.imageUrl ?? item.heroImageUrl) &&
    textFaceCopy(item, failureLabel(item)).captionTitle === undefined &&
    !(item.type === "link" && item.url) &&
    !suggested &&
    item.status === "ready"
  );
}

const FACE_SYMBOL = {
  image: "photo.stack",
  link: "link",
  note: "square.and.pencil",
} as const satisfies Record<FeedItem["type"], AppSymbolName>;

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
              aspectRatio:
                letterboxedVideoRatio(item.url, item.aspectRatio) ??
                clampRatio(
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
  const hostRow = item.type === "link" && Boolean(item.url);
  return (
    <View style={styles.caption}>
      <View style={styles.captionText}>
        {captionTitle !== undefined ? (
          <Text style={styles.captionTitle} numberOfLines={1}>
            {captionTitle}
          </Text>
        ) : null}
        {hostRow ? (
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
      <CardMenu
        menuActions={menuActions}
        theme={theme}
        style={[styles.menuButton, !hostRow && styles.menuOnTitle]}
      />
    </View>
  );
}

function CardMenu({
  menuActions,
  theme,
  style,
}: {
  menuActions: ActionMenuItem[];
  theme: UnistylesTheme;
  style: StyleProp<ViewStyle>;
}) {
  return (
    <ActionMenu
      label={t("item.actions")}
      title={t("item.actions")}
      actions={menuActions}
      style={style}
    >
      <AppSymbolIcon
        name="ellipsis"
        size={15}
        tintColor={theme.colors.foreground}
      />
    </ActionMenu>
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
  const hasMedia = Boolean(item.imageUrl ?? item.heroImageUrl);
  const captionTitle = hasMedia
    ? cardTitles(item).find((title) => title !== undefined)
    : textFaceCopy(item, failedLabel).captionTitle;
  const menuOnFace = menuSitsOnFace(item, suggested);
  return (
    <View
      style={[
        styles.card,
        item.isSticker && styles.cardSticker,
        pressed && { opacity: 0.85 },
      ]}
    >
      <CardMedia item={item} failedLabel={failedLabel} theme={theme} />
      {menuOnFace ? (
        <View style={styles.menuOnFace}>
          <CardMenu
            menuActions={menuActions}
            theme={theme}
            style={styles.menuButton}
          />
        </View>
      ) : (
        <CardCaption
          item={item}
          captionTitle={captionTitle}
          menuActions={menuActions}
          theme={theme}
        />
      )}

      {suggested && (
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
    justifyContent: "space-between",
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
  menuButton: {
    width: 44,
    height: 44,
    margin: -2,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
  },
  menuOnTitle: {
    paddingBottom: 25,
  },
  menuOnFace: {
    position: "absolute",
    top: 2,
    right: 2,
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
