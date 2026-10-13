import { useEffect } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useUnistyles } from "react-native-unistyles";

// Shelvr's loaders. The splash sews saves onto a shelf with a thread and ends
// on a row of stitches; every later wait picks up the same thread. Three
// sizes: the S sewing itself for a whole screen (`stitch-mark.tsx`, kept apart
// because it needs Skia), a ring of stitches in place of a small spinner, and
// three stitches sewing in a row inside a button.
// With Reduce Motion on, each one holds its finished, still frame.

/**
 * Where each loader's clock rests under Reduce Motion: every one is fully
 * sewn and not yet fading by this point of its loop.
 */
const STILL_FRAME = 0.75;

/**
 * A 0 → 1 clock that loops for as long as the loader is on screen. Pass a
 * module-level `easing`: a new function on each render restarts the loop.
 */
export function useLoop(period: number, easing = Easing.linear) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(reducedMotion ? STILL_FRAME : 0);
  useEffect(() => {
    if (reducedMotion) {
      progress.value = STILL_FRAME;
      return;
    }
    progress.value = 0;
    // The startup check above decides Reduce Motion. The animations opt out of
    // the system flag: if it is switched on mid-session, a System animation
    // would jump to 1, where the row and the mark have faded out.
    progress.value = withRepeat(
      withTiming(1, {
        duration: period,
        easing,
        reduceMotion: ReduceMotion.Never,
      }),
      -1,
      false,
      undefined,
      ReduceMotion.Never,
    );
    return () => cancelAnimation(progress);
  }, [easing, period, progress, reducedMotion]);
  return progress;
}

/**
 * The default stitch color. On light paper the brand amber is too faint for a
 * small loader, so light mode sews in the deeper amber the app uses for text.
 */
function useStitchTint(color: string | undefined) {
  const { theme, rt } = useUnistyles();
  if (color) return color;
  return rt.themeName === "light"
    ? theme.colors.primaryText
    : theme.colors.primary;
}

const RING_STITCHES = 8;

/**
 * A ring of stitches turning in place, brightest at its leading stitch. Drop-in
 * for a small `ActivityIndicator`.
 */
export function StitchRing({
  color,
  size = 18,
  style,
}: {
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const tint = useStitchTint(color);
  const progress = useLoop(1100);
  const spin = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 360}deg` }],
  }));
  const thickness = Math.max(2, Math.round(size * 0.13));
  const length = size * 0.3;
  const radius = (size - thickness) / 2;
  return (
    <Animated.View
      style={[{ width: size, height: size }, spin, style]}
      accessibilityRole="progressbar"
    >
      {Array.from({ length: RING_STITCHES }, (_, index) => (
        <View
          key={index}
          style={{
            position: "absolute",
            left: (size - length) / 2,
            top: (size - thickness) / 2,
            width: length,
            height: thickness,
            borderRadius: thickness / 2,
            backgroundColor: tint,
            opacity: 0.2 + (0.8 * (index + 1)) / RING_STITCHES,
            transform: [
              { rotate: `${(index * 360) / RING_STITCHES}deg` },
              { translateY: -radius },
            ],
          }}
        />
      ))}
    </Animated.View>
  );
}

const ROW_STITCHES = 3;

function RowStitch({
  index,
  progress,
  color,
}: {
  index: number;
  progress: SharedValue<number>;
  color: string;
}) {
  const sew = useAnimatedStyle(() => {
    const from = index * 0.16;
    return {
      opacity: interpolate(progress.value, [0.8, 1], [1, 0], "clamp"),
      transform: [
        {
          scaleX: interpolate(
            progress.value,
            [from, from + 0.28],
            [0, 1],
            "clamp",
          ),
        },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        {
          width: 12,
          height: 3,
          borderRadius: 1.5,
          backgroundColor: color,
          transformOrigin: "left",
        },
        sew,
      ]}
    />
  );
}

/** Three stitches sewing left to right. For busy buttons. */
export function StitchRow({ color }: { color?: string }) {
  const tint = useStitchTint(color);
  const progress = useLoop(1200);
  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
      accessibilityRole="progressbar"
    >
      {Array.from({ length: ROW_STITCHES }, (_, index) => (
        <RowStitch key={index} index={index} progress={progress} color={tint} />
      ))}
    </View>
  );
}
