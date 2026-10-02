import type { DetailItem } from "@/components/item-detail";
import { ItemSourceLink, openItemSource } from "@/components/item-source-link";
import { PostMediaButton } from "@/components/post-media-button";
import { AppSymbolIcon } from "@/components/symbol";
import { t, useAppLocale } from "@/lib/i18n";
import { fitMedia, MEDIA_CANVAS } from "@/lib/media-viewer";
import type { SocialPost } from "@/lib/social-post";
import { Image } from "expo-image";
import { setStatusBarStyle } from "expo-status-bar";
import { Link } from "expo-router";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// Reads as a caption over any photo: clear across the picture's middle, dark
// enough under the text for white type, eased so the fade has no edge.
const CAPTION_SCRIM = `linear-gradient(180deg, ${[
  "rgba(0, 0, 0, 0) 0%",
  "rgba(0, 0, 0, 0.4) 25%",
  "rgba(0, 0, 0, 0.72) 55%",
  "rgba(0, 0, 0, 0.85) 100%",
].join(", ")})`;

// Clearance for the Add / Dismiss bar and the "added to" notice the pager
// pins over the bottom of the page.
const FOOTER_CLEARANCE = 72;

// How close the sheet's top comes to the header's bottom edge before the
// header switches to the light page's colors (and twice that to switch back).
const HEADER_SLACK = 16;

type Props = {
  item: DetailItem;
  social: SocialPost | undefined;
  heroUri: string;
  isZoomTarget: boolean;
  // The page's own height (the pager's), so the stage fills it exactly.
  pageHeight: number;
  // How far the transparent iOS header reaches into the page; 0 on Android.
  headerInset: number;
  // Leave room for the pager's bottom bar on this page.
  reserveFooter: boolean;
  scrollRef: RefObject<ScrollView | null>;
  // Told when the details sheet reaches (true) or leaves (false) the header,
  // so the pager can hand the header back its light-page colors.
  onSheetUnderHeader?: (itemId: string, under: boolean) => void;
  testID?: string;
  // Save status (processing, failed, retry) shown in the caption.
  notice: ReactNode;
  // The item's action chips.
  actions: ReactNode;
  // Everything else about the save, in the sheet below the stage.
  details: ReactNode;
};

/**
 * A photo or social post shown the way a camera roll or reel shows it: the
 * picture fills a black stage the height of the page, with its caption over a
 * scrim at the bottom. Tapping the picture hides the caption; a video poster
 * opens the post instead, because the app cannot play it. Scrolling up brings
 * the rest of the save (spaces, tags, caption, products, similar) in on a
 * sheet.
 */
