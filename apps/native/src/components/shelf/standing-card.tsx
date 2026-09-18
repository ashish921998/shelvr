// A save, standing on a shelf. The card is the object: a white matte around
// the image, leaning a degree or so, with its own shadow pooled underneath and
// its type mark stuck to the top-left corner.
//
// It drops in rather than fading: 800ms from 26px above, then a short squash
// as it settles, which is what makes it read as a thing landing on a board.

import { memo, useEffect } from "react";
import { Image } from "expo-image";
import { Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import type { SharedValue } from "react-native-reanimated";
import { SuggestedBadge } from "@/components/suggested-badge";
import { TypeMarkSticker } from "@/components/ink/type-mark";
import {
  cardSize,
  cardTilt,
  DROP_FROM,
  DROP_MS,
  dropDelay,
  SQUASH_MS,
} from "@/lib/shelf-layout";
import type { MarkKind } from "@/lib/ink/strokes";

/** The drop curve from the spec. */
const DROP_EASING = Easing.bezier(0.2, 0.85, 0.25, 1);

export type StandingCardProps = {
  imageUrl?: string | null;
  /** Shown instead of an image for a note, and for a link with no picture. */
  title?: string;
  mark: MarkKind;
  aspectRatio?: number;
  /** Position in its row: fixes the lean and the drop's turn in the stagger. */
  index?: number;
  suggested?: boolean;
  /** A note stands as an amber slip rather than a white matte. */
  note?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  clock?: SharedValue<number>;
  testID?: string;
};

export const StandingCard = memo(function StandingCard({
  imageUrl,
  title,
  mark,
  aspectRatio,
  index = 0,
  suggested = false,
  note = false,
  onPress,
  onLongPress,
  accessibilityLabel,
  clock,
  testID,
}: StandingCardProps) {
  const reduced = useReducedMotion();
  const { width, height } = cardSize(aspectRatio);
  const tilt = cardTilt(index);

  const drop = useSharedValue(reduced ? 1 : 0);
  const squash = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      drop.value = 1;
      return;
    }
    const delay = dropDelay(index);
    drop.value = 0;
    drop.value = withDelay(
      delay,
      withTiming(1, { duration: DROP_MS, easing: DROP_EASING }),
    );
    squash.value = 0;
    squash.value = withDelay(
      delay + DROP_MS - SQUASH_MS,
      withSequence(
        withTiming(1, {
          duration: SQUASH_MS * 0.4,
          easing: Easing.out(Easing.quad),
        }),
        withTiming(0, {
          duration: SQUASH_MS * 0.6,
          easing: Easing.out(Easing.quad),
        }),
      ),
    );
  }, [index, reduced, drop, squash]);

  const style = useAnimatedStyle(() => ({
    // Opacity is done by 60% of the drop, so the card is solid before it lands.
    opacity: Math.min(1, drop.value / 0.6),
    transform: [
      { translateY: DROP_FROM * (1 - drop.value) },
      { rotate: `${tilt * drop.value - 2 * (1 - drop.value)}deg` },
      { scaleX: 1 + 0.03 * squash.value },
      { scaleY: 1 - 0.05 * squash.value },
    ],
  }));

  const body =
    note || !imageUrl ? (
      <View style={[styles.face, note ? styles.noteFace : styles.textFace]}>
        <Text
          style={note ? styles.noteText : styles.faceText}
          numberOfLines={note ? 5 : 3}
        >
          {title ?? ""}
        </Text>
      </View>
    ) : (
      <Image
        source={{ uri: imageUrl }}
        style={styles.image}
        contentFit="cover"
        transition={160}
      />
    );

  return (
    <Animated.View
      style={[styles.wrap, { width, height }, style]}
      testID={testID}
    >
      <Pressable
        style={styles.matte}
        onPress={onPress}
        onLongPress={onLongPress}
        disabled={!onPress && !onLongPress}
        accessibilityRole={onPress ? "button" : "image"}
        accessibilityLabel={accessibilityLabel ?? title}
      >
        {body}
      </Pressable>
      <View style={styles.sticker} pointerEvents="none">
        <TypeMarkSticker kind={mark} clock={clock} seed={index} />
      </View>
      {suggested ? (
        <View style={styles.badge} pointerEvents="none">
          <SuggestedBadge size={26} />
        </View>
      ) : null}
    </Animated.View>
  );
});

const styles = StyleSheet.create((theme) => ({
  wrap: {
    // A card pivots where it touches the shelf, not around its middle.
    transformOrigin: "bottom center",
  },
  matte: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    padding: 4,
    shadowColor: "#2b2418",
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
  },
  image: { flex: 1, borderRadius: 6 },
  face: { flex: 1, borderRadius: 6, padding: 8, justifyContent: "flex-end" },
  textFace: { backgroundColor: theme.colors.surfaceMuted },
  noteFace: {
    backgroundColor: theme.colors.primarySoft,
    justifyContent: "flex-start",
  },
  faceText: {
    fontFamily: theme.fonts.medium,
    fontSize: 11,
    lineHeight: 14,
    color: theme.colors.foreground,
  },
  noteText: {
    fontFamily: theme.fonts.medium,
    fontSize: 10,
    lineHeight: 13,
    color: theme.colors.foreground,
  },
  sticker: { position: "absolute", left: -8, top: -8 },
  badge: { position: "absolute", right: -8, top: -8 },
}));
