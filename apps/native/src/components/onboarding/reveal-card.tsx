import type { FeedItem } from "@/components/item-card";
import type { RevealPiece } from "@/lib/reveal-pieces";
import { t, useAppLocale } from "@/lib/i18n";
import { EASE_OUT, REDUCED_FADE_IN } from "@/lib/motion";
import { displayHost } from "@/lib/url";
import { Image } from "expo-image";
import { useEffect, useRef } from "react";
import { Text, View } from "react-native";
import Animated, {
  FadeInDown,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type LayoutAnimation,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// The onboarding reveal's own card. It deliberately does NOT reuse ItemCard:
// the feed card is memoized, tappable and whole, while this one arrives in
// pieces. Radius, surfaces and chip shapes are matched to ItemCard so the
// recap on the ready step reads as the same object.

// Standard OpenGraph image shape, the default when a link's real hero
// dimensions were not captured.
const OG_RATIO = 1.91;

const PIECE_ENTER = FadeInDown.duration(320).easing(EASE_OUT);

// Chips are small and land late, so they pop from slightly under size rather
// than travelling like the image and the title above them.
const CHIP_ENTER = (): LayoutAnimation => {
  "worklet";
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.85 }] },
    animations: {
      opacity: withTiming(1, { duration: 160 }),
      transform: [{ scale: withSpring(1, { damping: 12, stiffness: 240 }) }],
    },
  };
};

function clampRatio(ratio: number | undefined): number {
  const value = ratio && !Number.isNaN(ratio) ? ratio : OG_RATIO;
  return Math.min(Math.max(value, 0.5), 2);
}

export function RevealCard({
  item,
  pieces,
  revealedCount,
}: {
  item: FeedItem;
  pieces: RevealPiece[];
  revealedCount: number;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  const reducedMotion = useReducedMotion();
  const enter = reducedMotion ? REDUCED_FADE_IN : PIECE_ENTER;
  const chipEnter = reducedMotion ? REDUCED_FADE_IN : CHIP_ENTER;

  // The last piece landing is the moment the save is done, so the whole card
  // takes one soft bump and warms its border once, then never again.
  const settled = pieces.length > 0 && revealedCount >= pieces.length;
  const pulse = useSharedValue(1);
  const glow = useSharedValue(0);
  const thunked = useRef(false);
  const restColor = theme.colors.border;
  const warmColor = theme.colors.primary;
  useEffect(() => {
    if (!settled || reducedMotion || thunked.current) return;
    thunked.current = true;
    pulse.value = withSequence(
      withSpring(1.02, { damping: 12, stiffness: 260 }),
      withSpring(1, { damping: 14, stiffness: 200 }),
    );
    glow.value = withSequence(
      withTiming(1, { duration: 220, easing: EASE_OUT }),
      withTiming(0, { duration: 380, easing: EASE_OUT }),
    );
  }, [settled, reducedMotion, pulse, glow]);
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    borderColor: interpolateColor(glow.value, [0, 1], [restColor, warmColor]),
  }));

  const shown = pieces.slice(0, revealedCount);
  const imageUri = item.heroImageUrl ?? item.imageUrl;
  const tags = shown.flatMap((piece) =>
    piece.kind === "tag" ? [piece.tag] : [],
  );
  const destination = shown.find(
    (piece) => piece.kind === "space" || piece.kind === "inbox",
  );
  const host = item.url ? displayHost(item.url) : undefined;
  const siteLabel = item.siteName ?? host;

  return (
    <Animated.View style={[styles.card, cardStyle]}>
      {imageUri && shown.some((piece) => piece.kind === "image") ? (
        <Animated.View entering={enter} style={styles.imageFrame}>
          <Image
            source={{ uri: imageUri }}
            recyclingKey={item._id}
            transition={200}
            contentFit="cover"
            style={[
              styles.image,
              { aspectRatio: clampRatio(item.aspectRatio) },
            ]}
          />
        </Animated.View>
      ) : null}

      {shown.some((piece) => piece.kind === "title") ? (
        <Animated.View entering={enter} style={styles.caption}>
          <Text style={styles.captionTitle} numberOfLines={2}>
            {item.title ?? host ?? t("item.untitled")}
          </Text>
          {siteLabel ? (
            <Text style={styles.captionHost} numberOfLines={1}>
              {siteLabel}
            </Text>
          ) : null}
        </Animated.View>
      ) : null}

      {tags.length > 0 ? (
        <View style={styles.tagRow}>
          {tags.map((tag, index) => (
            <Animated.View
              key={`${index}-${tag}`}
              entering={chipEnter}
              style={styles.tagChip}
            >
              <Text style={styles.tagLabel}>{tag}</Text>
            </Animated.View>
          ))}
        </View>
      ) : null}

      {destination ? (
        // The row itself is static so the chip's pop scales about the chip's
        // own centre instead of the full-width row's.
        <View style={styles.destinationRow}>
          {destination.kind === "space" ? (
            <Animated.View entering={chipEnter} style={styles.destinationChip}>
              <Text style={styles.destinationText}>
                {t("demo.filedInto", { space: destination.name })}
              </Text>
            </Animated.View>
          ) : (
            <Animated.Text entering={enter} style={styles.shelfLine}>
              {t("demo.onShelf")}
            </Animated.Text>
          )}
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    gap: theme.gap(1.5),
    padding: theme.gap(1.5),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  imageFrame: {
    backgroundColor: "white",
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    padding: theme.gap(0.5),
    boxShadow: `0 0 4px 0 ${theme.colors.imageBorder}`,
  },
  image: {
    borderRadius: theme.radius.sm,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  caption: {
    gap: 3,
  },
  captionTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 17,
    lineHeight: 22,
    color: theme.colors.foreground,
  },
  captionHost: {
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    lineHeight: 15,
    color: theme.colors.muted,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.gap(0.75),
  },
  tagChip: {
    backgroundColor: theme.colors.surfaceMuted,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 50,
  },
  tagLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.muted,
  },
  destinationRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  destinationChip: {
    backgroundColor: theme.colors.primarySoft,
    paddingVertical: theme.gap(0.75),
    paddingHorizontal: theme.gap(1.5),
    borderRadius: 50,
  },
  destinationText: {
    fontFamily: theme.fonts.bold,
    fontSize: 13,
    color: theme.colors.primaryText,
  },
  shelfLine: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.muted,
  },
}));
