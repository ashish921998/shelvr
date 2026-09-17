import { Canvas, Group, Path, Skia } from "@shopify/react-native-skia";
import { useMemo } from "react";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";

import { cubicBezierEase, span } from "@/lib/splash/composition";
import { SPLASH_MARK, TIMELINE } from "./timeline";

// The Shelvr S, popped in over the settled row. Drawn through Skia rather than
// scaled as a bitmap layer so the ribbon stays crisp at the overshoot, and
// tinted from a literal because the splash ground never follows the theme.

/**
 * The mark's outline, copied from `assets/shelvr-mark.svg` (viewBox 0 0 1024
 * 1024). Kept as a string because Metro has no SVG loader and the app carries
 * no SVG renderer — Skia parses it directly.
 */
const MARK_PATH =
  "M320 224h400c44.2 0 80 35.8 80 80v176c0 44.2-35.8 80-80 80H416v80h288c44.2 0 80 35.8 80 80s-35.8 80-80 80H304c-44.2 0-80-35.8-80-80V544c0-44.2 35.8-80 80-80h304v-80H320c-44.2 0-80-35.8-80-80s35.8-80 80-80Z";

const MARK_VIEWBOX = 1024;

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
}: {
  size: number;
  /** Seconds elapsed since the animation started. */
  clock: SharedValue<number>;
}) {
  const path = useMemo(() => {
    const parsed = Skia.Path.MakeFromSVGString(MARK_PATH);
    // Skia returns null only for malformed path data; this string is a literal.
    return parsed ?? Skia.Path.Make();
  }, []);

  const scaleToFit = size / MARK_VIEWBOX;

  const transform = useDerivedValue(() => {
    const progress = cubicBezierEase(
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
      { translateX: size / 2 },
      { translateY: size / 2 },
      { rotate },
      { scale },
      { translateX: -size / 2 },
      { translateY: -size / 2 },
      { scale: scaleToFit },
    ];
  });

  // Opacity leads the transform, so the S is already visible while it is still
  // growing rather than snapping on at full size.
  const opacity = useDerivedValue(() =>
    span(
      clock.get(),
      TIMELINE.markFrom,
      TIMELINE.markFrom + TIMELINE.markDuration * PEAK_AT,
    ),
  );

  return (
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
      <Group transform={transform} opacity={opacity}>
        <Path path={path} color={SPLASH_MARK} />
      </Group>
    </Canvas>
  );
}