export function MediaViewerPage({
  item,
  social,
  heroUri,
  isZoomTarget,
  pageHeight,
  headerInset,
  reserveFooter,
  scrollRef,
  onSheetUnderHeader,
  testID,
  notice,
  actions,
  details,
}: Props) {
  useAppLocale();
  const { theme } = useUnistyles();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Keyed by item: FlashList recycles this page for other saves, which must
  // open with their caption showing and collapsed.
  const [hiddenFor, setHiddenFor] = useState<string | null>(null);
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const captionHidden = hiddenFor === item._id;
  const expanded = expandedFor === item._id;

  // Reports only when the sheet crosses the header, with some slack, so a
  // scroll doesn't push header options every frame. A recycled page starts
  // at the top, so it reports its new item as clear of the header.
  const sheetUnder = useRef(false);
  useEffect(() => {
    sheetUnder.current = false;
    onSheetUnderHeader?.(item._id, false);
  }, [item._id, onSheetUnderHeader]);
  const sheetTop = pageHeight - headerInset;
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const under = sheetUnder.current
      ? y > sheetTop - HEADER_SLACK * 2
      : y > sheetTop - HEADER_SLACK;
    if (under === sheetUnder.current) return;
    sheetUnder.current = under;
    onSheetUnderHeader?.(item._id, under);
  };

  const captionStyle = useAnimatedStyle(
    () => ({
      opacity: withTiming(captionHidden ? 0 : 1, { duration: 200 }),
    }),
    [captionHidden],
  );

  const aspect =
    item.aspectRatio ??
    (social?.playable ? 9 / 16 : item.type === "link" ? 1.91 : 1.4);
  const mediaSize = fitMedia(aspect, width, pageHeight);

  const image = (
    <Image
      source={{ uri: heroUri }}
      recyclingKey={item._id}
      contentFit="contain"
      // The frame stays visible when the picture fails to load, so the
      // stage never reads as empty.
      style={[mediaSize, styles.media]}
    />
  );
  const video = social?.playable && item.url ? social : undefined;
  const hero = video ? (
    <PostMediaButton
      site={video.site}
      playable
      onPress={() => {
        // The pager's light status bar would sit white-on-white over the
        // in-app browser; hand it back once the browser closes.
        setStatusBarStyle("dark");
        openItemSource(item, () => setStatusBarStyle("light"));
      }}
    >
      {image}
    </PostMediaButton>
  ) : (
    image
  );

  const stageMedia = isZoomTarget ? (
    <Link.AppleZoomTarget>{hero}</Link.AppleZoomTarget>
  ) : (
    hero
  );

  const extraCount = social ? Math.max((item.media?.length ?? 0) - 1, 0) : 0;
  const title = item.title || item.note;

  return (
    <ScrollView
      ref={scrollRef}
      testID={testID}
      style={styles.scroll}
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator={false}
      directionalLockEnabled
      onScroll={onScroll}
      scrollEventThrottle={32}
    >
      <View style={{ height: pageHeight }}>
        {video ? (
          // A video poster is itself the button that opens the post, so the
          // stage around it stays plain: wrapping it in the caption toggle
          // would hide that button from VoiceOver.
          <View style={styles.stage}>{stageMedia}</View>
        ) : (
          <Pressable
            style={styles.stage}
            accessibilityRole="button"
            accessibilityLabel={title || t("item.photo")}
            accessibilityHint={t("item.toggleCaption")}
            onPress={() => setHiddenFor(captionHidden ? null : item._id)}
          >
            {stageMedia}
          </Pressable>
        )}

        <Animated.View
          pointerEvents={captionHidden ? "none" : "box-none"}
          // A hidden caption leaves the accessibility tree too.
          accessibilityElementsHidden={captionHidden}
          importantForAccessibility={
            captionHidden ? "no-hide-descendants" : "auto"
          }
          style={[
            styles.caption,
            captionStyle,
            {
              paddingBottom:
                insets.bottom +
                theme.gap(1.5) +
                (reserveFooter ? FOOTER_CLEARANCE : 0),
              // Built here, not in the stylesheet: Unistyles drops a
              // stylesheet's experimental_backgroundImage on theme change
              // (jpudysz/react-native-unistyles#1030).
              experimental_backgroundImage: CAPTION_SCRIM,
            },
          ]}
        >
          {notice}

          {item.url ? (
            <ItemSourceLink
              item={item}
              icon={social?.playable ? "play.rectangle" : "safari"}
              iconSize={14}
              arrowSize={10}
              iconTintColor={WHITE_SOFT}
              arrowTintColor={WHITE_FAINT}
              label={
                social && item.author
                  ? `${item.author} · ${social.site}`
                  : undefined
              }
              style={styles.sourceRow}
              textStyle={styles.sourceText}
            />
          ) : null}

          {title ? (
            <Text style={styles.title} numberOfLines={3}>
              {title}
            </Text>
          ) : null}

          {item.description ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() => setExpandedFor(expanded ? null : item._id)}
              hitSlop={6}
            >
              <Text
                style={styles.description}
                numberOfLines={expanded ? undefined : 2}
              >
                {item.description}
              </Text>
            </Pressable>
          ) : null}

          {actions}

          <View style={styles.footerRow}>
            {extraCount > 0 ? (
              <View
                style={styles.countPill}
                accessible
                accessibilityLabel={t("item.moreMedia", {
                  count: extraCount,
                })}
              >
                <AppSymbolIcon name="photo.stack" size={13} tintColor="white" />
                <Text style={styles.countText}>{`+${extraCount}`}</Text>
              </View>
            ) : (
              <View />
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("item.details")}
              hitSlop={8}
              onPress={() =>
                scrollRef.current?.scrollTo({
                  y: pageHeight - headerInset,
                  animated: true,
                })
              }
              style={({ pressed }) => [
                styles.detailsButton,
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <AppSymbolIcon name="chevron.up" size={12} tintColor="white" />
              <Text style={styles.detailsText}>{t("item.details")}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>

      <View
        style={[
          styles.sheet,
          {
            // At least tall enough to scroll up to the header, so the
            // caption leaves the screen instead of parking under it.
            minHeight: pageHeight - headerInset,
            paddingBottom: insets.bottom + theme.gap(4),
          },
        ]}
      >
        <View style={styles.grabber} />
        {details}
      </View>
    </ScrollView>
  );
}

// Keeps white caption type readable where a light photo shows through the
// top of the scrim.
const CAPTION_SHADOW = {
  textShadowColor: "rgba(0, 0, 0, 0.45)",
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 6,
};

const WHITE_SOFT = "rgba(255, 255, 255, 0.86)";
const WHITE_FAINT = "rgba(255, 255, 255, 0.6)";

const styles = StyleSheet.create((theme) => ({
  scroll: {
    flex: 1,
    backgroundColor: MEDIA_CANVAS,
  },
  media: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  caption: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: theme.gap(1.25),
    paddingTop: theme.gap(8),
    paddingHorizontal: theme.gap(2),
  },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    maxWidth: "100%",
    gap: 6,
  },
  sourceText: {
    flexShrink: 1,
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    color: WHITE_SOFT,
  },
  title: {
    ...CAPTION_SHADOW,
    fontFamily: theme.fonts.display,
    fontSize: 26,
    lineHeight: 31,
    color: "white",
  },
  description: {
    ...CAPTION_SHADOW,
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: WHITE_SOFT,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  countPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 50,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
  },
  countText: {
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    color: "white",
  },
  detailsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 44,
    paddingHorizontal: theme.gap(0.5),
  },
  detailsText: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: "white",
  },
  sheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    borderCurve: "continuous",
    paddingTop: theme.gap(1.5),
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 5,
    borderRadius: 3,
    marginBottom: theme.gap(3),
    backgroundColor: theme.colors.border,
  },
}));
