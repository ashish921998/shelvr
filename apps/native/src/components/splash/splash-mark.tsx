import { Canvas, Group, Path, Skia } from "@shopify/react-native-skia";
import { useMemo } from "react";
import { View } from "react-native";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";

import { cubicBezierEase, span } from "@/lib/splash/composition";
import { TIMELINE } from "./timeline";

// The Shelvr S, popped in over the settled row. Drawn through Skia rather than
// scaled as a bitmap layer so the ribbon stays crisp at the overshoot. The
// tint arrives as a prop so the mark reads against either splash ground.

/**
 * The mark's outline, copied from `assets/shelvr-mark.svg` (viewBox 0 0 1024
 * 1024). Kept as a string because Metro has no SVG loader and the app carries
 * no SVG renderer — Skia parses it directly.
 */
const MARK_PATH =
  "M320 224h400c44.2 0 80 35.8 80 80v176c0 44.2-35.8 80-80 80H416v80h288c44.2 0 80 35.8 80 80s-35.8 80-80 80H304c-44.2 0-80-35.8-80-80V544c0-44.2 35.8-80 80-80h304v-80H320c-44.2 0-80-35.8-80-80s35.8-80 80-80Z";

/**
 * The S's own bounds inside that viewBox. The canvas is cropped to them, so
 * `size` is the height of the glyph itself rather than of a padded square, and
 * the canvas's bottom edge is the S's bottom edge: the lockup sits it on the
 * wordmark's baseline.
 */
const GLYPH_ORIGIN = 224;
const GLYPH_SIZE = 576;

/**
 * Room around the glyph for the pop's overshoot and tilt, which would
 * otherwise be clipped at the canvas edge. The canvas overflows its slot by
 * this much on every side; the slot itself stays glyph-sized for layout.
 */
const BLEED = 0.2;

// A pop with a touch of hand to it: the S arrives small and tilted back,
// overshoots past full size, then settles square.
const START_SCALE = 0.6;
const PEAK_SCALE = 1.06;
const START_ROTATION = (-8 * Math.PI) / 180;
const PEAK_ROTATION = (2 * Math.PI) / 180;
/** Progress at which the overshoot peaks. */
const PEAK_AT = 0.6;

export function SplashMark({
  size,
  clock,
  color,
  still = false,
}: {
  /** Height of the S itself, which the lockup matches to the wordmark. */
  size: number;
  /** Seconds elapsed since the animation started. */
  clock: SharedValue<number>;
  /** The mark's tint, from the active splash theme. */
  color: string;
  /**
   * Skip the pop and render the settled S from the first frame. Reduced
   * motion still runs the clock, so the mark has to be told to ignore it
   * rather than waiting out its beat.
   */
  still?: boolean;
}) {
  const path = useMemo(() => {
    const parsed = Skia.Path.MakeFromSVGString(MARK_PATH);
    // Skia returns null only for malformed path data; this string is a literal.
    return parsed ?? Skia.Path.Make();
  }, []);

  const bleed = Math.ceil(size * BLEED);
  const canvasSize = size + bleed * 2;

  const transform = useDerivedValue(() => {
    const progress = still
      ? 1
      : cubicBezierEase(
          span(
            clock.get(),
            TIMELINE.markFrom,
            TIMELINE.markFrom + TIMELINE.markDuration,
          ),
          0.3,
          0.9,
          0.3,
          1,
        );
    const toPeak = span(progress, 0, PEAK_AT);
    const settling = span(progress, PEAK_AT, 1);
    const scale =
      START_SCALE +
      (PEAK_SCALE - START_SCALE) * toPeak +
      (1 - PEAK_SCALE) * settling;
    const rotate =
      START_ROTATION +
      (PEAK_ROTATION - START_ROTATION) * toPeak +
      (0 - PEAK_ROTATION) * settling;

    return [
      { translateX: canvasSize / 2 },
      { translateY: canvasSize / 2 },
      { rotate },
      { scale },
      { translateX: -size / 2 },
      { translateY: -size / 2 },
      { scale: size / GLYPH_SIZE },
      { translateX: -GLYPH_ORIGIN },
      { translateY: -GLYPH_ORIGIN },
    ];
  });

  // Opacity leads the transform, so the S is already visible while it is still
  // growing rather than snapping on at full size.
  const opacity = useDerivedValue(() =>
    still
      ? 1
      : span(
          clock.get(),
          TIMELINE.markFrom,
          TIMELINE.markFrom + TIMELINE.markDuration * PEAK_AT,
        ),
  );

  // The slot has no in-flow children, so a baseline-aligned row reads its
  // bottom edge as its baseline — which is where the S stands.
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <Canvas
        style={{
          position: "absolute",
          left: -bleed,
          top: -bleed,
          width: canvasSize,
          height: canvasSize,
        }}
        pointerEvents="none"
      >
        <Group transform={transform} opacity={opacity}>
          <Path path={path} color={color} />
        </Group>
      </Canvas>
    </View>
  );
}
