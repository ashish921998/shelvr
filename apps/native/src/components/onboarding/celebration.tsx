import { AppSymbolIcon } from "@/components/symbol";
import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// The one place onboarding celebrates: a badge that pops in with a little
// overshoot, a ring that pulses out of it, and a burst of confetti. It is
// louder than the rest of the app on purpose, and it plays once. With Reduce
// Motion on, the timing jumps to its end, so the badge shows with no burst.

const BADGE = 88;
const BURST_MS = 1300;
const BURST_DELAY_MS = 140;
const PIECE_COUNT = 26;

type Piece = {
  dx: number;
  dy: number;
  size: number;
  spin: number;
  round: boolean;
  tone: number;
};

// Fixed, not random: the burst looks the same every time and renders the
// same on a re-render.
const PIECES: Piece[] = Array.from({ length: PIECE_COUNT }, (_, index) => {
  const angle =
    (index / PIECE_COUNT) * Math.PI * 2 + ((index * 37) % 10) * 0.05;
  const distance = 110 + ((index * 53) % 90);
  return {
    dx: Math.cos(angle) * distance,
    // Biased upward, so the burst reads as thrown rather than dropped.
    dy: Math.sin(angle) * distance - 40,
    size: 7 + (index % 3) * 3,
    spin: (index % 2 === 0 ? 1 : -1) * (200 + ((index * 29) % 220)),
    round: index % 3 === 0,
    tone: index % 4,
  };
});

const POP = ZoomIn.springify()
  .damping(9)
  .stiffness(170)
  .reduceMotion(ReduceMotion.System);

function ConfettiPiece({
  piece,
  progress,
  color,
}: {
  piece: Piece;
  progress: SharedValue<number>;
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const travel = 1 - Math.pow(1 - p, 3);
    return {
      opacity: p === 0 ? 0 : p < 0.65 ? 1 : 1 - (p - 0.65) / 0.35,
      transform: [
        { translateX: piece.dx * travel },
        // Thrown out fast, then pulled down.
        { translateY: piece.dy * travel + 170 * p * p },
        { rotate: `${piece.spin * p}deg` },
        { scale: 1 - 0.35 * p },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.piece,
        {
          width: piece.size,
          height: piece.round ? piece.size : piece.size * 1.7,
          borderRadius: piece.round ? piece.size / 2 : 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

/** A check badge that pops in under a burst of confetti. Decorative: the
 * headline beside it carries the meaning for a screen reader. */
export function CelebrationBadge() {
  const { theme } = useUnistyles();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      BURST_DELAY_MS,
      withTiming(1, {
        duration: BURST_MS,
        easing: Easing.linear,
        reduceMotion: ReduceMotion.System,
      }),
    );
  }, [progress]);

  const ring = useAnimatedStyle(() => {
    const p = Math.min(1, progress.value / 0.55);
    return {
      opacity: progress.value === 0 ? 0 : 0.45 * (1 - p),
      transform: [{ scale: 1 + 1.1 * p }],
    };
  });

  const tones = [
    theme.colors.primary,
    theme.colors.primaryText,
    theme.colors.foreground,
    theme.colors.primarySoft,
  ];

  return (
    <View
      style={styles.wrap}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[styles.ring, ring]} />
      <View style={styles.burst} pointerEvents="none">
        {PIECES.map((piece, index) => (
          <ConfettiPiece
            key={index}
            piece={piece}
            progress={progress}
            color={tones[piece.tone]}
          />
        ))}
      </View>
      <Animated.View entering={POP} style={styles.badge}>
        <AppSymbolIcon
          name="checkmark"
          size={38}
          tintColor={theme.colors.primaryForeground}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    width: BADGE,
    height: BADGE,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
  ring: {
    position: "absolute",
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    borderWidth: 3,
    borderColor: theme.colors.primary,
  },
  // A zero-size anchor at the badge's centre; the pieces fly out of it.
  burst: {
    position: "absolute",
    width: 0,
    height: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  piece: {
    position: "absolute",
  },
}));
