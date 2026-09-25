// The save, in your hand. An item page is the opposite moment from a shelf:
// you have taken the thing down and you are holding it, so there is no shelf
// under it and no props beside it (decision 2026-09-18). The card lies on the
// table at a slight angle with its shadow, and it drops in the same way it
// would land on a board.

import { Image } from "expo-image";
import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { TypeMarkSticker } from "@/components/ink/type-mark";
import { DROP_FROM, DROP_MS } from "@/lib/shelf-layout";
import type { MarkKind } from "@/lib/ink/strokes";

const DROP_EASING = Easing.bezier(0.2, 0.85, 0.25, 1);

/** A photo card lies at 124×140; a clip is phone-shaped at 104×176. */
const TABLE_CARD = { width: 124, height: 140 } as const;
const TABLE_CLIP = { width: 104, height: 176 } as const;

export function TableCard({
  imageUrl,
  mark,
  clip = false,
  accessibilityLabel,
}: {
  imageUrl?: string | null;
  mark: MarkKind;
  /** A reel or short: the only phone-shaped card. */
  clip?: boolean;
  accessibilityLabel?: string;
}) {
  const reduced = useReducedMotion();
  const drop = useSharedValue(reduced ? 1 : 0);
  const size = clip ? TABLE_CLIP : TABLE_CARD;

  useEffect(() => {
    if (reduced) {
      drop.value = 1;
      return;
    }
    drop.value = 0;
    drop.value = withTiming(1, { duration: DROP_MS, easing: DROP_EASING });
  }, [reduced, drop]);

  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, drop.value / 0.6),
    transform: [
      { translateY: DROP_FROM * (1 - drop.value) },
      { rotate: `${-2 * drop.value}deg` },
    ],
  }));

  return (
    <Animated.View style={[styles.wrap, size, style]}>
      <View style={[styles.matte, clip && styles.clipMatte]}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            contentFit="cover"
            accessibilityLabel={accessibilityLabel}
          />
        ) : (
          <View style={[styles.image, styles.blank]} />
        )}
      </View>
      <View style={styles.sticker} pointerEvents="none">
        <TypeMarkSticker kind={mark} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {},
  matte: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    padding: 4,
    shadowColor: "#2b2418",
    shadowOpacity: 0.6,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 18 },
    elevation: 8,
  },
  clipMatte: { borderRadius: 10 },
  image: { flex: 1, borderRadius: 6 },
  blank: { backgroundColor: theme.colors.surfaceMuted },
  sticker: { position: "absolute", left: -8, top: -8 },
}));
